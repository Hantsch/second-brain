/* Pure view model over the work queue (072, D3) — no React, no IO. Everything
   the tasks screen and the rail badge need, derived from two raw inputs:
   `tasks-store.ts`'s `WorkTask[]` and `gardener-progress.ts`'s snapshot. Both
   are read, neither is duplicated — a synthetic row is built from the snapshot
   here rather than teaching this module a second way to poll maintenance
   progress.

   Since 074 those two inputs are no longer independent: the maintenance run
   *is* a `WorkTask` in the registry now, and `gardener-progress.ts` derives
   its snapshot from exactly that task. The one run therefore arrives twice,
   and `buildTasksView`/`tasksBadgeCount` drop the registry's copy of it while
   the synthetic row stands for it — see the comment on `buildTasksView`.

   One store, one view: `RunStrip` already reads `gardener-progress.ts`
   directly for its own bar, and this module reads the very same snapshot for
   the maintenance row — so the two surfaces the story's AC9 cares about can
   never drift apart into two different answers about the same run. The
   label text itself is the same story: `maintenanceLabel` lives here and
   `RunStrip` calls it too, rather than each side keeping its own copy of the
   same translation branch (072 review, finding 1). */

import type { AgentJobView, TaskKind, WorkTask, WorkTaskKind, WorkTaskState } from '@shared/types';
import type { GardenerProgress } from './gardener-progress';

/** The shape of `useT()`'s return value, kept local rather than imported from
    `../i18n` so this module never has to import anything React-adjacent —
    a plain function is all a pure view needs, and all a test needs to fake. */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Stable id for the one synthetic row a running maintenance pass produces —
    there is only ever one gardener run at a time, so a fixed id is enough. */
const MAINTENANCE_TASK_ID = 'gardener-run';

/** i18n key for a task kind's label — the one mapping `TaskRow.tsx` and
    `QuitDuringRunDialog.tsx` both read off (074, D7), so a kind is never
    named two different ways in two places. */
export const TASK_KIND_LABEL_KEY: Record<WorkTaskKind, string> = {
  condense: 'tasks.kind.condense',
  'close-day': 'tasks.kind.close-day',
  gardener: 'tasks.kind.gardener',
  ingest: 'tasks.kind.ingest',
  'interview-plan': 'tasks.kind.interview-plan',
};

/** A task kind's label, in words — see `TASK_KIND_LABEL_KEY` above. */
export function taskKindLabel(kind: WorkTaskKind, t: Translate): string {
  return t(TASK_KIND_LABEL_KEY[kind]);
}

/** `agent` holds the jobs open with the agent; `groupTasks` never produces it. */
export type TaskGroupKind = 'running' | 'waiting' | 'agent' | 'finished';

export interface TaskGroup {
  kind: TaskGroupKind;
  tasks: WorkTask[];
  /** The agent's jobs, in the `agent` group (open) and the `finished` group (settled). */
  jobs?: AgentJobView[];
}

/** Which of the three fixed groups a task's state belongs to. */
function groupKindOf(state: WorkTaskState): TaskGroupKind {
  if (state === 'running') return 'running';
  if (state === 'queued') return 'waiting';
  return 'finished'; // done, failed, cancelled
}

/**
 * Groups tasks into running / waiting / finished, in that fixed order.
 * A group with nothing in it is simply absent from the result — the caller
 * (D4's screen) renders one section per entry here, nothing more to filter.
 */
export function groupTasks(tasks: readonly WorkTask[]): TaskGroup[] {
  const order: TaskGroupKind[] = ['running', 'waiting', 'finished'];
  const buckets: Record<TaskGroupKind, WorkTask[]> = {
    running: [],
    waiting: [],
    agent: [],
    finished: [],
  };
  for (const task of tasks) buckets[groupKindOf(task.state)].push(task);
  return order
    .filter((kind) => buckets[kind].length > 0)
    .map((kind) => ({ kind, tasks: buckets[kind] }));
}

/**
 * 1-based place among tasks waiting for their lane — `null` once a task is
 * not (or no longer) queued. A task the user removed or that finished never
 * reports a position again, even if it once had one while it sat in the
 * queue: `WorkTask.queuePosition` already goes `null` the moment a task
 * leaves `queued` (see `@shared/types/work.ts`), this only makes the "waiting
 * only" rule explicit at the view layer too, so a caller never has to trust
 * a stale number off a task in some other state.
 */
export function taskQueuePosition(task: WorkTask): number | null {
  return task.state === 'queued' ? task.queuePosition : null;
}

/**
 * How long a finished task took, in milliseconds — `null` while it hasn't
 * finished. Measured from `startedAt` when the task actually ran; a task
 * that was queued and then cancelled or removed before its turn came never
 * has a `startedAt` (071/072: only a task that started gets one), so its
 * duration falls back to `queuedAt` instead of reporting nothing — "how long
 * it sat in the queue before it went away," which is the honest answer for
 * a task that was never running.
 */
export function taskDuration(task: WorkTask): number | null {
  if (task.finishedAt === null) return null;
  const start = task.startedAt ?? task.queuedAt;
  return new Date(task.finishedAt).getTime() - new Date(start).getTime();
}

/**
 * The maintenance run's label, in words — the one thing `RunStrip.tsx` and
 * this module's synthetic row must never say differently about the same
 * snapshot (AC9). Exported so `RunStrip` can call this instead of keeping its
 * own copy of the same three-way branch: one derivation, not two that have to
 * be kept in sync by hand. Mirrors `RunStrip`'s pre-072 inline `what` line.
 */
export function maintenanceLabel(progress: GardenerProgress, t: Translate): string {
  if (progress.stage === 'audit') return t('garden.run.audit');
  if (progress.stage === 'loose-ends') return t('garden.run.looseEnds');
  return t('garden.run.check', { check: t(`garden.kind.${progress.check ?? 'orphan'}`) });
}

/**
 * The LLM task the run is on right now — only the two model stages call one;
 * the per-check stages are plain index work, so they name no model.
 */
function maintenanceLlmTask(progress: GardenerProgress): TaskKind | null {
  if (progress.stage === 'audit') return 'gardener-audit';
  if (progress.stage === 'loose-ends') return 'journal-loose-ends';
  return null;
}

/**
 * The maintenance run as a `WorkTask`-shaped row, so D4's screen can render
 * it through the same `TaskRow` a real task uses, with no special case for
 * "this one comes from gardener-progress, not the registry." `null` while no
 * run is going — the same "no run" meaning `gardener-progress.ts` itself uses.
 */
export function maintenanceTaskRow(
  progress: GardenerProgress | null,
  t: Translate,
): WorkTask | null {
  if (progress === null) return null;
  const llmTask = maintenanceLlmTask(progress);
  return {
    ...(llmTask === null ? {} : { llmTask }),
    id: MAINTENANCE_TASK_ID,
    kind: 'gardener',
    lane: 'model',
    subject: { label: maintenanceLabel(progress, t), ref: null },
    state: 'running',
    progress: progress.percent / 100,
    message: progress.check,
    error: null,
    queuePosition: null,
    /* A maintenance run writes its report itself; there is no proposal waiting
       under a task id for it (073). */
    hasResult: false,
    queuedAt: progress.startedAt,
    startedAt: progress.startedAt,
    finishedAt: null,
    /* No `GardenerRunProgress` detail on this synthetic row: 074 D2 landed
       that type on the real registry task instead, which is exactly the one
       this row stands in for (see `isRunShownAsMaintenanceRow` below) — this
       row itself still carries none. */
    detail: null,
    /* This row stands in for the real registry task, which is created via
       `startExternal` and therefore never retryable (`WorkTask.retryable`) —
       moot here anyway, since this synthetic row is only ever shown while
       `running`, never `failed`. */
    retryable: false,
  };
}

/**
 * Whether a row is the synthetic maintenance row rather than a real queued
 * task — the one thing D4's screen needs to know to keep it read-only (no
 * stop action: a stopped gardener run has no finished record until story
 * 074, so a stop button here that made the row vanish would contradict
 * AC4). Checked by id rather than `kind === 'gardener'`, because a future
 * real queued task could legitimately carry that kind too (see
 * `WorkTaskKind`) — the id is the one thing unique to this synthetic row.
 */
export function isMaintenanceTaskRow(task: WorkTask): boolean {
  return task.id === MAINTENANCE_TASK_ID;
}

/**
 * Whether this registry task is the running maintenance pass the synthetic row
 * already stands for (074, D5) — the two representations of one run, which
 * must never both be counted or both be shown. Narrow on purpose: only a
 * `running` gardener task, and only while a snapshot actually produces the
 * synthetic row. A *finished* gardener task is 074's own new record of a run
 * that ended and belongs on the screen; and if the registry and the snapshot
 * ever disagreed for a tick (a task still `running` whose `detail` already
 * says `running: false`), the real row is shown rather than nothing.
 */
function isRunShownAsMaintenanceRow(task: WorkTask, progress: GardenerProgress | null): boolean {
  return progress !== null && task.kind === 'gardener' && task.state === 'running';
}

/**
 * Badge count: running + waiting tasks from the registry, plus the
 * maintenance row whenever a gardener run is in flight (072's explicit
 * decision — a badge reading zero while the screen shows a running
 * maintenance task would be exactly the "two answers" problem this story
 * exists to end). The registry's own record of that same run is left out of
 * the count for the reason `buildTasksView` explains below: since 074 it is
 * there, and counting it as well would make the badge read one too many.
 */
export function tasksBadgeCount(
  tasks: readonly WorkTask[],
  progress: GardenerProgress | null,
): number {
  const active = tasks.filter(
    (task) =>
      (task.state === 'running' || task.state === 'queued') &&
      !isRunShownAsMaintenanceRow(task, progress),
  ).length;
  return active + (progress === null ? 0 : 1);
}

/**
 * Adds the agent's jobs to the grouped tasks: open ones in their own group between
 * waiting and finished (they wait on the agent, not on the queue), settled ones in
 * finished, newest first. Open jobs never reach the badge count — nothing here is
 * running in the app.
 */
function withAgentJobs(groups: TaskGroup[], jobs: readonly AgentJobView[]): TaskGroup[] {
  if (jobs.length === 0) return groups;
  const settledAt = (job: AgentJobView): number => Date.parse(job.finishedAt ?? job.createdAt);
  const jobsOf: Record<TaskGroupKind, AgentJobView[]> = {
    running: [],
    waiting: [],
    agent: jobs.filter((job) => job.state === 'with-agent'),
    finished: jobs
      .filter((job) => job.state !== 'with-agent')
      .sort((a, b) => settledAt(b) - settledAt(a)),
  };
  const order: TaskGroupKind[] = ['running', 'waiting', 'agent', 'finished'];
  return order.flatMap((kind) => {
    const tasks = groups.find((group) => group.kind === kind)?.tasks ?? [];
    const own = jobsOf[kind];
    if (tasks.length === 0 && own.length === 0) return [];
    return [own.length === 0 ? { kind, tasks } : { kind, tasks, jobs: own }];
  });
}

/**
 * The combined view: the registry's tasks plus the synthetic maintenance
 * row (when present), grouped in the one fixed order. The single entry point
 * D4's screen needs — it never has to know the maintenance row exists as a
 * separate concept.
 *
 * The running maintenance run is now in `tasks` too: story 074 made it a real
 * `WorkTask` in the registry, which is precisely where `gardener-progress.ts`
 * derives the snapshot behind the synthetic row from — so without the filter
 * below the one run would appear twice on the screen and twice in the badge.
 * The synthetic row is kept as the visible one, deliberately: it carries the
 * run's own stage label and weighted percent, and the screen's read-only
 * treatment of it (no stop action, see `isMaintenanceTaskRow`) then stays
 * exactly as 072 built it, with no migration of `TaskRow` in this story. A
 * stop-from-the-tasks-screen affordance for maintenance is a follow-up
 * feature — this migration does not promise one, it only promises the run
 * shows up once.
 */
export function buildTasksView(
  tasks: readonly WorkTask[],
  progress: GardenerProgress | null,
  t: Translate,
  jobs: readonly AgentJobView[] = [],
): TaskGroup[] {
  const withoutRunningGardenerTask = tasks.filter(
    (task) => !isRunShownAsMaintenanceRow(task, progress),
  );
  const maintenance = maintenanceTaskRow(progress, t);
  const merged =
    maintenance === null
      ? withoutRunningGardenerTask
      : [maintenance, ...withoutRunningGardenerTask];
  return withAgentJobs(groupTasks(merged), jobs);
}
