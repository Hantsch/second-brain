/* Pure view model over the work queue (072, D3) — no React, no IO. Everything
   the tasks screen and the rail badge need, derived from two raw inputs:
   `tasks-store.ts`'s `WorkTask[]` and `gardener-progress.ts`'s snapshot. Both
   are read, neither is duplicated — the maintenance run is not a `WorkTask`
   in the registry (it has its own store, wired long before this story), so a
   synthetic row is built from its snapshot here instead of teaching the
   registry about the gardener or teaching this module a second way to poll
   maintenance progress.

   One store, one view: `RunStrip` already reads `gardener-progress.ts`
   directly for its own bar, and this module reads the very same snapshot for
   the maintenance row — so the two surfaces the story's AC9 cares about can
   never drift apart into two different answers about the same run. The
   label text itself is the same story: `maintenanceLabel` lives here and
   `RunStrip` calls it too, rather than each side keeping its own copy of the
   same translation branch (072 review, finding 1). */

import type { WorkTask, WorkTaskState } from '@shared/types';
import type { GardenerProgress } from './gardener-progress';

/** The shape of `useT()`'s return value, kept local rather than imported from
    `../i18n` so this module never has to import anything React-adjacent —
    a plain function is all a pure view needs, and all a test needs to fake. */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Stable id for the one synthetic row a running maintenance pass produces —
    there is only ever one gardener run at a time, so a fixed id is enough. */
const MAINTENANCE_TASK_ID = 'gardener-run';

export type TaskGroupKind = 'running' | 'waiting' | 'finished';

export interface TaskGroup {
  kind: TaskGroupKind;
  tasks: WorkTask[];
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
  const buckets: Record<TaskGroupKind, WorkTask[]> = { running: [], waiting: [], finished: [] };
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
  return {
    id: MAINTENANCE_TASK_ID,
    kind: 'gardener',
    lane: 'model',
    subject: { label: maintenanceLabel(progress, t), ref: null },
    state: 'running',
    progress: progress.percent / 100,
    message: progress.check,
    error: null,
    queuePosition: null,
    queuedAt: progress.startedAt,
    startedAt: progress.startedAt,
    finishedAt: null,
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
 * Badge count: running + waiting tasks from the registry, plus the
 * maintenance row whenever a gardener run is in flight (072's explicit
 * decision — a badge reading zero while the screen shows a running
 * maintenance task would be exactly the "two answers" problem this story
 * exists to end).
 */
export function tasksBadgeCount(
  tasks: readonly WorkTask[],
  progress: GardenerProgress | null,
): number {
  const active = tasks.filter((task) => task.state === 'running' || task.state === 'queued').length;
  return active + (progress === null ? 0 : 1);
}

/**
 * The combined view: the registry's tasks plus the synthetic maintenance
 * row (when present), grouped in the one fixed order. The single entry point
 * D4's screen needs — it never has to know the maintenance row exists as a
 * separate concept.
 */
export function buildTasksView(
  tasks: readonly WorkTask[],
  progress: GardenerProgress | null,
  t: Translate,
): TaskGroup[] {
  const maintenance = maintenanceTaskRow(progress, t);
  const merged = maintenance === null ? tasks : [maintenance, ...tasks];
  return groupTasks(merged);
}
