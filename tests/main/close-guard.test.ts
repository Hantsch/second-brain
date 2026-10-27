/* 042, D6: the veto in front of `close` and `before-quit` while a maintenance
   run is going.

   The thing worth testing here is not that the warning appears — it is that
   every path out of the warning ends somewhere, and that no path vetoes twice.
   A second `preventDefault()` on an already-answered close is what turns a
   display problem into an app that cannot be closed, so each case below counts
   the preventDefaults rather than just checking the outcome.

   AC 8 in particular: cancelling leaves both the run and the window alone. A
   cancel that only cleared the flag and left the dead-man timer running would
   still close the window `CONFIRM_TIMEOUT_MS` later, i.e. it would postpone the
   close instead of calling it off — which is why the timer is asserted on
   directly, with fake timers wound past it. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { WorkTaskKind, WorkTaskState } from '@shared/types';
import type { Services } from '../../src/main/services';
import type { CloseGuardOptions } from '../../src/main/close-guard';

/** The guard only ever reads `state` (see `close-guard.ts#guard`); `kind` is
    carried purely so a test case can say which real task kind it stands in
    for, without the guard needing to care. */
interface FakeTask {
  state: WorkTaskState;
  kind?: WorkTaskKind;
}

/** Stands in for the real registry (`getWorkQueue(services).list()`); a test
    only ever needs to control what `list()` answers. */
const queue = vi.hoisted(() => ({ tasks: [{ state: 'running' }] as FakeTask[] }));

const electron = vi.hoisted(() => {
  const appHandlers = new Map<string, (event: { preventDefault: () => void }) => void>();
  return {
    appHandlers,
    app: {
      quit: vi.fn(),
      on: (event: string, listener: (e: { preventDefault: () => void }) => void) => {
        appHandlers.set(event, listener);
      },
    },
  };
});

vi.mock('electron', () => ({ app: electron.app, BrowserWindow: class {} }));

/* The guard's whole question — "is anything running right now" — now goes
   through the work queue instead of the gardener's own flag (074, D7); this
   mock is the one place a test controls the answer. */
vi.mock('../../src/main/work-queue', () => ({
  getWorkQueue: () => ({ list: () => queue.tasks }),
  hasRunningTask: () => queue.tasks.some((task) => task.state === 'running'),
}));

const { CONFIRM_TIMEOUT_MS, attachCloseGuard, authoriseQuit, cancelClose, confirmClose } =
  await import('../../src/main/close-guard');

/* One container for every harness, like the one `Services` of a real process.
   `before-quit` is registered once and keeps the container it was first given,
   so a container per harness would have a later test's quit asking an earlier
   test's window (058, D3). */
const current = { window: null as BrowserWindow | null, events: [] as string[] };
const services = {
  mainWindow: () => current.window,
  sendEvent: (name: string) => void current.events.push(name),
} as unknown as Services;

/** Fires the app-level `before-quit` the guard registered, counting its vetoes. */
function requestQuit(): { prevented: () => number } {
  const quit = electron.appHandlers.get('before-quit');
  if (!quit) throw new Error('no before-quit handler registered');
  let prevented = 0;
  quit({ preventDefault: () => void (prevented += 1) });
  return { prevented: () => prevented };
}

interface Harness {
  /** The user asks to close the window — Electron's `close` event. */
  requestClose: () => void;
  /** Windows logoff/shutdown — the window's `session-end` event (058, D3). */
  endSession: () => void;
  /** How often the close was vetoed, over all attempts. */
  prevented: () => number;
  /** How often the guard actually carried a close out. */
  closeCalls: () => number;
  events: () => string[];
  /** D6 review fix: the window must be surfaced before the prompt is shown. */
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  /** 058, D3: a close-to-tray close hides instead of closing. */
  hide: ReturnType<typeof vi.fn>;
  /** Lets a test simulate the window being minimized when the close arrives. */
  setMinimized: (value: boolean) => void;
}

/** A main window and a service container reduced to what the guard touches. */
function attachHarness(options?: CloseGuardOptions): Harness {
  const closeListeners: ((event: { preventDefault: () => void }) => void)[] = [];
  const sessionEndListeners: ((event: { preventDefault: () => void }) => void)[] = [];
  const events: string[] = [];
  let prevented = 0;
  let closeCalls = 0;
  let minimized = false;
  const show = vi.fn();
  const focus = vi.fn();
  const restore = vi.fn(() => void (minimized = false));
  const hide = vi.fn();

  const requestClose = (): void => {
    const event = { preventDefault: () => void (prevented += 1) };
    for (const listener of closeListeners) listener(event);
  };

  /* Cast because the guard only ever calls `on`, `isDestroyed`, `close`,
     `isMinimized`, `restore`, `show`, `focus` and `hide` on the window and
     `mainWindow`/`sendEvent` on the container — a real `BrowserWindow` cannot
     exist in this process at all. */
  const window = {
    on: (event: string, listener: (e: { preventDefault: () => void }) => void) => {
      if (event === 'close') closeListeners.push(listener);
      if (event === 'session-end') sessionEndListeners.push(listener);
    },
    isDestroyed: () => false,
    isMinimized: () => minimized,
    restore,
    show,
    focus,
    hide,
    /* Electron runs the `close` listeners again on a retry, so the retry is
       modelled too: a guard that vetoed its own confirmed close would show up
       here as a second preventDefault. */
    close: () => {
      closeCalls += 1;
      requestClose();
    },
  } as unknown as BrowserWindow;

  current.window = window;
  current.events = events;
  /* No options means the two-argument call every case before 058 makes. */
  if (options) attachCloseGuard(services, window, options);
  else attachCloseGuard(services, window);
  return {
    requestClose,
    endSession: () => {
      for (const listener of sessionEndListeners) listener({ preventDefault: () => undefined });
    },
    prevented: () => prevented,
    closeCalls: () => closeCalls,
    events: () => events,
    show,
    focus,
    restore,
    hide,
    setMinimized: (value) => void (minimized = value),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  queue.tasks = [{ state: 'running' }];
  electron.app.quit.mockClear();
});

afterEach(() => {
  /* Drops whatever timer a test left standing along with the fake clock. */
  vi.useRealTimers();
});

describe('close guard', () => {
  it('vetoes once and asks, while a run is going', () => {
    const app = attachHarness();
    app.requestClose();
    expect(app.prevented()).toBe(1);
    expect(app.events()).toEqual(['event:close-requested']);
    expect(app.closeCalls()).toBe(0);
  });

  it('does not veto when no run is going', () => {
    queue.tasks = [];
    const app = attachHarness();
    app.requestClose();
    expect(app.prevented()).toBe(0);
    expect(app.events()).toEqual([]);
  });

  it('vetoes on a running condense task the same way it does on a running gardener task', () => {
    queue.tasks = [{ state: 'running', kind: 'condense' }];
    const app = attachHarness();
    app.requestClose();
    expect(app.prevented()).toBe(1);
    expect(app.events()).toEqual(['event:close-requested']);
  });

  it('vetoes on a running ingest task', () => {
    queue.tasks = [{ state: 'running', kind: 'ingest' }];
    const app = attachHarness();
    app.requestClose();
    expect(app.prevented()).toBe(1);
    expect(app.events()).toEqual(['event:close-requested']);
  });

  it('does not veto on a queued task alone — nothing has been computed for it yet', () => {
    queue.tasks = [{ state: 'queued', kind: 'ingest' }];
    const app = attachHarness();
    app.requestClose();
    expect(app.prevented()).toBe(0);
    expect(app.events()).toEqual([]);
  });

  it('lets the confirmed close through without vetoing it a second time', () => {
    const app = attachHarness();
    app.requestClose();
    confirmClose();
    expect(app.closeCalls()).toBe(1);
    expect(app.prevented()).toBe(1);
  });

  it('closes anyway when the renderer never answers', () => {
    const app = attachHarness();
    app.requestClose();
    vi.advanceTimersByTime(CONFIRM_TIMEOUT_MS);
    expect(app.closeCalls()).toBe(1);
    expect(app.prevented()).toBe(1);
  });

  it('leaves run and window alone on cancel — the timer goes with the veto', () => {
    const app = attachHarness();
    app.requestClose();
    cancelClose();
    vi.advanceTimersByTime(CONFIRM_TIMEOUT_MS * 10);
    expect(app.closeCalls()).toBe(0);
    expect(electron.app.quit).not.toHaveBeenCalled();
  });

  it('judges a close after a cancel from scratch', () => {
    const app = attachHarness();
    app.requestClose();
    cancelClose();
    app.requestClose();
    expect(app.prevented()).toBe(2);
    expect(app.events()).toEqual(['event:close-requested', 'event:close-requested']);
    expect(app.closeCalls()).toBe(0);
  });

  it('authorises nothing when a confirm arrives after the cancel', () => {
    const app = attachHarness();
    app.requestClose();
    cancelClose();
    /* A stale answer: the prompt it belonged to is gone. It must not leave a
       standing permission behind, so the next close is still asked about. */
    confirmClose();
    expect(app.closeCalls()).toBe(0);
    app.requestClose();
    expect(app.prevented()).toBe(2);
  });

  it('restores, shows and focuses a hidden/minimized window before the prompt (D6 review fix)', () => {
    /* A minimized (or otherwise hidden) window showing an invisible confirm
       dialog is, from AC7's point of view, indistinguishable from no confirm
       at all: the dead-man timer still fires and the run still dies mid-write
       — the user just never saw anything to answer. */
    const app = attachHarness();
    app.setMinimized(true);

    app.requestClose();

    expect(app.restore).toHaveBeenCalledTimes(1);
    expect(app.show).toHaveBeenCalledTimes(1);
    expect(app.focus).toHaveBeenCalledTimes(1);
    expect(app.prevented()).toBe(1);
    expect(app.events()).toEqual(['event:close-requested']);
  });

  it('shows and focuses even when the window is not minimized, but does not restore', () => {
    const app = attachHarness();

    app.requestClose();

    expect(app.restore).not.toHaveBeenCalled();
    expect(app.show).toHaveBeenCalledTimes(1);
    expect(app.focus).toHaveBeenCalledTimes(1);
  });

  it('confirms a vetoed quit and actually retries app.quit() (D6 review fix)', () => {
    /* The cancel branch right below already proves the veto never quits; this
       is the missing other half — the happy path all the way to a real
       `app.quit()` call once the renderer answers. */
    attachHarness();
    const quit = electron.appHandlers.get('before-quit');
    if (!quit) throw new Error('no before-quit handler registered');

    let prevented = 0;
    quit({ preventDefault: () => void (prevented += 1) });
    expect(prevented).toBe(1);
    expect(electron.app.quit).not.toHaveBeenCalled();

    confirmClose();

    expect(electron.app.quit).toHaveBeenCalledTimes(1);
  });

  it('cancels a vetoed quit without ever quitting', () => {
    /* `before-quit` is app-level and registered exactly once, so it keeps the
       container from the first attachment — deliberate, and the reason this
       case only asserts things that hold regardless of which window it asks. */
    attachHarness();
    const quit = electron.appHandlers.get('before-quit');
    if (!quit) throw new Error('no before-quit handler registered');

    let prevented = 0;
    quit({ preventDefault: () => void (prevented += 1) });
    expect(prevented).toBe(1);

    cancelClose();
    vi.advanceTimersByTime(CONFIRM_TIMEOUT_MS * 10);
    expect(electron.app.quit).not.toHaveBeenCalled();
  });
});

/* 058, D3: close-to-tray. The policy moves the hide/close decision into the
   guard's own `close` listener, so every case here is about the three parts
   agreeing — the hide branch, the `quitting` flag and the `before-quit` →
   `close` re-entry. Get it wrong one way and × quits; the other way and the
   tray's "quit" cannot quit. The run from `beforeEach` stays going unless a
   case says otherwise: a hide must not ask about it (D-c). */
describe('close guard with close-to-tray', () => {
  const hideToTray = { hideInsteadOfClose: () => true };

  it('a close-to-tray close hides the window and vetoes nothing', () => {
    const app = attachHarness(hideToTray);

    app.requestClose();

    expect(app.hide).toHaveBeenCalledTimes(1);
    /* No prompt, and no veto cycle left waiting for an answer: neither the
       dead-man timer nor a stray confirm can turn this hide into a close. */
    expect(app.events()).toEqual([]);
    vi.advanceTimersByTime(CONFIRM_TIMEOUT_MS * 10);
    confirmClose();
    expect(app.closeCalls()).toBe(0);
    expect(electron.app.quit).not.toHaveBeenCalled();
    /* Hidden, not surfaced: nothing here pulls the window back up. */
    expect(app.show).not.toHaveBeenCalled();
  });

  it('once a quit got through the guard, the window closes instead of hiding', () => {
    queue.tasks = [];
    const app = attachHarness(hideToTray);

    expect(requestQuit().prevented()).toBe(0);
    app.requestClose();

    /* The quit's own window close: not hidden and not vetoed, so the quit
       completes instead of being cancelled by a window that hid itself. */
    expect(app.hide).not.toHaveBeenCalled();
    expect(app.prevented()).toBe(0);
  });

  it('a confirmed quit closes the window instead of hiding it', () => {
    const app = attachHarness(hideToTray);

    expect(requestQuit().prevented()).toBe(1);
    confirmClose();
    expect(electron.app.quit).toHaveBeenCalledTimes(1);
    /* What Electron does next on that retried `app.quit()`: close the window. */
    app.requestClose();

    expect(app.hide).not.toHaveBeenCalled();
    expect(app.prevented()).toBe(0);
  });

  it('a cancelled quit leaves the next close a hide, not a quit', () => {
    const app = attachHarness(hideToTray);

    expect(requestQuit().prevented()).toBe(1);
    cancelClose();
    app.requestClose();

    /* `quitting` was never set by the cancelled attempt — had it been, this ×
       would have gone to the guard (a second prompt) instead of the tray. */
    expect(app.hide).toHaveBeenCalledTimes(1);
    expect(app.events()).toEqual(['event:close-requested']);
    expect(app.closeCalls()).toBe(0);
  });

  it('a tray quit with a run going vetoes once and shows the hidden window', () => {
    const app = attachHarness(hideToTray);
    app.requestClose();
    expect(app.hide).toHaveBeenCalledTimes(1);
    /* Went to the tray minimized: the prompt must still end up in front. */
    app.setMinimized(true);

    const quit = requestQuit();

    expect(quit.prevented()).toBe(1);
    expect(app.restore).toHaveBeenCalledTimes(1);
    expect(app.show).toHaveBeenCalledTimes(1);
    expect(app.focus).toHaveBeenCalledTimes(1);
    expect(app.events()).toEqual(['event:close-requested']);
    expect(electron.app.quit).not.toHaveBeenCalled();
  });

  it('a close while the quit prompt is up keeps the prompt in front instead of hiding it', () => {
    /* Hiding here would hide the prompt with the window, and the dead-man
       timer would then quit behind the user's back. */
    const app = attachHarness(hideToTray);
    expect(requestQuit().prevented()).toBe(1);

    app.requestClose();

    expect(app.hide).not.toHaveBeenCalled();
    expect(app.prevented()).toBe(1);
    expect(app.show).toHaveBeenCalledTimes(2);
    /* Still the one prompt, not a second one. */
    expect(app.events()).toEqual(['event:close-requested']);
  });

  it('a policy that says no leaves every close a close', () => {
    const app = attachHarness({ hideInsteadOfClose: () => false });

    app.requestClose();

    expect(app.hide).not.toHaveBeenCalled();
    expect(app.prevented()).toBe(1);
    expect(app.events()).toEqual(['event:close-requested']);
  });

  it('a Windows session end makes the closes that follow closes, not hides', () => {
    queue.tasks = [];
    const app = attachHarness(hideToTray);

    app.endSession();
    app.requestClose();

    expect(app.hide).not.toHaveBeenCalled();
    expect(app.prevented()).toBe(0);
  });

  it('a new main window drops a quit the app outlived', () => {
    queue.tasks = [];
    attachHarness(hideToTray);
    requestQuit();

    /* macOS: the app survived that quit's window close and `activate` built a
       new window — its × is judged from scratch, i.e. hidden again. */
    const next = attachHarness(hideToTray);
    next.requestClose();

    expect(next.hide).toHaveBeenCalledTimes(1);
  });
});

/* An update install asks its own question (the restart blocker) before it hands
   over to the installer, which then quits the app a tick later. The guard must
   not ask a second time in that tick, yet an authorisation for a hand-over that
   failed must not outlive it. */
describe('close guard around an update install', () => {
  it("an update install's quit is not vetoed by a task that started after the restart check", () => {
    queue.tasks = [];
    const app = attachHarness();
    authoriseQuit();
    queue.tasks = [{ state: 'running', kind: 'ingest' }];

    expect(requestQuit().prevented()).toBe(0);
    /* What the quit does next: close the main window, which must not veto either. */
    app.requestClose();
    expect(app.prevented()).toBe(0);
    expect(app.events()).toEqual([]);
  });

  it('a failed install leaves the next close guarded', () => {
    queue.tasks = [];
    const app = attachHarness();
    const revoke = authoriseQuit();
    revoke();
    queue.tasks = [{ state: 'running' }];

    expect(requestQuit().prevented()).toBe(1);
    cancelClose();
    app.requestClose();
    expect(app.prevented()).toBe(1);
    expect(app.events()).toEqual(['event:close-requested', 'event:close-requested']);
    expect(electron.app.quit).not.toHaveBeenCalled();
  });

  it('a late revoke does not take back a close the user confirmed in the meantime', () => {
    const revoke = authoriseQuit();
    /* A fresh window drops the authorisation; the user then confirms a close of their own. */
    const app = attachHarness();
    app.requestClose();
    confirmClose();
    revoke();

    app.requestClose();
    expect(app.prevented()).toBe(1);
    expect(app.events()).toEqual(['event:close-requested']);
  });
});
