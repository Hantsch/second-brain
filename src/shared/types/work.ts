/**
 * Work in flight is one queue: the shape shared by every long-running task the
 * app runs on the vault — condensation, day close, the gardener, ingest. One
 * record type so one screen can list all of them side by side, instead of one
 * ad-hoc progress indicator per feature.
 */

/** What kind of long-running work this task performs. */
export type WorkTaskKind = 'condense' | 'close-day' | 'gardener' | 'ingest';

/**
 * Where a task stands. Mirrors `IngestStage`'s terminal/non-terminal split, but
 * collapsed to the states every kind of work shares — a task's own progress
 * detail (e.g. ingest's `fetching`/`writing-raw`) lives in `message`, not here.
 */
export type WorkTaskState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/**
 * A lane a task competes for. `model` holds work that needs an LLM and may only
 * run one at a time (a second model call would just queue behind the first
 * anyway); `free` holds work that needs no model and can run alongside it.
 */
export type WorkLane = 'model' | 'free';

/** What a task is about, for display — a one-line label plus an optional link back. */
export interface WorkTaskSubject {
  label: string;
  /** Vault-relative path or other identifier the task concerns, or null if none applies. */
  ref: string | null;
}

export interface WorkTask {
  id: string;
  kind: WorkTaskKind;
  lane: WorkLane;
  subject: WorkTaskSubject;
  state: WorkTaskState;
  /** 0..1. */
  progress: number;
  message: string | null;
  /** Failure code from `describeFailure`, or null while not failed. */
  error: string | null;
  /**
   * 1-based place among tasks waiting for this task's lane, or null once the
   * task is running or finished — position is relative to the lane, not global.
   */
  queuePosition: number | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /**
   * Whether this task left a result behind (story 073) — a proposal a run the
   * user walked away from produced, fetchable via `tasks:result`. Only a `done`
   * task can carry one; the payload itself never rides along in this record, so
   * listing the queue stays cheap (see `src/core/tasks/results.ts`).
   */
  hasResult: boolean;
}
