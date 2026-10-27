/* The pull list inside `LocalRuntimeCard` (019c D6, plan step 8): models this
   machine can actually carry, each labelled with its download size, with a
   progress bar, cancel, and retry-on-failure.

   Candidates come from `llm:recommendModels` (019b): a `TaskRecommendation`
   carries `needsDownloadGb` exactly when its pick is a local model that's
   within this machine's capacity but not yet installed (reachability's
   `'needs-download'` status, see `core/llm/reachability.ts`) — no provider
   needs to be configured at all for a local entry to qualify, so this list is
   non-empty in practice on any machine whose capacity verdict allows at least
   one catalogue entry, not only once a provider exists. That's why this file
   derives the list from the real recommendation set instead of falling back
   to the plain-list degradation the story allows: the fallback would throw
   away the "this machine can actually run it" judgement for no reason found
   in real `recommend.ts`/`reachability.ts` behaviour.

   Progress is read from `pullStore` by `modelId`, not from local state, so it
   survives navigating away and back (`usePull`/`useAllPulls`'s whole reason
   to exist — see that file's doc comment). Retrying clears the previous
   entry for the same model first, so a stale failed record can never be
   shown next to a freshly started run. */

import type { ModelRef, RecommendationSet } from '@shared/types';
import { Button } from '../../atoms/Button';
import { ProgressBar } from '../../atoms/ProgressBar';
import { useLanguage, useT } from '../../i18n';
import { formatBytes } from '../../lib/format';
import { decodeIpcError } from '../../lib/ipc-error';
import { clearPull, findPullEntry, useAllPulls, type PullState } from '../../lib/pullStore';
import { usePullMutations, useRecommendations } from '../../lib/queries/llm';

interface PullCandidate {
  ref: ModelRef;
  gb: number;
}

/** Distinct `needs-download` picks across every task, deduped by model id —
    the same catalogue entry can be the pick for more than one task, and its
    size is the same figure either way. */
function derivePullCandidates(recommendations: RecommendationSet | undefined): PullCandidate[] {
  if (!recommendations) return [];
  const byModel = new Map<string, PullCandidate>();
  for (const row of recommendations.tasks) {
    if (row.pick === null || row.needsDownloadGb === null) continue;
    if (!byModel.has(row.pick.model)) {
      byModel.set(row.pick.model, { ref: row.pick, gb: row.needsDownloadGb });
    }
  }
  return [...byModel.values()];
}

function pct(state: PullState | undefined): number {
  if (!state || state.total <= 0) return 0;
  return Math.min(100, Math.round((state.completed / state.total) * 100));
}

/**
 * One download row: name, size, progress, cancel/retry/start — shared by
 * Ollama's pull list here and llama.cpp's model panel (033, D11), which is
 * why this is exported and keyed by a bare `modelId`/`sizeLabel` pair
 * instead of a `PullCandidate` (a shape specific to Ollama's recommendation-
 * derived list; llama.cpp has no `ModelRef` for a Hugging Face file).
 */
export interface PullRowProps {
  /** What this row downloads — Ollama's model tag, or a llama.cpp GGUF
      file's base name. The row itself never needs to know which. */
  modelId: string;
  /** Pre-formatted size, e.g. "18 GB" (Ollama, whole numbers from
      `needsDownloadGb`) or "4.1 GB" (llama.cpp, from `formatBytes`) — each
      caller formats its own source figure. */
  sizeLabel: string;
  /** Extra detail next to the size — llama.cpp's quantisation, or `undefined`
      when a caller (Ollama's list) has nothing else to add. */
  meta?: string;
  entry: readonly [string, PullState] | undefined;
  pulling: boolean;
  onPull: () => void;
  onCancel: (pullId: string) => void;
}

export function PullRow({
  modelId,
  sizeLabel,
  meta,
  entry,
  pulling,
  onPull,
  onCancel,
}: PullRowProps) {
  const t = useT();
  const language = useLanguage();
  const state = entry?.[1];
  const running = state !== undefined && !state.done;

  return (
    <li className="sb-runtime-pull-row">
      <div className="sb-runtime-pull-head">
        <span className="sb-mono">{modelId}</span>
        <span className="sb-routing-hint">
          {sizeLabel}
          {meta ? ` · ${meta}` : ''}
        </span>
      </div>

      {state && !state.error ? (
        <>
          <div className="sb-progress">
            <ProgressBar
              value={pct(state)}
              label={t('settings.runtime.pull.progressAria', { model: modelId })}
              className="sb-progress-track"
              fillClassName="sb-progress-fill"
            />
          </div>
          <p className="sb-mono sb-routing-hint">
            {state.status}
            {' — '}
            {t('settings.runtime.pull.progress', {
              // Same "X of Y" phrasing `LocalRuntimeInstallDialog` uses for its
              // own download progress, in human units rather than raw bytes —
              // a reader can subtract to see what's left, per the acceptance
              // criterion ("the total size and what is left").
              completed: formatBytes(state.completed, language),
              total: formatBytes(state.total, language),
            })}
          </p>
        </>
      ) : null}

      {state?.error ? (
        <p className="sb-note-detail sb-note-bad">
          {t('settings.runtime.pull.failed')} {t(`error.code.${state.error}`)}
        </p>
      ) : null}

      <div className="sb-setting-actions">
        {running ? (
          <Button
            variant="ghost"
            size="sm"
            icon="x"
            aria-label={t('settings.runtime.pull.cancelAria', { model: modelId })}
            onClick={() => entry && onCancel(entry[0])}
          >
            {t('settings.runtime.pull.cancel')}
          </Button>
        ) : state?.error ? (
          <Button
            variant="secondary"
            size="sm"
            icon="refresh-cw"
            loading={pulling}
            aria-label={t('settings.runtime.pull.retryAria', { model: modelId })}
            onClick={onPull}
          >
            {t('settings.runtime.pull.retry')}
          </Button>
        ) : !state ? (
          <Button
            variant="secondary"
            size="sm"
            icon="download"
            loading={pulling}
            aria-label={t('settings.runtime.pull.startAria', { model: modelId })}
            onClick={onPull}
          >
            {t('settings.runtime.pull.start')}
          </Button>
        ) : (
          <span className="sb-routing-hint">{t('settings.runtime.pull.done')}</span>
        )}
      </div>
    </li>
  );
}

export function LocalRuntimePullList() {
  const t = useT();
  const recommendations = useRecommendations(true);
  const pulls = useAllPulls();
  // Ollama-only for now (033 makes the hook itself per-runtime; the model
  // search/download panel for llama.cpp is D11's job, not this file's).
  const { start, cancel } = usePullMutations('ollama');

  const candidates = derivePullCandidates(recommendations.data);
  const entryFor = (modelId: string): readonly [string, PullState] | undefined =>
    findPullEntry(pulls, modelId);

  const pull = (modelId: string): void => {
    /* A stale finished/failed entry for this exact model must not survive
       next to the run we're about to start — otherwise its old error would
       flash next to (or instead of) the fresh progress bar. */
    const previous = entryFor(modelId);
    start.mutate(modelId, {
      onSuccess: () => {
        if (previous) clearPull(previous[0]);
      },
    });
  };

  return (
    <section className="sb-runtime-pull" aria-label={t('settings.runtime.pull.title')}>
      <span className="gs-overline">{t('settings.runtime.pull.title')}</span>
      <p className="sb-routing-hint">{t('settings.runtime.pull.note')}</p>

      {recommendations.error ? (
        <p className="sb-note-detail sb-note-bad">
          {t(`error.code.${decodeIpcError(recommendations.error).code}`)}
        </p>
      ) : candidates.length === 0 ? (
        <p className="sb-panel-empty">{t('settings.runtime.pull.empty')}</p>
      ) : (
        <ul className="sb-runtime-pull-list">
          {candidates.map((candidate) => (
            <PullRow
              key={candidate.ref.model}
              modelId={candidate.ref.model}
              sizeLabel={t('settings.runtime.pull.size', { gb: candidate.gb })}
              entry={entryFor(candidate.ref.model)}
              pulling={start.isPending}
              onPull={() => pull(candidate.ref.model)}
              onCancel={(pullId) => cancel.mutate(pullId)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
