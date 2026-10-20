/**
 * A work task record: create, copy, label, and terminal-state helpers.
 *
 * Separate from `registry.ts` for the same reason `job.ts` is separate from
 * `queue.ts`: this file only knows what a `WorkTask` looks like, not when it runs.
 * Failure text is not reinvented here — `registry.ts` reuses `describeFailure`
 * from `core/ingest/job.ts`, one code plus one sentence for every kind of work.
 */

import type {
  WorkLane,
  WorkTask,
  WorkTaskDetail,
  WorkTaskKind,
  WorkTaskSubject,
  TaskKind,
} from '@shared/types';

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
  /** Kind-specific snapshot, e.g. an `IngestJob` for an import task — see `WorkTask.detail`. */
  detail?: WorkTaskDetail;
  /** The LLM task this work routes through — see `WorkTask.llmTask`. */
  llmTask?: TaskKind;
}

/** Short form of a subject label — one line, no line breaks. */
export function taskLabel(label: string): string {
  const text = label.replace(/\s+/g, ' ').trim();
  return text.length <= LABEL_CHARS ? text : `${text.slice(0, LABEL_CHARS - 1)}…`;
}

/**
 * A freshly enqueued task: queued, no progress, no error yet.
 *
 * `retryable` starts `true` here because this is the normal `enqueue()`/
 * `retry()` path — the task carries a real runner, so the generic retry
 * action can always redo its work. `WorkRegistry.startExternal` builds its
 * own entry directly rather than through this function, and sets `false`
 * there — see that call site's own comment for why.
 */
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
    /* Only a finished runner can report a result — see `WorkRunner`'s return
       value in `registry.ts`, which `settle()` merges in on the success branch. */
    hasResult: false,
    detail: input.detail ?? null,
    retryable: true,
    ...(input.llmTask === undefined ? {} : { llmTask: input.llmTask }),
  };
}

/**
 * Copy without a shared reference — nobody outside mutates a task in flight.
 * `detail` is a shallow reference: callers always replace the whole `detail`
 * value (via `updateProgress`/`ExternalTaskHandle.update`) rather than
 * mutating it in place, so no deep clone is needed here.
 */
export function copyTask(task: WorkTask): WorkTask {
  return { ...task, subject: { ...task.subject } };
}
