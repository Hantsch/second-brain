/**
 * Work in flight is one queue.
 *
 * Every long-running task the app runs against the vault — condensation, day
 * close, the gardener, ingest — is enqueued here as one `WorkTask`, instead of
 * each feature keeping its own progress state. Deliberately simple, the same
 * shape as `core/ingest/queue.ts`: a list of entries, a pump loop, one
 * `AbortController` per running task, copy-on-read so nobody outside mutates a
 * task in flight.
 *
 * Two lanes, not one pool: `model` work may only run one at a time (a second
 * model call would just queue behind the first), `free` work runs alongside it
 * without waiting. A task only ever competes with tasks in its own lane —
 * `queuePosition` is relative to that lane, never a global count.
 *
 * Releasing a lane belongs in a `finally`, the same lesson `GardenerRunHandle`
 * (`src/main/gardener-run-state.ts`) learned the hard way: whatever a runner
 * does — resolve, throw, or get aborted — the lane has to free up so `pump()`
 * can start the next task, and a stale settle from a cancelled run must not
 * clobber whatever `cancel()` already recorded.
 *
 * Cancelling therefore ends a task on the spot instead of waiting for its runner
 * to notice the signal — the same choice `cancelGardenerRun` makes, for the same
 * reason: the next task must not be held up by a cancelled one that is still
 * unwinding, and on shutdown a runner that ignores its signal must not leave the
 * app showing work nobody is doing. What that runner still does afterwards is
 * ignored: a task transitions to a terminal state exactly once (`markFinished`).
 */

import { describeFailure } from '@core/ingest';
import { copyTask, createTask, TERMINAL_STATES } from './task';
import type { EnqueueTaskInput } from './task';
import type { WorkLane, WorkTask } from '@shared/types';

export type { EnqueueTaskInput };

/**
 * What a runner may report back when it finishes (story 073). Only one thing so
 * far: that it stored a result somewhere the task record does not carry — the
 * payload itself stays out of `WorkTask` (`src/core/tasks/results.ts` holds it),
 * so listing the queue never has to serialize a whole proposal.
 */
export interface WorkRunOutcome {
  hasResult?: boolean;
}

/** The runner a task executes; receives the signal that fires on cancellation,
    and the id of THIS entry's own task (073 review finding 1) — a retry reuses
    the original task's `run` closure for a brand-new `Entry` with its own id
    (see `retry()` below), so a runner that keyed its stored result off an
    outer variable captured once, at the first `enqueue()`, would still write
    under the failed run's id on a retry. Reading the id from the parameter
    instead is correct for both a fresh enqueue and a retry, since it always
    names the entry the runner is actually running for.
    Resolving with nothing is the normal case — a runner that produced a result
    says so by resolving `{ hasResult: true }`. */
export type WorkRunner = (signal: AbortSignal, taskId: string) => Promise<WorkRunOutcome | void>;

/** Capacity per lane — a flat map, or a function for callers that compute it. */
export type WorkLaneCapacity = Partial<Record<WorkLane, number>> | ((lane: WorkLane) => number);

const DEFAULT_CAPACITY: Record<WorkLane, number> = {
  model: 1,
  free: Number.POSITIVE_INFINITY,
  /* Mirrors `IngestQueue.DEFAULT_CONCURRENCY` (`src/core/ingest/queue.ts`) —
     imports keep their existing real-world concurrency. Only matters for a
     caller that never overrides `laneCapacity`, since import tasks started
     via `startExternal` never go through this registry's own pump anyway. */
  import: 2,
};

/** Finished tasks kept for history; the oldest finished one is dropped past this. */
const RETENTION = 50;

export interface WorkRegistryDeps {
  now?: () => Date;
  newId?: () => string;
  onChange?: (tasks: WorkTask[]) => void;
  laneCapacity?: WorkLaneCapacity;
}

/**
 * Why a cancellation happened — the same split as `GardenerCancelReason`:
 * `'user'` is someone pressing stop, `'shutdown'` is the vault closing or the app
 * quitting. Named because `cancel()` is public API.
 */
export type CancelReason = 'user' | 'shutdown';

interface Entry {
  task: WorkTask;
  run: WorkRunner;
  controller: AbortController | null;
  cancelReason: CancelReason | null;
  /** True from the moment this task reached a terminal state — see `markFinished`. */
  settled: boolean;
  /**
   * Reports a cancellation back to a producer that paces this task from
   * outside the registry's own pump (`startExternal`) — unset for a normal
   * `enqueue`d entry, which instead reacts to its own `AbortSignal`.
   */
  onCancel?: (reason: CancelReason) => void;
  /**
   * True for an entry created via `startExternal`. `pump()` must skip these:
   * a `startExternal(..., { state: 'queued' })` entry sits with
   * `controller: null` and `state: 'queued'` until its own handle calls
   * `.start()` — indistinguishable from a normal queued entry on those two
   * fields alone, so without this flag the next unrelated `pump()` call
   * (triggered by any other task's `enqueue`/`cancel`) would wrongly hand it
   * to the private `start()` method and run its no-op stub closure.
   */
  external: boolean;
}

/**
 * A task whose lifecycle is paced from outside the registry's own pump — the
 * gardener run and an ingest job (074 D2/D4), neither of which is "a promise
 * the registry awaits end-to-end". The registry only mirrors what the caller
 * reports through this handle, and reports cancellation back via `onCancel`.
 */
export interface ExternalTaskHandle {
  readonly id: string;
  /** Move a queued external task to running; a no-op if already running or settled. */
  start(): void;
  /** Patch progress/message/detail while running; a no-op once settled. */
  update(patch: Partial<Pick<WorkTask, 'progress' | 'message' | 'detail'>>): void;
  /** Settle successfully; a no-op if already settled (e.g. already cancelled). */
  finish(outcome?: WorkRunOutcome): void;
  /** Settle as failed, via `describeFailure` — same failure text every other producer uses. */
  fail(error: unknown): void;
}

export class WorkRegistry {
  private readonly deps: WorkRegistryDeps;
  private readonly entries: Entry[] = [];
  /** Finished entries in the order they finished — the front is the oldest. */
  private readonly finished: Entry[] = [];
  private sequence = 0;

  constructor(deps: WorkRegistryDeps = {}) {
    this.deps = deps;
  }

  /** Enqueue a task and drive the pump — it runs as soon as its lane is free. */
  enqueue(input: EnqueueTaskInput, run: WorkRunner): WorkTask {
    this.sequence += 1;
    const id = this.deps.newId?.() ?? `work-${this.sequence}`;
    const task = createTask(id, input, this.stamp());
    this.entries.push({
      task,
      run,
      controller: null,
      cancelReason: null,
      settled: false,
      external: false,
    });
    this.recomputeQueuePositions(task.lane);
    this.emit();
    this.pump();
    return copyTask(task);
  }

  /**
   * Run a failed task again — as a *new* task, with the failed one left as it is.
   *
   * Deliberately not a state change on the old record: its failure is what the
   * user just read, and rewinding it to `queued` would erase both the error and
   * the fact that an attempt happened at all. So the old entry is only read
   * here — its `kind`, `lane`, `subject`, and the very `run` closure it was
   * enqueued with, which is why the retry does the same work rather than an
   * approximation of it. The new task then competes for its lane like any other.
   *
   * `null` means there is nothing to retry: no such task (finished ones are
   * only kept up to `RETENTION`), or one that did not fail — `done` and
   * `cancelled` work is not silently redone, and a queued or running task is
   * already on its way. Also `null` for an `external` entry (`startExternal`,
   * 074 D2/D4): its stored `run` is the no-op stub `startExternal` creates,
   * so re-enqueuing it would produce a task that resolves instantly as `done`
   * while nothing was actually retried — the gardener run and an ingest job
   * each have their own real retry path instead.
   */
  retry(id: string): WorkTask | null {
    const entry = this.find(id);
    if (entry === null || entry.external || entry.task.state !== 'failed') return null;
    const { kind, lane, subject } = entry.task;
    return this.enqueue({ kind, lane, subject: { ...subject } }, entry.run);
  }

  /** All tasks, insertion order — copies, nothing a caller could mutate live. */
  list(): WorkTask[] {
    return this.entries.map((entry) => copyTask(entry.task));
  }

  /**
   * Push a progress tick from a producer whose own code paces the run, not the
   * registry's `run` closure — used by `ExternalTaskHandle.update` and
   * available directly for the same purpose. A no-op if there's no such task,
   * or it has already settled.
   */
  updateProgress(
    id: string,
    patch: Partial<Pick<WorkTask, 'progress' | 'message' | 'detail'>>,
  ): void {
    const entry = this.find(id);
    if (entry === null || entry.settled) return;
    Object.assign(entry.task, patch);
    this.emit();
  }

  /**
   * Start a task whose lifecycle is paced from outside this registry's own
   * pump (the gardener run, an ingest job — 074 D2/D4): created here exactly
   * like `enqueue`, but never handed to `pump()`. Its lane is for display and
   * classification only — it does not compete for that lane's capacity
   * against tasks started via `enqueue`. True cross-producer serialisation
   * between an externally-paced task and a normally enqueued one is out of
   * scope for this primitive; a deliberate limitation, not an oversight.
   */
  startExternal(
    input: EnqueueTaskInput,
    options?: { onCancel?: (reason: CancelReason) => void; state?: 'queued' | 'running' },
  ): ExternalTaskHandle {
    this.sequence += 1;
    const id = this.deps.newId?.() ?? `work-${this.sequence}`;
    const task = createTask(id, input, this.stamp());
    // Not `enqueue()`'s "run this closure" — this entry's `run` is a no-op
    // stub (below), so the renderer must never offer the generic retry for
    // it (see `WorkTask.retryable`'s own doc comment for why).
    task.retryable = false;
    const state = options?.state ?? 'running';
    if (state === 'running') {
      task.state = 'running';
      task.startedAt = this.stamp();
    }
    const entry: Entry = {
      task,
      run: async () => {},
      controller: null,
      cancelReason: null,
      settled: false,
      onCancel: options?.onCancel,
      external: true,
    };
    this.entries.push(entry);
    this.recomputeQueuePositions(task.lane);
    this.emit();
    return this.externalHandle(entry);
  }

  private externalHandle(entry: Entry): ExternalTaskHandle {
    return {
      id: entry.task.id,
      start: () => {
        if (entry.settled || entry.task.state !== 'queued') return;
        entry.task.state = 'running';
        entry.task.startedAt = this.stamp();
        // Recompute before emitting, same as the real `start()`: leaving the
        // queue shifts the positions of everything still waiting in this lane.
        this.recomputeQueuePositions(entry.task.lane);
        this.emit();
      },
      update: (patch) => this.updateProgress(entry.task.id, patch),
      finish: (outcome) => {
        this.markFinished(entry, {
          state: 'done',
          progress: 1,
          message: null,
          error: null,
          hasResult: outcome?.hasResult ?? false,
        });
      },
      fail: (error) => {
        const failure = describeFailure(error);
        this.markFinished(entry, {
          state: 'failed',
          error: failure.code,
          message: failure.message,
        });
      },
    };
  }

  /**
   * Cancel one task: a queued one never starts, a running one is asked to stop
   * via its signal. Either way the task is `cancelled` when this returns and the
   * next queued task in its lane has been given the slot. `false` means there was
   * nothing to cancel — no such task, or it had already finished.
   */
  cancel(id: string, reason: CancelReason = 'user'): boolean {
    const entry = this.find(id);
    if (entry === null || entry.settled) return false;
    this.terminate(entry, reason);
    this.pump();
    return true;
  }

  /**
   * Cancel every task not already finished — vault close, app quit. All entries
   * are taken out in one pass before anything pumps: a per-task cancel would let
   * `pump()` start a queued runner in between, and on shutdown no runner should
   * be started at all.
   */
  cancelAll(reason: CancelReason): void {
    const open = this.entries.filter((entry) => !entry.settled);
    for (const entry of open) this.terminate(entry, reason);
  }

  /** Drop finished tasks from the list; running and queued tasks stay. */
  clear(): void {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index];
      if (entry !== undefined && TERMINAL_STATES.has(entry.task.state)) {
        this.entries.splice(index, 1);
        const finishedIndex = this.finished.indexOf(entry);
        if (finishedIndex !== -1) this.finished.splice(finishedIndex, 1);
      }
    }
    this.emit();
  }

  private find(id: string): Entry | null {
    return this.entries.find((entry) => entry.task.id === id) ?? null;
  }

  private stamp(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }

  private emit(): void {
    this.deps.onChange?.(this.list());
  }

  private capacityFor(lane: WorkLane): number {
    const capacity = this.deps.laneCapacity;
    if (capacity === undefined) return DEFAULT_CAPACITY[lane];
    const value = typeof capacity === 'function' ? capacity(lane) : capacity[lane];
    return value ?? DEFAULT_CAPACITY[lane];
  }

  /** Start as many queued tasks per lane as that lane's capacity allows. */
  private pump(): void {
    const lanes = new Set(this.entries.map((entry) => entry.task.lane));
    for (const lane of lanes) {
      const capacity = this.capacityFor(lane);
      let running = this.entries.filter(
        (entry) => entry.task.lane === lane && entry.controller !== null,
      ).length;
      for (const entry of this.entries) {
        if (entry.task.lane !== lane || running >= capacity) continue;
        if (entry.task.state !== 'queued' || entry.controller !== null) continue;
        if (entry.external) continue;
        running += 1;
        void this.start(entry);
      }
    }
  }

  /** 1-based position among tasks still waiting for this lane, or null once started. */
  private recomputeQueuePositions(lane: WorkLane): void {
    const waiting = this.entries.filter(
      (entry) => entry.task.lane === lane && entry.task.state === 'queued',
    );
    waiting.forEach((entry, index) => {
      entry.task.queuePosition = index + 1;
    });
  }

  private async start(entry: Entry): Promise<void> {
    const controller = new AbortController();
    entry.controller = controller;
    entry.task.state = 'running';
    entry.task.startedAt = this.stamp();
    entry.task.queuePosition = null;
    // Recompute before emitting: the task leaving the queue shifts the
    // positions of everything still waiting behind it in this lane, and the
    // emitted snapshot must reflect that shift, not the stale positions.
    this.recomputeQueuePositions(entry.task.lane);
    this.emit();

    try {
      const outcome = await entry.run(controller.signal, entry.task.id);
      this.settle(entry, null, outcome ?? undefined);
    } catch (error) {
      this.settle(entry, error);
    } finally {
      entry.controller = null;
      this.pump();
    }
  }

  /**
   * Take a task out of flight now: stop its runner and record `cancelled`.
   *
   * The lane is freed here rather than when the runner notices its signal, which
   * is what `cancelGardenerRun` does too. A runner may ignore the signal, or take
   * a while to unwind; either way it keeps the signal it was handed, while the
   * registry stops accounting for it. Its later settle is ignored.
   */
  private terminate(entry: Entry, reason: CancelReason): void {
    entry.cancelReason = reason;
    entry.controller?.abort();
    entry.controller = null;
    this.markCancelled(entry, reason);
    // Called after the entry is already settled (markCancelled is guarded by
    // markFinished's settled check), so a hook that re-enters cancel()/
    // terminate() for this same id hits that guard and is a safe no-op —
    // this matters because a real hook (074 D2) calls back into code that
    // may itself try to cancel the same task again.
    entry.onCancel?.(reason);
  }

  /**
   * A runner ends one of two ways: it resolves (`error` is null) or it throws —
   * a real failure, or the abort a cancel triggered. The third case, a task
   * `cancel()` already ended, needs no branch here: `markFinished` refuses a
   * second transition, so the user's cancel wins over the runner's own outcome.
   *
   * `outcome` is what the runner resolved with, and only the success branch
   * reads it: a task that failed or was cancelled has no result to point at,
   * so `hasResult` stays `false` there — the value `createTask` starts from.
   */
  private settle(entry: Entry, error: unknown, outcome?: WorkRunOutcome): void {
    if (error === null) {
      this.markFinished(entry, {
        state: 'done',
        progress: 1,
        message: null,
        error: null,
        hasResult: outcome?.hasResult ?? false,
      });
    } else {
      const failure = describeFailure(error);
      this.markFinished(entry, {
        state: 'failed',
        error: failure.code,
        message: failure.message,
      });
    }
  }

  private markCancelled(entry: Entry, reason: CancelReason): void {
    this.markFinished(entry, {
      state: 'cancelled',
      error: null,
      message: reason === 'shutdown' ? 'Cancelled: the app is shutting down.' : null,
    });
  }

  /**
   * The one place a task becomes terminal — and it does so exactly once.
   *
   * A runner cancelled mid-await may still resolve or throw afterwards. That
   * stale settle must not overwrite the `cancelled` state `cancel()` recorded,
   * must not re-stamp `finishedAt`, and must not enter the retention list a
   * second time — a duplicate there would evict a task that is still listed.
   * Same guard as `publish` in `src/main/gardener-run-state.ts`, where a step
   * from a run that has lost its slot must not overwrite a newer run's state.
   */
  private markFinished(
    entry: Entry,
    patch: Pick<WorkTask, 'state' | 'error' | 'message'> & Partial<WorkTask>,
  ): void {
    if (entry.settled) return;
    entry.settled = true;
    Object.assign(entry.task, patch, { finishedAt: this.stamp(), queuePosition: null });
    // Recompute before emitting: a task leaving the queue (or finishing while
    // running) shifts the positions of whatever is still waiting in this
    // lane, and the emitted snapshot must show that, not stale positions.
    this.recomputeQueuePositions(entry.task.lane);
    this.finished.push(entry);
    this.retain();
    this.emit();
  }

  /** Keep only the `RETENTION` most recently finished tasks; oldest dropped first. */
  private retain(): void {
    while (this.finished.length > RETENTION) {
      const oldest = this.finished.shift();
      if (oldest === undefined) break;
      const index = this.entries.indexOf(oldest);
      if (index !== -1) this.entries.splice(index, 1);
    }
  }
}
