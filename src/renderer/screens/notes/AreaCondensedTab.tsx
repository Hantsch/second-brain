/* The condensed tab of an area section (story 038, D6/D7/D8): reading the
   existing artifact, the honest "no model configured" state, triggering a
   run, and — once a proposal comes back — showing the diff with Accept and
   Reject. Nothing is written until Accept is clicked (a run alone never
   writes); a stale-hash accept discards the proposal and leaves a toast
   instead of attempting any merge. Reject is never a bare dismiss — it
   only opens `CondenseRejectDialog`, and the proposal disappears only once
   a non-empty reason actually lands (D8).

   Four states, in priority order:
   1. No model routed for `condense-area` → `LlmMissing` alone, no trigger
      anywhere (not even disabled) — but an existing artifact is still
      readable below it, since reading never needs a model (Guardrail 1).
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
import type { CondenseProposal } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Spinner } from '../../atoms/Spinner';
import { CondenseDiff } from '../../components/CondenseDiff';
import { CondenseRejectDialog } from '../../components/CondenseRejectDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LlmMissing } from '../../components/LlmMissing';
import { renderMarkdown } from '../../components/markdown-render';
import { Skeleton } from '../../components/Skeleton';
import { useLanguage, useT } from '../../i18n';
import { IpcCallError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import {
  useCondenseAccept,
  useCondenseReject,
  useCondenseRun,
  useCondensedArea,
} from '../../lib/queries/condense';
import { useTaskRouted } from '../../lib/queries/llm';
import { pushToast } from '../../lib/toast';

export interface AreaCondensedTabProps {
  area: { slug: string; title: string };
}

/** A wikilink in a condensed page renders as its label, not a link — this
    tab has no target to resolve it against (D6 doesn't add citation
    navigation for condensed content), so the raw target would be worse. */
function plainWikilink(target: string, label: string, key: string): ReactNode {
  return <span key={key}>{label.length > 0 ? label : target}</span>;
}

export function AreaCondensedTab({ area }: AreaCondensedTabProps) {
  const t = useT();
  const language = useLanguage();
  const modelRouted = useTaskRouted('condense-area');
  const artifact = useCondensedArea(area.slug);
  const run = useCondenseRun();
  const accept = useCondenseAccept();
  const reject = useCondenseReject();
  const [proposal, setProposal] = useState<CondenseProposal | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectError, setRejectError] = useState<unknown>(null);

  const trigger = (): void => {
    if (run.isPending) return;
    run.mutate(area.slug, { onSuccess: setProposal });
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
          pushToast('error', {
            message: 'notes.condensed.accept.conflict',
            values: { subject: area.title },
          });
        }
      },
    });
  };

  const rejectProposal = (reason: string): void => {
    if (reject.isPending) return;
    setRejectError(null);
    reject.mutate(
      { slug: area.slug, reason },
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
            pushToast('error', {
              message: 'notes.condensed.accept.conflict',
              values: { subject: area.title },
            });
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

  const artifactBlock = (data: NonNullable<typeof artifact.data>): ReactNode => (
    <div className="sb-condensed-artifact">
      <p className="sb-condensed-meta sb-mono">
        {t('notes.condensed.meta.condensedAt', { date: formatDate(data.condensedAt, language) })}
        {data.sources.length > 0
          ? ` · ${t('notes.condensed.meta.sources', { count: data.sources.length })}`
          : ''}
      </p>
      <div className="sb-md">{renderMarkdown(data.content, { wikilink: plainWikilink })}</div>
      <span className="gs-hint">{t('notes.condensed.notEvidence')}</span>
    </div>
  );

  // ── State 1: no model routed ─────────────────────────────────────────────
  if (modelRouted === false) {
    return (
      <div className="sb-condensed">
        <LlmMissing task="condense-area" tone="card" />
        {artifact.data ? artifactBlock(artifact.data) : null}
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
      ) : artifact.data ? (
        artifactBlock(artifact.data)
      ) : (
        <EmptyState
          icon="layers"
          title={t('notes.condensed.empty.title')}
          body={t('notes.condensed.empty.body')}
        />
      )}

      {run.isError ? (
        <ErrorState error={run.error} variant="secondary" subject={area.title} scrollIntoView />
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
              {t('notes.condensed.accept')}
            </Button>
            <Button
              variant="secondary"
              icon="thumbs-down"
              disabled={accept.isPending}
              onClick={() => setRejectOpen(true)}
            >
              {t('notes.condensed.reject')}
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
          {artifact.data ? t('notes.condensed.triggerAgain') : t('notes.condensed.trigger')}
        </Button>
        {running ? (
          <span className="sb-condensed-running">
            <Spinner size={14} />
            {t('notes.condensed.running')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
