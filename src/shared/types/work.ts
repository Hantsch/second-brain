/**
 * Work in flight is one queue: the shape shared by every long-running task the
 * app runs on the vault — condensation, day close, the gardener, ingest,
 * the journal interview plan. One record type so one screen can list all of
 * them side by side, instead of one ad-hoc progress indicator per feature.
 * `detail` is the one field that isn't generic across kinds — see its own
 * doc comment below.
 */

import type { GardenerRunProgress } from './gardener';
import type { IngestJob } from './knowledge';
import type { TaskKind } from './llm';

/** What kind of long-running work this task performs. */
export type WorkTaskKind = 'condense' | 'close-day' | 'gardener' | 'ingest' | 'interview-plan';

/**
 * Where a task stands. Mirrors `IngestStage`'s terminal/non-terminal split, but
 * collapsed to the states every kind of work shares — a task's own progress
 * detail (e.g. ingest's `fetching`/`writing-raw`) lives in `message`, not here.
 */
export type WorkTaskState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/**
 * A lane a task competes for. `model` holds work that needs an LLM and may only
 * run one at a time (a second model call would just queue behind the first
 * anyway); `free` holds work that needs no model and can run alongside it;
 * `import` holds ingest jobs, whose real concurrency is `IngestQueue`'s own
 * (see `src/core/ingest/queue.ts`) — this lane's accounting is display-only.
 */
export type WorkLane = 'model' | 'free' | 'import';

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
  /**
   * A kind-specific snapshot a task's own display logic needs beyond the
   * generic fields above — an `IngestJob` for an `'import'` task, so the
   * renderer can keep rendering ingest's existing stage/message detail
   * unchanged, and a `GardenerRunProgress` for a `'gardener'` task, so the
   * run's own weighted numbers travel with the task record instead of over a
   * second channel (074 D2). Additive per kind: each producer only ever sets
   * the variant its own kind carries.
   */
  detail: WorkTaskDetail | null;
  /**
   * Whether the generic Tasks-screen retry action (`tasks:retry`) can do
   * anything useful for this task. `true` for a task created the normal way
   * (`WorkRegistry.enqueue`, including a retry's own re-enqueue) — its stored
   * runner is the real work, so retrying it re-runs that work. `false` for a
   * task whose lifecycle is paced from outside the registry's own pump
   * (`WorkRegistry.startExternal` — the mirrored gardener run and a mirrored
   * ingest job, 074 D2/D4): its stored runner is a no-op stub, so retrying it
   * would silently resolve `done` without redoing anything real — see
   * `WorkRegistry.retry()`'s own doc comment. Deliberately not `kind`: a
   * `kind` alone conflates "this kind is usually external" with "this
   * particular task is", which is not the same fact (`tasks-e2e-fixture.ts`
   * enqueues an `ingest`-kind task the normal way on purpose, precisely to
   * exercise this generic retry path in e2e).
   */
  retryable: boolean;
  /**
   * The LLM task this work routes through, so the Tasks screen can name the
   * model it is running on. Set by the producer (it knows; `kind` alone does
   * not — `condense` is area, project or module); absent for work that never calls a
   * model, or whose task changes mid-run (the gardener: see `tasks-view.ts`).
   */
  llmTask?: TaskKind;
}

export type WorkTaskDetail = IngestJob | GardenerRunProgress;
