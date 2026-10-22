/* The condensed panel of one unit — an area, a project or a module (stories
   038/043, made level-agnostic in 045, D3). Everything level-specific arrives as a
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
   4. A run is going → the trigger disabled, with a spinner next to it; or it
      is still waiting for the model lane, and says which place it holds.

   A failed run never replaces the artifact view — the error sits alongside
   whatever was already showing, and the trigger stays available to retry.

   Since 073 (D5) none of states 4's information is this component's own: the
   run, its queue position, its failure and the proposal it produced are all
   derived from the session-lived work queue via `useTaskForSubject`. That is
   the whole point — a panel that tracked its own run lost it on unmount, so
   navigating away mid-run and back showed a blank panel and asked for a
   second run. The one thing still read from the mutation is the *queueing*
   failing (`run.isError`): a `condense:run` that throws — the dead end with
   no model routed, AC7 — never creates a task, so there is nothing in the
   queue that could report it. */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { diffLines } from '@core/condense/diff';
import type { IpcError } from '@shared/ipc';
import type { CondenseUnit, TaskKind } from '@shared/types';
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
import { taskFailure, useTaskForSubject } from '../../lib/hooks/use-task-for-subject';
import { qk } from '../../lib/queries/keys';
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
  /** Whether the artifact offers a delete; the module level has none (`condense:delete` refuses it). */
  canDelete?: boolean;
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
  canDelete = true,
}: CondensedUnitPanelProps) {
  const t = useT();
  const language = useLanguage();
  const client = useQueryClient();
  const modelRouted = useTaskRouted(task);
  const artifact = useCondensedArea(unit, slug);
  const run = useCondenseRun();
  const accept = useCondenseAccept();
  const reject = useCondenseReject();
  const del = useCondenseDelete();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectError, setRejectError] = useState<unknown>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  /* The whole run state — waiting, running, failed, finished-with-proposal —
     read from the shared work queue. `<unit>:<slug>` is the exact `subject.ref`
     `condense:run` enqueues with (`src/main/ipc/condense.ts`); the two must
     stay literally identical or nothing here ever finds its task. */
  const current = useTaskForSubject('condense', `${unit}:${slug}`);
  const busy = current.status === 'running' || current.status === 'queued';
  const proposal =
    current.status === 'done' && current.result?.kind === 'condense'
      ? current.result.proposal
      : null;

  /** This level's copy: every key below hangs off the caller's `keyPrefix`. */
  const key = (suffix: string): string => `${keyPrefix}.${suffix}`;

  /* The main side drops a result's payload the moment the user decides about
     it (`TaskResultStore.markBySubject`, called by accept/reject/delete), so
     the cached copy has to go with it — otherwise this panel would keep
     offering a proposal that no longer exists anywhere else. Written, not
     invalidated: the main side has already made this true, so re-asking would
     only cost a round-trip to learn the same thing. */
  const forgetResult = (): void => {
    if (!('task' in current)) return;
    client.setQueryData(qk.tasks.result(current.task.id), null);
  };

  const trigger = (): void => {
    /* `run.isPending` guards only the window between the click and the task
       appearing in the queue — after that, `busy` is what says a run exists. */
    if (busy || run.isPending) return;
    run.mutate({ unit, slug });
  };

  const diff = useMemo(
    () => (proposal ? diffLines(proposal.before, proposal.after) : null),
    [proposal],
  );

  const acceptProposal = (): void => {
    if (proposal === null || accept.isPending) return;
    accept.mutate(proposal, {
      onSuccess: forgetResult,
      onError: (error) => {
        const code = error instanceof IpcCallError ? error.code : 'unknown';
        if (code === 'conflict') {
          forgetResult();
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
          forgetResult();
        },
        onError: (error) => {
          const code = error instanceof IpcCallError ? error.code : 'unknown';
          if (code === 'conflict') {
            setRejectOpen(false);
            forgetResult();
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
          // `condense:delete` drops the stored result for the same reason, so
          // this survives a navigation instead of only clearing the local view.
          forgetResult();
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
      {canDelete ? (
        <>
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
        </>
      ) : null}
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

  /* A run the queue itself failed. `ErrorState` speaks `IpcError`, and that is
     exactly what the task carries in pieces — `error` is the code
     `describeFailure` assigned, `message` the sentence it came with — so the
     two are put back together rather than wrapped in a synthetic `Error`. */
  const failure: IpcError | null =
    current.status === 'failed' ? taskFailure(current.task.error, current.reason) : null;

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

      {/* A run that got queued and then failed (AC8) — stated here, where it
          was started, not only in the task list. The reason stands as its own
          line because `ErrorState` keeps the technical text behind "Show
          details", and "it failed" without the why is half an answer. */}
      {failure !== null ? (
        <>
          <ErrorState error={failure} variant="secondary" subject={title} scrollIntoView />
          {failure.message.length > 0 ? (
            <span className="gs-hint">{t(key('failed.reason'), { reason: failure.message })}</span>
          ) : null}
        </>
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
        <Button icon="sparkles" loading={busy} disabled={busy} onClick={trigger}>
          {artifact.data ? t(key('triggerAgain')) : t(key('trigger'))}
        </Button>
        {current.status === 'running' ? (
          <span className="sb-condensed-running">
            <Spinner size={14} />
            {t(key('running'))}
          </span>
        ) : null}
        {/* Waiting for the model lane, not running (AC6) — no spinner, because
            nothing is turning yet. `queuePosition` is only null for a task
            that is no longer queued (`WorkTask`), so there is nothing to say
            in that case that the disabled trigger doesn't already say. */}
        {current.status === 'queued' && current.queuePosition !== null ? (
          <span className="sb-condensed-running">
            {t(key('waiting'), { position: current.queuePosition })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
