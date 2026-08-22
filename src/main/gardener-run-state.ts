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

import type { GardenerRunTrigger } from '@shared/types';
import type { GardenerProgressEvent } from './ipc/gardener-deps';

/** What a run last reported — the widened `event:gardener-progress` payload. */
export type GardenerRunSnapshot = GardenerProgressEvent;

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
   */
  finish: () => void;
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
}

interface ActiveRun {
  controller: AbortController;
  snapshot: GardenerRunSnapshot;
  /** Set once, by `cancelGardenerRun`. Stays readable after the slot is freed. */
  cancelled: GardenerCancelReason | null;
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
  };
  active = run;

  const publish = (progress: GardenerRunSnapshot): void => {
    /* A step from a run that has already lost the slot (cancelled, or ended)
       must not overwrite what a newer run is reporting, and — if a newer run
       has since taken the slot — must not emit at all: its stale "not
       running" would go out after that newer run's own events and desync
       every listener from the true state. Only emit when this run still
       owns the slot, or when nobody has taken it since (active === null). */
    if (active === run) run.snapshot = progress;
    if (active === run || active === null) options.emit(progress);
  };

  return {
    trigger: options.trigger,
    startedAt,
    signal: run.controller.signal,
    publish,
    cancelledBy: () => run.cancelled,
    finish: () => {
      try {
        publish(snapshotOf(options.trigger, startedAt, false));
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
  active.cancelled = reason;
  active.controller.abort();
  active = null;
}
