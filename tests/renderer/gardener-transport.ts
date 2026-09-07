/* How a maintenance run reaches the renderer since 074, D5 — shared by every
   renderer test that has to put one in front of a component.

   There is no `event:gardener-progress` any more. The run is a `WorkTask` in
   the shared registry (`kind: 'gardener'`, `lane: 'model'`), its own snapshot
   rides along as that task's `detail`, and it travels with every other task
   over `event:work-tasks` — which `main.tsx` hands straight to
   `tasks-store.ts`'s `setWorkTasks`. `gardener-progress.ts` derives itself
   from there.

   Two things a test has to get right, and both are easy to get wrong once per
   file, which is why they live here:

   - **The queue and the `work:list` answer must agree.** `tasks-store.ts`
     seeds itself from `work:list` on its first subscriber, so a component
     mounting after a scenario was published would otherwise be handed an
     empty queue a moment later and silently contradict the scenario.
     `publishedWorkQueue()` is what a test's bridge mock answers `work:list`
     with, so the seed can only ever confirm what was published.
   - **A finished run is an absent task, not a `running: false` snapshot.**
     The registry settles the task (done/failed/cancelled) when a run ends, so
     "no run is going" reads as "no running gardener task" — which is exactly
     what `gardener-progress.ts` normalizes to `null`. */

import type { GardenerRunProgress, WorkTask } from '@shared/types';
import { setWorkTasks } from '@renderer/lib/tasks-store';

let published: WorkTask[] = [];

/** The registry's mirror of a running run, as `gardener-run-state.ts` writes
    it: `progress` is 0..1 where the snapshot's `percent` is 0..100, and the
    whole snapshot travels as `detail`. */
export function gardenerWorkTask(snapshot: GardenerRunProgress): WorkTask {
  return {
    id: 'gardener-task',
    kind: 'gardener',
    lane: 'model',
    subject: { label: 'Maintenance run', ref: null },
    state: 'running',
    progress: snapshot.percent / 100,
    message: null,
    error: null,
    queuePosition: null,
    hasResult: false,
    queuedAt: snapshot.startedAt,
    startedAt: snapshot.startedAt,
    finishedAt: null,
    detail: snapshot,
    /* Mirrors the real registry task (`WorkRegistry.startExternal`, 074 D2) —
       never retryable. */
    retryable: false,
  };
}

/** Publishes the whole queue, the way `event:work-tasks` does. */
export function publishWorkQueue(tasks: WorkTask[]): void {
  published = tasks;
  setWorkTasks(tasks);
}

/**
 * Publishes a maintenance run — `null` (or a snapshot that is no longer
 * running) publishes a queue without one, which is how a run that ended looks
 * from here. `others` keeps whatever else the scenario has in the queue.
 */
export function publishGardenerRun(
  snapshot: GardenerRunProgress | null,
  others: WorkTask[] = [],
): void {
  const running = snapshot !== null && snapshot.running;
  publishWorkQueue(running ? [gardenerWorkTask(snapshot), ...others] : others);
}

/** What `work:list` must answer with — see the header. */
export function publishedWorkQueue(): WorkTask[] {
  return published;
}
