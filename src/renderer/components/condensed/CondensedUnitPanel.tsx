/* The condensed panel of one unit — an area or a project (stories 038/043,
   made level-agnostic in 045, D3). Everything level-specific arrives as a
   prop: which unit is addressed (`unit` + `slug`), which routing entry a run
   needs (`task`), which i18n block the copy comes from (`keyPrefix`), and the
   unit's `title` for the messages that name it. The panel holds no
   level-specific string, path or task literal, so both levels run the same
   code path instead of two copies that can drift apart.

   What it does: reading the existing artifact, the honest "no model
   configured" state, triggering a run, and — once a proposal comes back —
   showing the diff with Accept and Reject. Nothing is written until Accept is
   clicked (a run alone never writes); a stale-hash accept discards the
   proposal and leaves a toast instead of attempting any merge. Reject is
   never a bare dismiss — it only opens `CondenseRejectDialog`, and the
   proposal disappears only once a non-empty reason actually lands (038, D8).

   Four states, in priority order:
   1. No model routed for `task` → `LlmMissing` alone, no trigger anywhere
      (not even disabled) — but an existing artifact is still readable below
      it, since reading never needs a model (Guardrail 1).
   2. No artifact yet, model available → an empty state plus the trigger.
   3. An artifact exists, model available → the artifact plus the trigger,
      so the user can re-run.
   4. A run is going → the trigger disabled, with a spinner next to it.

   A failed run (`run.isError`) never replaces the artifact view — the error
   sits alongside whatever was already showing, and the trigger stays
   available to retry. */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { diffLines } from '@core/condense/diff';
import type { CondenseProposal, CondenseUnit, TaskKind } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Spinner } from '../../atoms/Spinner';
import { CondenseDeleteDialog } from '../CondenseDeleteDialog';
import { CondenseDiff } from '../CondenseDiff';
import { CondenseRejectDialog } from '../CondenseRejectDialog';
import { EmptyState } from '../EmptyState';
import { ErrorState } from '../ErrorState';
import { LlmMissing } from '../LlmMissing';
import { renderMarkdown } from '../markdown-render';
import { Skeleton } from '../Skeleton';
import { useLanguage, useT } from '../../i18n';
import { IpcCallError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import {
  useCondenseAccept,
  useCondenseDelete,
  useCondenseReject,
  useCondenseRun,
  useCondensedArea,
} from '../../lib/queries/condense';
import { useTaskRouted } from '../../lib/queries/llm';
import { pushToast } from '../../lib/toast';

export interface CondensedUnitPanelProps {
  /** Which level is condensed — the discriminator every channel here carries. */
  unit: CondenseUnit;
  slug: string;
  /** The unit's own title, named in the conflict messages and the error card. */
  title: string;
  /** The routing entry a run of this level needs; named by `LlmMissing`. */
  task: TaskKind;
  /** i18n key block this panel's copy comes from, e.g. `notes.condensed`. */
  keyPrefix: string;
}

/** A wikilink in a condensed page renders as its label, not a link — this
    panel has no target to resolve it against (D6 doesn't add citation
    navigation for condensed content), so the raw target would be worse. */
function plainWikilink(target: string, label: string, key: string): ReactNode {
  return <span key={key}>{label.length > 0 ? label : target}</span>;
}

export function CondensedUnitPanel({
  unit,
  slug,
  title,
  task,
  keyPrefix,
}: CondensedUnitPanelProps) {
  const t = useT();
  const language = useLanguage();
  const modelRouted = useTaskRouted(task);
  const artifact = useCondensedArea(unit, slug);
  const run = useCondenseRun();
  const accept = useCondenseAccept();
  const reject = useCondenseReject();
  const del = useCondenseDelete();
  const [proposal, setProposal] = useState<CondenseProposal | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectError, setRejectError] = useState<unknown>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  /** This level's copy: every key below hangs off the caller's `keyPrefix`. */
  const key = (suffix: string): string => `${keyPrefix}.${suffix}`;

  const trigger = (): void => {
    if (run.isPending) return;
    run.mutate({ unit, slug }, { onSuccess: setProposal });
  };

  const diff = useMemo(
    () => (proposal ? diffLines(proposal.before, proposal.after) : null),
    [proposal],
  );

  const acceptProposal = (): void => {
    if (proposal === null || accept.isPending) return;
    accept.mutate(proposal, {
      onSuccess: () => setProposal(null),
      onError: (error) => {
        const code = error instanceof IpcCallError ? error.code : 'unknown';
        if (code === 'conflict') {
          setProposal(null);
          pushToast('error', { message: key('accept.conflict'), values: { subject: title } });
        }
      },
    });
  };

  const rejectProposal = (reason: string): void => {
    if (reject.isPending) return;
    setRejectError(null);
    reject.mutate(
      { unit, slug, reason },
      {
        onSuccess: () => {
          setRejectOpen(false);
          setProposal(null);
        },
        onError: (error) => {
          const code = error instanceof IpcCallError ? error.code : 'unknown';
          if (code === 'conflict') {
            setRejectOpen(false);
            setProposal(null);
            pushToast('error', { message: key('accept.conflict'), values: { subject: title } });
            return;
          }
          /* Any other error keeps the dialog open — the story's requirement
             is that a sentence must actually land before the proposal can
             disappear, so a failed write must not silently discard it. */
          setRejectError(error);
        },
      },
    );
  };

  const deleteArtifact = (expectedHash: string): void => {
    if (del.isPending) return;
    setDeleteError(null);
    del.mutate(
      { unit, slug, expectedHash },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          // Clears any open proposal — one built before the delete would
          // otherwise sit there offering to write the deleted directives back.
          setProposal(null);
          pushToast('success', { message: key('delete.done') });
        },
        onError: (error) => {
          const code = error instanceof IpcCallError ? error.code : 'unknown';
          if (code === 'conflict') {
            setDeleteOpen(false);
            pushToast('error', { message: key('delete.conflict'), values: { subject: title } });
            return;
          }
          /* Any other error keeps the dialog open and the artifact readable
             underneath it — a failed delete must not silently discard it. */
          setDeleteError(error);
        },
      },
    );
  };

  /* The artifact's path comes from the read, it is never re-derived here: a
     project's path needs the scope, which only the main side resolves
     (`resolveCondenseUnit()`), and it is the exact path a delete acts on. */
  const artifactBlock = (data: NonNullable<typeof artifact.data>): ReactNode => (
    <div className="sb-condensed-artifact">
      <p className="sb-condensed-meta sb-mono">
        {t(key('meta.condensedAt'), { date: formatDate(data.condensedAt, language) })}
        {data.sources.length > 0
          ? ` · ${t(key('meta.sources'), { count: data.sources.length })}`
          : ''}
      </p>
      <div className="sb-md">{renderMarkdown(data.content, { wikilink: plainWikilink })}</div>
      <span className="gs-hint">{t(key('notEvidence'))}</span>
      <div className="sb-condensed-actions">
        <Button variant="danger" icon="trash-2" onClick={() => setDeleteOpen(true)}>
          {t(key('delete.action'))}
        </Button>
      </div>
      <CondenseDeleteDialog
        open={deleteOpen}
        path={data.path}
        busy={del.isPending}
        error={deleteError}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteError(null);
        }}
        onSubmit={() => deleteArtifact(data.hash)}
      />
    </div>
  );

  // ── State 1: no model routed ─────────────────────────────────────────────
  if (modelRouted === false) {
    return (
      <div className="sb-condensed">
        <LlmMissing task={task} tone="card" />
        {artifact.isError ? (
          <ErrorState error={artifact.error} variant="secondary" subject={title} scrollIntoView />
        ) : artifact.data ? (
          artifactBlock(artifact.data)
        ) : null}
      </div>
    );
  }

  // Still working out whether a model is routed — a loading state, not "no
  // model" (the `useTaskRouted` contract: `undefined` means "still unknown").
  if (modelRouted === undefined) {
    return <Skeleton lines={2} height={20} />;
  }

  const running = run.isPending;

  return (
    <div className="sb-condensed">
      {artifact.isPending ? (
        <Skeleton lines={2} height={20} />
      ) : artifact.isError ? (
        // The main process refused to resolve this unit (e.g. a project's
        // frontmatter disagrees with its folder) — an honest error, never
        // the "not condensed yet" empty state, which would claim nothing was
        // ever condensed when a real artifact may sit on disk unreadable.
        <ErrorState error={artifact.error} variant="secondary" subject={title} scrollIntoView />
      ) : artifact.data ? (
        artifactBlock(artifact.data)
      ) : (
        <EmptyState icon="layers" title={t(key('empty.title'))} body={t(key('empty.body'))} />
      )}

      {run.isError ? (
        <ErrorState error={run.error} variant="secondary" subject={title} scrollIntoView />
      ) : null}

      {proposal && diff ? (
        <div className="sb-condensed-proposal">
          <CondenseDiff rows={diff.rows} />
          <div className="sb-condensed-actions">
            <Button
              icon="check"
              loading={accept.isPending}
              disabled={accept.isPending}
              onClick={acceptProposal}
            >
              {t(key('accept'))}
            </Button>
            <Button
              variant="secondary"
              icon="thumbs-down"
              disabled={accept.isPending}
              onClick={() => setRejectOpen(true)}
            >
              {t(key('reject'))}
            </Button>
          </div>
        </div>
      ) : null}

      <CondenseRejectDialog
        open={rejectOpen}
        busy={reject.isPending}
        error={rejectError}
        onClose={() => {
          setRejectOpen(false);
          setRejectError(null);
        }}
        onSubmit={rejectProposal}
      />

      <div className="sb-condensed-actions">
        <Button icon="sparkles" loading={running} disabled={running} onClick={trigger}>
          {artifact.data ? t(key('triggerAgain')) : t(key('trigger'))}
        </Button>
        {running ? (
          <span className="sb-condensed-running">
            <Spinner size={14} />
            {t(key('running'))}
          </span>
        ) : null}
      </div>
    </div>
  );
}
