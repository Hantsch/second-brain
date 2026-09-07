/* Ask before a close kills a running maintenance pass (042, D6).
 *
 * This is a veto, and a veto is the one thing in a desktop app that can go
 * badly wrong: a `preventDefault()` too many and the app cannot be closed at
 * all. So the whole module is built around one invariant —
 *
 *   **one veto per shutdown, and no veto without an answer.**
 *
 * The "one veto" half is the `confirmed` flag plus the `pending` cycle below.
 * The "answer" half has three ways to arrive, and every one of them ends the
 * cycle: the user confirms (`confirmClose`, the close happens), the user
 * cancels (`cancelClose`, run and window are both left alone — AC 8), or the
 * renderer says nothing at all for `CONFIRM_TIMEOUT_MS` and the dead-man timer
 * carries the close out regardless. Only the third of those is a guess, and it
 * guesses in the direction of closing: a window the user cannot close is worse
 * than a killed maintenance run.
 *
 * This guard sits *in front of* `will-quit`'s `cancelGardenerRun('shutdown')`
 * (`index.ts`), it does not replace it: this one catches the common case and
 * asks; that one stays the last-resort net for every close that gets through
 * here — a timed-out prompt, a quit path nobody thought of, a window that was
 * already gone.
 */

import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { getWorkQueue } from './work-queue';
import type { Services } from './services';

/**
 * How long the renderer gets to answer `event:close-requested` before the
 * close happens anyway. Exported so a test can advance time by exactly this
 * much instead of hard-coding the same number twice.
 */
export const CONFIRM_TIMEOUT_MS = 5_000;

/** The only thing the guard needs from Electron's event object. */
interface VetoableEvent {
  preventDefault: () => void;
}

/**
 * The one veto cycle that can be open at a time: how to carry out the close
 * that was stopped, and the timer that carries it out if nobody answers.
 */
let pending: { proceed: () => void; timer: NodeJS.Timeout } | null = null;

/**
 * "This shutdown is authorised despite the run."
 *
 * It has to outlive the veto cycle rather than be cleared right after use,
 * because one confirmed shutdown walks past this guard more than once: a
 * confirmed `before-quit` lets `app.quit()` through, Electron then closes every
 * window, which fires `close` on the main one, whose `closed` calls
 * `app.quit()` again. Clearing the flag after the first of those passes would
 * make the second one veto — and thereby cancel the very quit the user just
 * confirmed.
 *
 * It is reset in `attachCloseGuard` instead, which is the one moment that
 * proves the flag is stale: a guard is attached exactly when a fresh main
 * window exists, and a fresh main window means the app outlived the close this
 * flag was granted for (macOS keeps the app running after the last window
 * closes, and `activate` builds a new one). Carrying an old authorisation into
 * that new window would let a later close — with a *new* run going — walk
 * straight through a guard that should have asked.
 */
let confirmed = false;

/** `before-quit` belongs to the app, not to a window: register it exactly once. */
let quitGuardInstalled = false;

/**
 * End the open veto cycle and hand back what it was holding, or `null` if
 * there is none. Every exit from a veto goes through here, so the timer is
 * cleared in exactly one place — a cycle that is dropped without clearing it
 * would fire later and close a window nobody asked to close.
 */
function endCycle(): (() => void) | null {
  const cycle = pending;
  if (!cycle) return null;
  pending = null;
  clearTimeout(cycle.timer);
  return cycle.proceed;
}

/**
 * Carry out the vetoed close — the confirm and the dead-man timer both land
 * here, so there is exactly one place that decides "the close now happens".
 */
function letThrough(): void {
  const proceed = endCycle();
  /* No cycle open means nothing was vetoed. Returning without setting
     `confirmed` is the point: a confirm that arrives out of the blue (a stale
     prompt, a renderer bug, a click that lost the race with the timer) must not
     leave an authorisation lying around for some later close that deserves to
     be asked about. */
  if (!proceed) return;
  confirmed = true;
  proceed();
}

/**
 * The guard itself, shared by both call sites. `proceed` is how *this* call
 * site retries once the close is authorised — `window.close()` resp.
 * `app.quit()`.
 */
function guard(services: Services, event: VetoableEvent, proceed: () => void): void {
  /* Already authorised. Not preventing it a second time is the whole point of
     the flag — this early return is what keeps the app closable. */
  if (confirmed) return;
  /* A queued task is dropped silently on close: nothing has been computed for
     it yet, and the registry's own shutdown handling clears the queue anyway
     (see `work-queue.ts`), so only a `running` task needs a veto of its own. */
  if (
    !getWorkQueue(services)
      .list()
      .some((task) => task.state === 'running')
  )
    return;
  /* Nobody left to ask. Vetoing here would stall the shutdown for the length of
     the timer and then do it anyway, because the confirm can never arrive — the
     window that would show the prompt is gone. This is also the normal path of
     a confirmed window close: `closed` calls `app.quit()`, and by then the
     window is destroyed. */
  const window = services.mainWindow();
  if (!window) return;

  event.preventDefault();

  /* A hidden or minimized window showing an invisible confirm dialog is, from
     AC7's point of view, the same as no confirm at all: the dead-man timer
     still fires and `will-quit` still kills the run mid-write, except now the
     user never had a chance to see the prompt and answer it. `mainWindow()`
     already guarantees this window is not destroyed, so restoring/showing it
     here is safe without another `isDestroyed()` check. */
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();

  /* A second attempt while the prompt is still up (× pressed twice, Alt+F4 on
     top of it) is vetoed just as well — but must not ask again or restart the
     timer, or holding the key down would push the dead-man switch out for as
     long as the user keeps pressing. */
  if (pending) return;

  pending = {
    proceed,
    /* Renderer silent — crashed, no listener, a prompt that never rendered.
       Silence is not a cancel: an actual cancel clears this timer
       (`cancelClose`), so the only thing left for it to cover is a renderer
       that cannot answer at all. A guard that can trap the user in an
       unclosable window is worse than a killed run, so then the close they
       asked for happens regardless; `will-quit` still stops the run on the way
       out. */
    timer: setTimeout(letThrough, CONFIRM_TIMEOUT_MS),
  };
  services.sendEvent('event:close-requested', undefined);
}

/**
 * The renderer's answer to `event:close-requested`: close anyway. Carries out
 * exactly the close that was vetoed — the renderer never says *which* close
 * that was, because only this module knows.
 */
export function confirmClose(): void {
  letThrough();
}

/**
 * The other answer: leave the run and the window alone (AC 8). The exact
 * opposite of `confirmClose` — it drops the vetoed close instead of carrying it
 * out, and above all it does **not** set `confirmed`, so nothing is authorised
 * for later.
 *
 * Cancelling the timer is the whole point of this existing at all: without it,
 * "cancel" would only postpone the close by `CONFIRM_TIMEOUT_MS` and then do it
 * anyway. Only this one attempt is dropped — the next close is judged from
 * scratch and is vetoed again if a run is still going.
 */
export function cancelClose(): void {
  endCycle();
}

/**
 * Guards `window`'s close and — once per process — every quit that does not go
 * through a window close. Call it for each main window, including a
 * re-created one: attaching is also what drops a stale authorisation (see
 * `confirmed`).
 */
export function attachCloseGuard(services: Services, window: BrowserWindow): void {
  /* A new main window means the app outlived whatever was confirmed before it,
     so neither the authorisation nor a half-answered prompt belongs to this
     window. */
  confirmed = false;
  if (pending) {
    clearTimeout(pending.timer);
    pending = null;
  }

  window.on('close', (event) => {
    /* Retry this window, not `services.mainWindow()`: it is this window's close
       that was vetoed, and the `isDestroyed` check keeps a confirm that arrives
       after the window went away from throwing. */
    guard(services, event, () => {
      if (!window.isDestroyed()) window.close();
    });
  });

  if (quitGuardInstalled) return;
  quitGuardInstalled = true;
  /* `close` covers the title bar's × and Alt+F4; `before-quit` covers the quit
     paths that never pass through a window close — the macOS menu today, a tray
     item tomorrow. */
  app.on('before-quit', (event) => {
    guard(services, event, () => app.quit());
  });
}
