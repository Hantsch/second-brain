/* Who owns "a maintenance run is going" — the one answer, for everyone.
 *
 * There used to be two truths: a module-local `running: AbortController` in
 * `ipc/gardener.ts` and a `busy` flag in `gardener-autorun.ts`. Two truths mean
 * two runs over the same vault could overlap (the channel does not see the
 * autostart, and the autostart does not see the channel), and `cancelGardenerRun`
 * — the one thing that has to work on closing the vault and on quitting — could
 * only reach one of them. So the state lives here, once:
 *
 * - **A run is going exactly when there is a snapshot.** `beginGardenerRun`
 *   seeds one and refuses (`null`) while another run holds the slot, so
 *   "is a run going" and "what is it doing" are the same question with one
 *   answer — that is what `gardener:runStatus` will read.
 * - **Every publish emits.** The snapshot is not a second channel next to
 *   `event:gardener-progress`; it is the last thing that went out over it.
 * - **Ending clears, whatever happened.** `finish()` clears the slot in a
 *   `finally`, so a throw — even one from the emit itself — cannot leave the
 *   app showing a run that nobody is computing.
 *
 * The module holds process-wide state on purpose, the same as the flag it
 * replaces: there is one open vault, and two runs over it would write the same
 * report twice, at double the cost if a model is involved.
 */

import type { GardenerRunProgress, GardenerRunTrigger } from '@shared/types';
import type { ExternalTaskHandle, WorkRegistry } from '@core/work/registry';

/** What a run last reported — the one shared progress shape (074, D2). */
export type GardenerRunSnapshot = GardenerRunProgress;

/**
 * Why a run was stopped — and with it, what may be kept (021b, D2).
 *
 * - `'user'`: someone pressed stop. What the finished stages found is worth
 *   keeping, so the caller stores a partial run.
 * - `'shutdown'`: the vault is being closed or the app is quitting. Nothing is
 *   written: a vault on its way out must not be left with half a report, and on
 *   quit the atomic write could not be awaited anyway.
 */
export type GardenerCancelReason = 'user' | 'shutdown';

/** The running run, from the point of view of the one who started it. */
export interface GardenerRunHandle {
  /** Who asked for this run. */
  readonly trigger: GardenerRunTrigger;
  /** When it started — ISO, the same value every snapshot of it carries. */
  readonly startedAt: string;
  /** Hand this to `runWithProgress`, so a cancel actually lands. */
  readonly signal: AbortSignal;
  /** Record **and** emit one progress step. Pass as `onProgress`. */
  publish: (progress: GardenerRunSnapshot) => void;
  /**
   * End the run: emit a terminating snapshot and clear the state. Belongs in a
   * `finally` — a cancelled or failed run has to end as visibly as a finished
   * one, otherwise the indicator keeps spinning over nothing. Calling it twice,
   * or after a `cancelGardenerRun`, only emits; it never takes a slot away from
   * a run that started in the meantime.
   *
   * `error` is what actually ended the run, if anything did: passing one
   * settles the mirrored work task as `'failed'` (via `describeFailure`)
   * instead of `'done'`. Omitting it — what every caller that simply ends did
   * before — means "it ended", which is why the parameter is optional.
   */
  finish: (error?: unknown) => void;
  /**
   * Why **this** run was stopped, or `null` if nobody stopped it (021b, D2).
   * Asked after `runWithProgress` returns, so the caller can tell a stop it may
   * keep something from (`'user'`) from one it must not write for
   * (`'shutdown'`). Answers for this run even though a cancel frees the slot
   * right away — the reason is recorded on the run, not on the slot.
   */
  cancelledBy: () => GardenerCancelReason | null;
}

export interface BeginGardenerRunOptions {
  trigger: GardenerRunTrigger;
  /** Where a published step goes — `services.sendEvent`, in both callers. */
  emit: (progress: GardenerRunSnapshot) => void;
  /**
   * When given, this run is ALSO mirrored onto the shared work registry as a
   * `'gardener'`-kind task on the `model` lane — for display and for the app's
   * quit/close guard. Omitted entirely by the existing unit test, which is
   * intentional: this file's own local slot/publish/finish semantics below
   * must not depend on it in any way.
   */
  workQueue?: WorkRegistry;
}

interface ActiveRun {
  controller: AbortController;
  snapshot: GardenerRunSnapshot;
  /** Set once, by `cancelGardenerRun`. Stays readable after the slot is freed. */
  cancelled: GardenerCancelReason | null;
  /** The registry this run is mirrored on, or `null` when nobody asked for one. */
  workQueue: WorkRegistry | null;
  /** The mirrored task, once started. `null` without a `workQueue`. */
  taskHandle: ExternalTaskHandle | null;
}

let active: ActiveRun | null = null;

function snapshotOf(
  trigger: GardenerRunTrigger,
  startedAt: string,
  running: boolean,
): GardenerRunSnapshot {
  return {
    phase: running ? 'checks' : 'done',
    check: null,
    done: 0,
    total: 0,
    running,
    stage: running ? 'checks' : 'done',
    percent: running ? 0 : 100,
    remaining: [],
    startedAt,
    trigger,
  };
}

/**
 * Claim the run slot. `null` means one is already going — the caller decides
 * what that is: an error in the channel, `'busy'` in the autostart. The claim
 * happens synchronously, before the caller's first `await`, so two calls from
 * the same keypress cannot both get through.
 */
export function beginGardenerRun(options: BeginGardenerRunOptions): GardenerRunHandle | null {
  if (active !== null) return null;
  const startedAt = new Date().toISOString();
  const run: ActiveRun = {
    controller: new AbortController(),
    snapshot: snapshotOf(options.trigger, startedAt, true),
    cancelled: null,
    workQueue: options.workQueue ?? null,
    taskHandle: null,
  };
  active = run;

  /* The mirror, if the caller wanted one. `startExternal` defaults to
     `'running'`, which is right here: a maintenance run starts the moment the
     slot is claimed, it is never queued behind anything.

     `onCancel` calling back into this module's own `cancelGardenerRun` is not
     a loop: by the time the registry fires the hook it has already marked the
     entry `settled` (`WorkRegistry.terminate()` calls `markCancelled` before
     `onCancel`), so the reach-back in `cancelGardenerRun` below hits
     `WorkRegistry.cancel()`'s own settled guard and is a no-op. */
  const taskHandle =
    options.workQueue?.startExternal(
      {
        kind: 'gardener',
        lane: 'model',
        subject: { label: 'Maintenance run', ref: null },
        /* The mirror is seeded with the same snapshot the slot was claimed
           with, so the task answers "what is it doing" from the first moment
           too — the invariant the local snapshot keeps (see the header). Set
           at creation rather than by a follow-up `update`, so claiming the
           slot stays one state change, not two. */
        detail: run.snapshot,
      },
      { onCancel: (reason) => cancelGardenerRun(reason) },
    ) ?? null;
  run.taskHandle = taskHandle;

  const publish = (progress: GardenerRunSnapshot): void => {
    /* A step from a run that has already lost the slot (cancelled, or ended)
       must not overwrite what a newer run is reporting, and — if a newer run
       has since taken the slot — must not emit at all: its stale "not
       running" would go out after that newer run's own events and desync
       every listener from the true state. Only emit when this run still
       owns the slot, or when nobody has taken it since (active === null). */
    if (active === run) run.snapshot = progress;
    if (active === run || active === null) options.emit(progress);
    /* Same guard, same reason: a step from a run that has lost the slot must
       not overwrite what a newer run is showing on the Tasks screen either.
       `WorkTask.progress` is 0..1, `percent` is 0..100 — hence the division;
       `detail` carries the whole snapshot, so `gardener:runStatus` and the
       renderer read back exactly the numbers this run published. */
    if (active === run) {
      run.taskHandle?.update({ progress: progress.percent / 100, message: null, detail: progress });
    }
  };

  return {
    trigger: options.trigger,
    startedAt,
    signal: run.controller.signal,
    publish,
    cancelledBy: () => run.cancelled,
    finish: (error?: unknown) => {
      try {
        publish(snapshotOf(options.trigger, startedAt, false));
        /* Settle the mirror as whatever actually happened. Both are no-ops on
           an already-settled task, so a run that was cancelled first keeps the
           `'cancelled'` the registry recorded. */
        if (error !== undefined) run.taskHandle?.fail(error);
        else run.taskHandle?.finish({ hasResult: false });
      } finally {
        if (active === run) active = null;
      }
    },
  };
}

/** What the current run last reported; `null` when none is going. */
export function gardenerRunSnapshot(): GardenerRunSnapshot | null {
  return active?.snapshot ?? null;
}

/** Is a maintenance run currently in progress — no matter who started it? */
export function gardenerRunning(): boolean {
  return active !== null;
}

/**
 * Cancels the running maintenance run — on closing the vault and on quitting,
 * and behind `gardener:cancel`. Reaches a run the autostart began just as well
 * as one the user asked for; without a run it does nothing.
 *
 * The slot is freed right away rather than when the run notices its signal: the
 * next run must not be refused because a cancelled one is still unwinding. The
 * reason is recorded on the run itself first, so its own caller can still read
 * it afterwards (`handle.cancelledBy()`) even though the slot is already gone.
 *
 * `reason` defaults to `'shutdown'` — the one that keeps nothing. A caller that
 * doesn't say what kind of stop this is can then only lose a half report, never
 * silently persist one.
 */
export function cancelGardenerRun(reason: GardenerCancelReason = 'shutdown'): void {
  if (active === null) return;
  const run = active;
  run.cancelled = reason;
  run.controller.abort();
  active = null;
  /* And the mirror with it, so the Tasks screen does not keep a running entry
     nobody is computing. A no-op when the cancel came *from* the registry
     (Tasks screen "stop" -> `WorkRegistry.cancel()` -> `onCancel` -> here):
     that entry is already settled by the time the hook runs, and
     `WorkRegistry.cancel()` refuses to act on a settled entry. */
  if (run.workQueue && run.taskHandle) run.workQueue.cancel(run.taskHandle.id, reason);
}
