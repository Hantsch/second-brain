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

/** The runner a task executes; receives the signal that fires on cancellation. */
export type WorkRunner = (signal: AbortSignal) => Promise<void>;

/** Capacity per lane — a flat map, or a function for callers that compute it. */
export type WorkLaneCapacity = Partial<Record<WorkLane, number>> | ((lane: WorkLane) => number);

const DEFAULT_CAPACITY: Record<WorkLane, number> = {
  model: 1,
  free: Number.POSITIVE_INFINITY,
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
    this.entries.push({ task, run, controller: null, cancelReason: null, settled: false });
    this.recomputeQueuePositions(task.lane);
    this.emit();
    this.pump();
    return copyTask(task);
  }

  /** All tasks, insertion order — copies, nothing a caller could mutate live. */
  list(): WorkTask[] {
    return this.entries.map((entry) => copyTask(entry.task));
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
      await entry.run(controller.signal);
      this.settle(entry, null);
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
  }

  /**
   * A runner ends one of two ways: it resolves (`error` is null) or it throws —
   * a real failure, or the abort a cancel triggered. The third case, a task
   * `cancel()` already ended, needs no branch here: `markFinished` refuses a
   * second transition, so the user's cancel wins over the runner's own outcome.
   */
  private settle(entry: Entry, error: unknown): void {
    if (error === null) {
      this.markFinished(entry, { state: 'done', progress: 1, message: null, error: null });
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
