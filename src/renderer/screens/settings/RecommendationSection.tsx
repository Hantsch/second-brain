/* Model recommendation (019b D9): one ranked target per task, from
   `core/llm/recommend.ts`'s heuristic over the model catalogue.

   Mirrors `RoutingSection`'s shape: nothing is fetched until the user
   presses "Get recommendations" — no silent network/model-listing call on
   mount (guardrail 1) — and nothing is written until a row or "accept all"
   is confirmed by hand (guardrail 2). Accepting writes through the same
   `llm:setRoute` channel the routing table itself uses, so a recommendation
   is never a second, parallel write path into `Routing`. */

import { useState } from 'react';
import type { ProviderConfig, RecommendationSet, TaskDefinition, TaskKind } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Panel } from '../../components/Panel';
import { useLanguage, useT } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { decodeIpcError } from '../../lib/ipc-error';
import { useRoutingMutations } from '../../lib/queries/llm';
import { isAcceptable, RecommendationRow } from './RecommendationRow';

export interface RecommendationSectionProps {
  tasks: readonly TaskDefinition[];
  providers: readonly ProviderConfig[];
  /** Raises a `pick === null` row's task up to `ModelsTab` (067, D2), which
      focuses that task's select in the routing table above. */
  onAssignManually: (task: TaskKind) => void;
}

export function RecommendationSection({
  tasks,
  providers,
  onAssignManually,
}: RecommendationSectionProps) {
  const t = useT();
  const language = useLanguage();
  const { setRoute } = useRoutingMutations();
  const [recommendations, setRecommendations] = useState<RecommendationSet | null>(null);
  const [accepted, setAccepted] = useState<ReadonlySet<TaskKind>>(new Set());
  const [busy, setBusy] = useState(false);
  const [acceptingTask, setAcceptingTask] = useState<TaskKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendations = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setRecommendations(await api.llm.recommendModels());
      setAccepted(new Set());
    } catch (failure) {
      setError(t(`error.code.${decodeIpcError(failure).code}`));
    } finally {
      setBusy(false);
    }
  };

  const acceptRow = async (task: TaskKind): Promise<void> => {
    const row = recommendations?.tasks.find((entry) => entry.task === task);
    if (!row || !isAcceptable(row, providers)) return;
    setAcceptingTask(task);
    setError(null);
    try {
      await setRoute.mutateAsync({ task, ref: row.pick });
      setAccepted((current) => new Set(current).add(task));
    } catch (failure) {
      setError(t(`error.code.${decodeIpcError(failure).code}`));
    } finally {
      setAcceptingTask(null);
    }
  };

  const acceptAll = async (): Promise<void> => {
    if (!recommendations) return;
    setBusy(true);
    setError(null);
    try {
      /* Row by row through the exact same channel a single accept uses —
         every write is individually traceable, mirroring
         `RoutingSection.apply()`'s sequential loop. Only rows `isAcceptable`
         approves are attempted — the same gate `RecommendationRow` uses for
         its own accept button and `acceptRow` above, so a row can never be
         accepted through one path and refused through the other. One row's
         failure must not hide that every row before it already wrote
         successfully, so each success is recorded immediately rather than
         only after the whole loop finishes. */
      const acceptable = recommendations.tasks.filter((row) => isAcceptable(row, providers));
      for (const row of acceptable) {
        // `pick !== null` was just checked above.
        await setRoute.mutateAsync({ task: row.task, ref: row.pick! });
        setAccepted((current) => new Set(current).add(row.task));
      }
    } catch (failure) {
      setError(t(`error.code.${decodeIpcError(failure).code}`));
    } finally {
      setBusy(false);
    }
  };

  const discard = (): void => {
    setRecommendations(null);
    setAccepted(new Set());
    setError(null);
  };

  const acceptableCount = recommendations
    ? recommendations.tasks.filter((row) => isAcceptable(row, providers) && !accepted.has(row.task))
        .length
    : 0;

  return (
    <Panel
      title={t('settings.recommend.title')}
      action={
        <Button
          variant="secondary"
          size="sm"
          icon="sparkles"
          loading={busy && recommendations === null}
          onClick={() => void fetchRecommendations()}
        >
          {t('settings.recommend.action')}
        </Button>
      }
      note={t('settings.recommend.note')}
    >
      <div className="sb-setting-block">
        {error ? <p className="sb-note-detail sb-note-bad">{error}</p> : null}

        {!recommendations ? (
          <p className="sb-panel-empty">{t('settings.recommend.idle')}</p>
        ) : (
          <>
            {recommendations.catalogueStale ? (
              <p className="sb-routing-hint">
                {t('settings.recommend.stale', {
                  date: formatDate(recommendations.catalogueGeneratedAt, language),
                })}
              </p>
            ) : null}

            <ul className="sb-recommend-list">
              {recommendations.tasks.map((row) => {
                const definition = tasks.find((entry) => entry.kind === row.task);
                if (!definition) return null;
                return (
                  <RecommendationRow
                    key={row.task}
                    row={row}
                    task={definition}
                    providers={providers}
                    language={language}
                    accepted={accepted.has(row.task)}
                    busy={acceptingTask === row.task}
                    onAccept={() => void acceptRow(row.task)}
                    onAssignManually={onAssignManually}
                  />
                );
              })}
            </ul>

            <div className="sb-setting-actions">
              {acceptableCount > 0 ? (
                <Button size="sm" icon="check" loading={busy} onClick={() => void acceptAll()}>
                  {t('settings.recommend.acceptAll')}
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={discard}>
                {t('settings.recommend.discard')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
