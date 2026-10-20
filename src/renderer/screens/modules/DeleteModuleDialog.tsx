/* The delete confirmation dialog (story 063, D6).
 *
 * Unlike `RenameModuleDialog`, there is no input the user types that would
 * change the plan — the slug is fixed the moment the dialog opens. The plan
 * is therefore fetched once, the same "manually triggered mutation, not a
 * debounced query" shape `DiscardPageAction`'s `openDialog` uses, not
 * `RenameModuleDialog`'s `useModuleRenamePlan` query. `ModuleActions` keys
 * this component by the module's slug when it opens, so a fresh mount here
 * *is* "the dialog just opened" — the effect below fires exactly once per
 * open, mirroring `openDialog`'s single `discardPlan.mutate` call.
 *
 * Nothing is written before the explicit confirm click, and a conflict from
 * the apply call leaves the dialog open with its own wording — the plan is
 * refetched right away so the next confirm click uses a fresh fingerprint,
 * exactly like `RenameModuleDialog`.
 */

import { useEffect, useState } from 'react';
import type { KnowledgeModule, ModuleDeletePlan } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { IpcCallError } from '../../lib/api';
import { plural } from '../../lib/format';
import { useModuleMutations, useModuleUndo } from '../../lib/queries/modules';
import { pushToast } from '../../lib/toast';

export interface DeleteModuleDialogProps {
  open: boolean;
  module: KnowledgeModule;
  onClose: () => void;
  /** Runs once the delete has been confirmed and written. */
  onDeleted: () => void;
}

export function DeleteModuleDialog({ open, module, onClose, onDeleted }: DeleteModuleDialogProps) {
  const t = useT();
  const [plan, setPlan] = useState<ModuleDeletePlan | null>(null);
  const mutations = useModuleMutations();
  const undo = useModuleUndo();

  /* No direct `setPlan` call here: the effect below fires this on mount,
     when `plan` already starts out `null`, and calling `setState` straight
     from an effect body trips `react-hooks/set-state-in-effect`. `retryPlan`
     below is the version that also clears a stale plan first, for the two
     places (error retry, a conflicted apply) that call it from an event
     handler instead of an effect. */
  const requestPlan = (): void => {
    mutations.deletePlan.mutate(module.slug, { onSuccess: setPlan });
  };

  const retryPlan = (): void => {
    setPlan(null);
    requestPlan();
  };

  useEffect(() => {
    if (!open) return;
    requestPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount: ModuleActions remounts this dialog (keyed by slug) each time it opens, so mount itself is "the dialog just opened", mirroring DiscardPageAction's one-shot plan fetch.
  }, [open]);

  const confirm = (): void => {
    if (plan === null) return;
    mutations.delete.mutate(
      { slug: module.slug, fingerprint: plan.fingerprint },
      {
        onSuccess: (result) => {
          onDeleted();
          pushToast('success', {
            message: 'modules.delete.done',
            values: { title: module.title },
            action: {
              label: 'common.undo',
              run: () =>
                undo.mutate(result.undoToken, {
                  onSuccess: (undone) => {
                    if (undone.kept.length > 0) {
                      pushToast('warn', { message: 'modules.delete.undoPartial' });
                    }
                  },
                  onError: () => pushToast('error', { message: 'modules.delete.undoFailed' }),
                }),
            },
          });
        },
        onError: (error) => {
          /* The plan's fingerprint is stale — refetch right away so the next
             confirm click uses a fresh one, same as `RenameModuleDialog`. */
          if (error instanceof IpcCallError && error.code === 'conflict') retryPlan();
        },
      },
    );
  };

  const conflict =
    mutations.delete.error instanceof IpcCallError && mutations.delete.error.code === 'conflict';
  const blocked = plan?.blocked ?? null;
  const confirmDisabled = plan === null || blocked !== null || mutations.delete.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('modules.delete.title', { title: module.title })}
      description={t('modules.delete.what')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            icon="trash-2"
            disabled={confirmDisabled}
            loading={mutations.delete.isPending}
            onClick={confirm}
          >
            {t('modules.delete.submit')}
          </Button>
        </>
      }
    >
      <div className="sb-discard">
        {plan === null && mutations.deletePlan.error !== null ? (
          <ErrorState error={mutations.deletePlan.error} onRetry={retryPlan} variant="secondary" />
        ) : plan === null ? (
          <Skeleton lines={3} height={16} />
        ) : (
          <>
            <p className="sb-finding-note">
              {plural(plan.pages.length, 'modules.delete.pagesOne', 'modules.delete.pages')}
            </p>

            <div>
              <p className="sb-finding-note">
                {plan.sources.length === 0
                  ? t('modules.delete.sourcesNone')
                  : t('modules.delete.sourcesHeading')}
              </p>
              {plan.sources.length === 0 ? null : (
                <ul className="sb-lines">
                  {plan.sources.map((source) => (
                    <li key={source.path} className="sb-line">
                      {source.outcome === 'undigested'
                        ? t('modules.delete.source.undigested', { path: source.path })
                        : t('modules.delete.source.staysDigested', {
                            path: source.path,
                            module: source.remainingModule ?? '',
                          })}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {plan.brokenLinks.length === 0 ? null : (
              <div>
                <p className="sb-finding-note" role="alert">
                  {plural(
                    plan.brokenLinks.length,
                    'modules.delete.brokenLinksOne',
                    'modules.delete.brokenLinks',
                  )}
                </p>
                <ul className="sb-lines">
                  {plan.brokenLinks.map((link, index) => (
                    <li key={`${link.path}:${index}`} className="sb-line">
                      {t('modules.delete.brokenLink', { path: link.path, target: link.target })}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.projects.length === 0 ? null : (
              <div>
                <p className="sb-finding-note">
                  {plural(
                    plan.projects.length,
                    'modules.delete.projectsOne',
                    'modules.delete.projects',
                  )}
                </p>
                <ul className="sb-lines">
                  {plan.projects.map((project) => (
                    <li key={project.path} className="sb-line">
                      {t('modules.delete.project', { slug: project.slug })}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {blocked === null ? null : (
              <p className="sb-finding-note" role="alert">
                {t(`modules.delete.blocked.${blocked}`)}
              </p>
            )}
          </>
        )}

        {conflict ? (
          <p className="sb-finding-note" role="alert">
            {t('modules.delete.conflict')}
          </p>
        ) : mutations.delete.error === null ? null : (
          <ErrorState error={mutations.delete.error} variant="secondary" />
        )}
      </div>
    </Dialog>
  );
}
