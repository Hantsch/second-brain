/* The rename dialog (story 063, D5).
 *
 * Unlike `DiscardPageAction`, which plans once on open because its one input
 * (`keep`) never changes inside the dialog, this dialog's plan must reflect
 * the title as it stands right now — so it re-plans as the user edits it.
 * `useModuleRenamePlan` (`lib/queries/modules.ts`) is a query keyed by the
 * typed title rather than a manually triggered mutation: TanStack Query's
 * key-based cache already discards a stale in-flight response the instant a
 * newer title supersedes it, which a `discardPlan`-style mutation would have
 * to reimplement by hand for a moving target. `useSettledTitle` below keeps
 * that from firing on every keystroke.
 *
 * Nothing is written before the explicit confirm click, and a conflict from
 * the apply call leaves the dialog open with its own wording — the plan is
 * refetched right away so the next confirm click uses a fresh fingerprint. */

import { useEffect, useState } from 'react';
import type {
  KnowledgeModule,
  ModuleLifecycleChange,
  ModuleLifecycleChangeKind,
} from '@shared/types';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { Input } from '../../atoms/Input';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { IpcCallError } from '../../lib/api';
import { useModuleMutations, useModuleRenamePlan, useModuleUndo } from '../../lib/queries/modules';
import { pushToast } from '../../lib/toast';

export interface RenameModuleDialogProps {
  open: boolean;
  module: KnowledgeModule;
  onClose: () => void;
  /** Runs once the rename has been confirmed and written, with the resulting slug. */
  onRenamed: (newSlug: string) => void;
}

const PLAN_DEBOUNCE_MS = 400;

/** Every kind a rename can touch (`ModuleLifecycleChangeKind`), in the order
    they read best grouped — the file itself first, then what it cascades to. */
const CHANGE_KINDS: readonly ModuleLifecycleChangeKind[] = [
  'module-file',
  'page',
  'wikilink',
  'agents-md',
  'catalog',
  'ingest-protocol',
  'project',
  'dump',
];

/** Settles the typed title before it drives a fresh plan request. Mirrors
    `useSettledPath` in `lib/queries/capture.ts`, but always waits the full
    delay — there is no "first value" here that should skip the debounce the
    way a first dump selection does. */
function useSettledTitle(title: string, delayMs: number): string {
  const [settled, setSettled] = useState(title);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(title), delayMs);
    return () => clearTimeout(timer);
  }, [title, delayMs]);
  return settled;
}

function groupByKind(
  changes: readonly ModuleLifecycleChange[],
): Partial<Record<ModuleLifecycleChangeKind, ModuleLifecycleChange[]>> {
  const grouped: Partial<Record<ModuleLifecycleChangeKind, ModuleLifecycleChange[]>> = {};
  for (const change of changes) {
    const bucket = grouped[change.kind] ?? [];
    bucket.push(change);
    grouped[change.kind] = bucket;
  }
  return grouped;
}

export function RenameModuleDialog({ open, module, onClose, onRenamed }: RenameModuleDialogProps) {
  const t = useT();
  const [title, setTitle] = useState(module.title);
  const settledTitle = useSettledTitle(title, PLAN_DEBOUNCE_MS).trim();
  const plan = useModuleRenamePlan(module.slug, settledTitle, open && settledTitle.length > 0);
  const mutations = useModuleMutations();
  const undo = useModuleUndo();

  const confirm = (): void => {
    if (plan.data === undefined) return;
    mutations.rename.mutate(
      { slug: module.slug, title: settledTitle, fingerprint: plan.data.fingerprint },
      {
        onSuccess: (result) => {
          onRenamed(result.newSlug);
          pushToast('success', {
            message: 'modules.rename.done',
            values: { title: result.title },
            action: {
              label: 'common.undo',
              run: () =>
                undo.mutate(result.undoToken, {
                  onSuccess: (undone) => {
                    if (undone.kept.length > 0) {
                      pushToast('warn', { message: 'modules.rename.undoPartial' });
                    }
                  },
                  onError: () => pushToast('error', { message: 'modules.rename.undoFailed' }),
                }),
            },
          });
        },
        onError: (error) => {
          /* The plan's fingerprint is stale — a fresh one is what lets the
             user simply try confirm again, no extra step. */
          if (error instanceof IpcCallError && error.code === 'conflict') void plan.refetch();
        },
      },
    );
  };

  const conflict =
    mutations.rename.error instanceof IpcCallError && mutations.rename.error.code === 'conflict';
  const grouped = groupByKind(plan.data?.changes ?? []);
  const blocked = plan.data?.blocked ?? null;
  /* A title-only plan whose title equals the old one is a no-op the core
     refuses with `WikiError('invalid', ...)` — not a title-only plan that
     genuinely changes the title, which is a legitimate, confirmable rename. */
  const noOpTitle =
    plan.data !== undefined && plan.data.titleOnly && plan.data.title === plan.data.oldTitle;
  /* While the debounce hasn't settled yet, the plan shown still describes the
     previous title — confirming now would silently apply that stale title
     instead of the one currently visible in the input. */
  const planStale = title.trim() !== settledTitle;
  const confirmDisabled =
    settledTitle.length === 0 ||
    plan.data === undefined ||
    plan.error !== null ||
    blocked !== null ||
    noOpTitle ||
    planStale;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('modules.rename.title')}
      description={t('modules.rename.what')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            icon="pencil"
            disabled={confirmDisabled}
            loading={mutations.rename.isPending}
            onClick={confirm}
          >
            {t('modules.rename.submit')}
          </Button>
        </>
      }
    >
      <div className="sb-discard">
        <Input
          label={t('modules.rename.name')}
          value={title}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />

        {settledTitle.length === 0 ? null : plan.error !== null ? (
          <ErrorState error={plan.error} onRetry={() => void plan.refetch()} variant="secondary" />
        ) : plan.data === undefined ? (
          <Skeleton lines={3} height={16} />
        ) : (
          <>
            <p className="sb-finding-note">
              {plan.data.titleOnly
                ? t('modules.rename.titleOnly')
                : t('modules.rename.moves', { from: plan.data.slug, to: plan.data.newSlug })}
            </p>

            {/* Scrolls on its own: a real module's page count is unbounded, and
                the dialog otherwise grows taller than the app window and
                leaves the confirm button unreachable — the input above and
                the sentences below stay visible regardless. */}
            <div className="sb-modulerename-changes">
              {CHANGE_KINDS.map((kind) => {
                const entries = grouped[kind];
                if (entries === undefined || entries.length === 0) return null;
                return (
                  <div key={kind}>
                    <p className="sb-finding-note">{t(`modules.rename.kind.${kind}`)}</p>
                    <ul className="sb-lines">
                      {entries.map((change) => (
                        <li key={change.path} className="sb-line">
                          {change.summary}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            {blocked === null ? null : (
              <p className="sb-finding-note" role="alert">
                {t(`modules.rename.blocked.${blocked}`)}
              </p>
            )}
          </>
        )}

        {conflict ? (
          <p className="sb-finding-note" role="alert">
            {t('modules.rename.conflict')}
          </p>
        ) : mutations.rename.error === null ? null : (
          <ErrorState error={mutations.rename.error} variant="secondary" />
        )}
      </div>
    </Dialog>
  );
}
