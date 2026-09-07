/* "What is the queue currently doing about this one thing?" — the single
   source a screen reads instead of tracking its own run (story 073, D5).

   Before this hook, a panel that started a run held the run in its own
   component state: the mutation's `isPending`/`isError` plus a `useState` for
   the proposal it came back with. All of that dies with the component, so
   navigating away mid-run and coming back showed a blank panel and asked the
   user to run the model a second time — the very bug 073 exists to fix.

   Everything here is derived instead:

   - **the task** from `useWorkTasks()` (`../tasks-store`), which is session-
     lived module state fed by `event:work-tasks` and seeded from `work:list`
     for whoever subscribes first — so a component mounting mid-run sees the
     true state on its first render, not on the next event,
   - **the result** from `tasks:result` under that task's id, cached under
     `qk.tasks.result(id)` and only asked for once the task is actually done
     and says it left something behind.

   The *latest* matching task wins: over a session a subject accumulates one
   record per run (a retry, a re-run after a rejection), and the queue keeps
   them in insertion order, oldest first. Only the newest one describes what
   is true now; the older ones are history the tasks screen shows, not this. */

import { useQuery } from '@tanstack/react-query';
import type { IpcError } from '@shared/ipc';
import type { TaskResult, WorkTask, WorkTaskKind } from '@shared/types';
import { api } from '../api';
import { isIpcError } from '../ipc-error';
import { qk } from '../queries/keys';
import { useWorkTasks } from '../tasks-store';

/**
 * The queue's answer for one kind + subject. `idle` covers both "nothing was
 * ever queued for this" and "there is no subject to ask about"; `done` carries
 * `result: null` while the result fetch is still in flight *and* once the user
 * has decided about it (accept/reject drop the payload on the main side) —
 * both are "nothing to show", never an error.
 */
export type TaskForSubject =
  | { status: 'idle' }
  | { status: 'queued'; task: WorkTask; queuePosition: number | null }
  | { status: 'running'; task: WorkTask }
  | { status: 'failed'; task: WorkTask; reason: string }
  | { status: 'done'; task: WorkTask; result: TaskResult | null }
  | { status: 'cancelled'; task: WorkTask };

/** The most recent task for this kind + subject ref, or null. Walks backwards
    rather than filtering: the queue is insertion-ordered, so the last match is
    the newest one, and there is no need to build an intermediate array. */
function latestTask(tasks: readonly WorkTask[], kind: WorkTaskKind, ref: string): WorkTask | null {
  for (let i = tasks.length - 1; i >= 0; i -= 1) {
    const task = tasks[i];
    if (task !== undefined && task.kind === kind && task.subject.ref === ref) return task;
  }
  return null;
}

/**
 * The current — or most recent — task for `kind` + `ref`, plus its result once
 * it has one. `ref` is the same string the enqueuing handler wrote into
 * `subject.ref` (for condensation: `<unit>:<slug>`, see
 * `src/main/ipc/condense.ts`); an empty one means "no subject yet" and never
 * matches.
 */
export function useTaskForSubject(kind: WorkTaskKind, ref: string): TaskForSubject {
  const tasks = useWorkTasks();
  const task = ref.length === 0 ? null : latestTask(tasks, kind, ref);
  /* Asked only for a task that finished and says it left something behind —
     `hasResult` is exactly that flag, so a `done` task without one costs no
     round-trip. The id is part of the key, so a re-run's result never reads
     out of the previous run's cache entry. */
  const wantsResult = task !== null && task.state === 'done' && task.hasResult;
  const id = task?.id ?? '';
  const result = useQuery({
    queryKey: qk.tasks.result(id),
    queryFn: () => api.tasks.result(id),
    enabled: wantsResult,
  });

  if (task === null) return { status: 'idle' };
  switch (task.state) {
    case 'queued':
      return { status: 'queued', task, queuePosition: task.queuePosition };
    case 'running':
      return { status: 'running', task };
    case 'failed':
      /* `message` is the human sentence the failure came with, `error` the
         code `describeFailure` assigned it — the message first, because it is
         the one that says what actually went wrong. */
      return { status: 'failed', task, reason: task.message ?? task.error ?? '' };
    case 'cancelled':
      return { status: 'cancelled', task };
    default:
      return { status: 'done', task, result: wantsResult ? (result.data ?? null) : null };
  }
}

/** A failed task's two halves put back together as the `IpcError` `ErrorState`
    reads. `WorkTask.error` is typed as a plain string (`describeFailure` in
    `@core/ingest/job`), so an unrecognised one falls back to `unknown` — the
    reason itself is kept either way, which is the part a caller must show.
    Shared by every panel that renders a `'failed'` `TaskForSubject` next to
    its own trigger (condense's `CondensedUnitPanel`, the journal's day close,
    073 D5/D6) — one conversion, not one copy per caller. */
export function taskFailure(code: string | null, reason: string): IpcError {
  const candidate = { code: code ?? 'unknown', message: reason };
  return isIpcError(candidate) ? candidate : { code: 'unknown', message: reason };
}
