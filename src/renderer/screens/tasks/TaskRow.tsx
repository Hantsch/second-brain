/* One row of the work queue — running, waiting, or finished, branching on
   `task.state` the same way `tasks-view.ts`'s own grouping does (`groupKindOf`),
   so a row never disagrees with the group `TaskGroup` put it into.

   The maintenance pseudo-row (`isMaintenanceTaskRow`, from `tasks-view.ts`)
   renders like any other running row except for one thing: no stop action.
   Story 072's decision — a stopped gardener run has no finished record until
   story 074, so a stop button here that made the row vanish would contradict
   AC4. The gardener's own stop control stays in `RunStrip`, mounted once in
   the shell and thus already visible on this screen too; duplicating it here
   would be a second way to do the same thing.

   The one teal accent on this screen belongs to the running progress bar
   below (`sb-trow-fill`) — every action here stays a `ghost` button, and the
   finished outcome is a `Badge` whose variant *and* text both carry the
   result, never color alone. */

import type { UseMutationResult } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { WorkTask, WorkTaskState } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import { ProgressBar } from '../../atoms/ProgressBar';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';
import { formatDuration } from '../../lib/format';
import { useTaskModelLabel } from '../../lib/queries/llm';
import { taskResultRoute } from '../../lib/task-result-route';
import { formatElapsed } from '../../lib/useElapsed';
import {
  isMaintenanceTaskRow,
  taskDuration,
  taskKindLabel,
  taskQueuePosition,
} from '../../lib/tasks-view';

/** The three finished states — the subset of `WorkTaskState` this row's
    "outcome" branch handles (queued/running have their own branches above). */
type Outcome = Exclude<WorkTaskState, 'queued' | 'running'>;

const OUTCOME_LABEL_KEY: Record<Outcome, string> = {
  done: 'tasks.outcome.done',
  failed: 'tasks.outcome.failed',
  cancelled: 'tasks.outcome.cancelled',
};
const OUTCOME_BADGE_VARIANT: Record<Outcome, 'success' | 'danger' | 'neutral'> = {
  done: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};
/* Icon *and* the badge text both carry the outcome — a color-blind reader or
   a screen reader without color still gets the same answer either way. */
const OUTCOME_ICON: Record<Outcome, string> = {
  done: 'circle-check-big',
  failed: 'triangle-alert',
  cancelled: 'x',
};

export interface TaskRowProps {
  task: WorkTask;
  cancel: UseMutationResult<boolean, unknown, string>;
  remove: UseMutationResult<boolean, unknown, string>;
  retry: UseMutationResult<WorkTask | null, unknown, string>;
}

function percentOf(task: WorkTask): number {
  return Math.max(0, Math.min(100, Math.round(task.progress * 100)));
}

/* Elapsed since start, computed once per render off the live data — no timer.
   Story 072/D4's explicit decision: unlike `RunStrip`'s own elapsed line
   (`useElapsedSeconds`), this row does not need to tick between data updates. */
function elapsedOf(task: WorkTask): string {
  if (task.startedAt === null) return formatElapsed(0);
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(task.startedAt).getTime()) / 1000));
  return formatElapsed(seconds);
}

export function TaskRow({ task, cancel, remove, retry }: TaskRowProps) {
  const t = useT();
  const navigate = useNavigate();
  const kindLabel = taskKindLabel(task.kind, t);
  /* Only a running row names its model — a queued one may still be re-routed
     before its turn, and a finished one ran on whatever was routed then. */
  const model = useTaskModelLabel(task.state === 'running' ? task.llmTask : undefined);

  if (task.state === 'running') {
    const readOnly = isMaintenanceTaskRow(task);
    const percent = percentOf(task);
    const cancelBusy = cancel.isPending && cancel.variables === task.id;
    return (
      <div className="sb-trow">
        <div className="sb-trow-head">
          <span className="sb-trow-kind sb-mono">{kindLabel}</span>
          <span className="sb-trow-subject">{task.subject.label}</span>
          <span className="sb-trow-elapsed sb-mono">{elapsedOf(task)}</span>
        </div>
        {model !== null ? (
          <div className="sb-trow-model sb-mono">{t('tasks.row.model', { model })}</div>
        ) : null}
        <div className="sb-trow-progress">
          <ProgressBar
            className="sb-trow-track"
            fillClassName="sb-trow-fill"
            label={t('tasks.row.progress', { subject: task.subject.label })}
            value={percent}
          />
          <span className="sb-mono sb-trow-percent">{percent} %</span>
        </div>
        {readOnly ? null : (
          <div className="sb-trow-actions">
            <Button
              variant="ghost"
              size="sm"
              icon="x"
              loading={cancelBusy}
              onClick={() => cancel.mutate(task.id)}
            >
              {t('tasks.action.stop')}
            </Button>
          </div>
        )}
        {!readOnly && cancel.error !== null && cancel.variables === task.id ? (
          <ErrorState error={cancel.error} subject={task.subject.label} variant="secondary" />
        ) : null}
      </div>
    );
  }

  if (task.state === 'queued') {
    const position = taskQueuePosition(task);
    const removeBusy = remove.isPending && remove.variables === task.id;
    return (
      <div className="sb-trow">
        <div className="sb-trow-head">
          <span className="sb-trow-kind sb-mono">{kindLabel}</span>
          <span className="sb-trow-subject">{task.subject.label}</span>
          {position !== null ? (
            <span className="sb-mono sb-trow-position">
              {t('tasks.waiting.position', { position })}
            </span>
          ) : null}
        </div>
        <div className="sb-trow-actions">
          <Button
            variant="ghost"
            size="sm"
            icon="x"
            loading={removeBusy}
            onClick={() => remove.mutate(task.id)}
          >
            {t('tasks.action.remove')}
          </Button>
        </div>
        {remove.error !== null && remove.variables === task.id ? (
          <ErrorState error={remove.error} subject={task.subject.label} variant="secondary" />
        ) : null}
      </div>
    );
  }

  const outcome: Outcome = task.state;
  const duration = taskDuration(task);
  const retryBusy = retry.isPending && retry.variables === task.id;
  /* Only a `done` task can carry a result (`WorkTask.hasResult`), and only
     `condense`/`close-day` currently resolve to a route — gardener/ingest are
     074's concern (see `task-result-route.ts`). */
  const resultRoute = outcome === 'done' ? taskResultRoute(task) : null;
  /* `task.retryable` is the honest signal, not `task.kind`: a task created
     via `startExternal` (`core/work/registry.ts` — the mirrored gardener run,
     a mirrored ingest job) carries a no-op stub as its runner, so the
     registry refuses to retry it — offering this button for one would
     silently do nothing on click. Each has its own real retry path instead:
     the garden screen's own resume for a maintenance run, and `ingest:retry`
     from the sources screen for an import. A normally enqueued task of the
     same `kind` (e.g. the tasks e2e fixture's synthetic ingest task) is
     genuinely retryable, which `kind` alone could not tell apart. */
  const canRetry = outcome === 'failed' && task.retryable;
  return (
    <div className="sb-trow">
      <div className="sb-trow-head">
        <span className="sb-trow-kind sb-mono">{kindLabel}</span>
        <span className="sb-trow-subject">{task.subject.label}</span>
        <Badge variant={OUTCOME_BADGE_VARIANT[outcome]}>
          <Icon name={OUTCOME_ICON[outcome]} size={12} />
          {t(OUTCOME_LABEL_KEY[outcome])}
        </Badge>
        {duration !== null ? (
          <span className="sb-mono sb-trow-duration">{formatDuration(duration)}</span>
        ) : null}
      </div>
      {canRetry || resultRoute !== null ? (
        <div className="sb-trow-actions">
          {canRetry ? (
            <Button
              variant="ghost"
              size="sm"
              icon="refresh-cw"
              loading={retryBusy}
              onClick={() => retry.mutate(task.id)}
            >
              {t('tasks.action.retry')}
            </Button>
          ) : null}
          {resultRoute !== null ? (
            <Button variant="ghost" size="sm" icon="eye" onClick={() => void navigate(resultRoute)}>
              {t('tasks.action.viewResult')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {retry.error !== null && retry.variables === task.id ? (
        <ErrorState error={retry.error} subject={task.subject.label} variant="secondary" />
      ) : null}
    </div>
  );
}
