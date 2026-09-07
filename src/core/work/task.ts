/**
 * A work task record: create, copy, label, and terminal-state helpers.
 *
 * Separate from `registry.ts` for the same reason `job.ts` is separate from
 * `queue.ts`: this file only knows what a `WorkTask` looks like, not when it runs.
 * Failure text is not reinvented here — `registry.ts` reuses `describeFailure`
 * from `core/ingest/job.ts`, one code plus one sentence for every kind of work.
 */

import type { WorkLane, WorkTask, WorkTaskKind, WorkTaskSubject } from '@shared/types';

/** States in which a task is neither running nor waiting to run. */
export const TERMINAL_STATES: ReadonlySet<WorkTask['state']> = new Set([
  'done',
  'failed',
  'cancelled',
]);

/** Length of a subject label in the queue list. */
const LABEL_CHARS = 80;

export interface EnqueueTaskInput {
  kind: WorkTaskKind;
  lane: WorkLane;
  subject: WorkTaskSubject;
}

/** Short form of a subject label — one line, no line breaks. */
export function taskLabel(label: string): string {
  const text = label.replace(/\s+/g, ' ').trim();
  return text.length <= LABEL_CHARS ? text : `${text.slice(0, LABEL_CHARS - 1)}…`;
}

/** A freshly enqueued task: queued, no progress, no error yet. */
export function createTask(id: string, input: EnqueueTaskInput, queuedAt: string): WorkTask {
  return {
    id,
    kind: input.kind,
    lane: input.lane,
    subject: { label: taskLabel(input.subject.label), ref: input.subject.ref },
    state: 'queued',
    progress: 0,
    message: null,
    error: null,
    queuePosition: null,
    queuedAt,
    startedAt: null,
    finishedAt: null,
  };
}

/** Copy without a shared reference — nobody outside mutates a task in flight. */
export function copyTask(task: WorkTask): WorkTask {
  return { ...task, subject: { ...task.subject } };
}
