/* 058, D4: `shouldStartHidden` is the pure decision behind "start minimized" —
 * whether the window's `ready-to-show` handler shows the window or leaves it
 * hidden. Kept pure (no `BrowserWindow`) so the no-tray fallback (D-f) can be
 * proven without faking Electron at all: a window hidden with no tray to bring
 * it back would be exactly the soft-lock finding 3.5 describes.
 *
 * The `createMainWindow` cases at the bottom go one layer further, through a
 * fake `BrowserWindow`, for the one thing the pure decision cannot prove: that
 * nothing else in the `ready-to-show` handler shows the window behind its back.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Services } from '../../src/main/services';

/* A `BrowserWindow` reduced to what `createMainWindow` touches. `maximize()`
   makes the window visible, as the real one does when it isn't shown yet —
   that side effect is what the hidden-start case below guards against. */
const electron = vi.hoisted(() => {
  const instances: FakeWindow[] = [];
  class FakeWindow {
    visible = false;
    /** Tracks the real `isMaximized()` state — separate from `visible`, so a
        test can tell "shown" and "maximized" apart, the same way a real
        `BrowserWindow` does. */
    maximizedState = false;
    private readonly onceListeners = new Map<string, () => void>();
    private readonly onListeners = new Map<string, (() => void)[]>();
    /* Real `maximize()` also shows the window as a side effect — the fake
       mirrors that (and fires the `show` once-listener, like the real event
       would) so a test can catch code relying on the wrong one. */
    maximize = vi.fn(() => {
      this.visible = true;
      this.maximizedState = true;
      this.onceListeners.get('show')?.();
    });
    show = vi.fn(() => {
      this.visible = true;
      this.onceListeners.get('show')?.();
    });
    once = vi.fn((event: string, listener: () => void) => {
      this.onceListeners.set(event, listener);
    });
    on = vi.fn((event: string, listener: () => void) => {
      const listeners = this.onListeners.get(event) ?? [];
      listeners.push(listener);
      this.onListeners.set(event, listeners);
    });
    setIcon = vi.fn();
    setAppDetails = vi.fn();
    loadFile = vi.fn(() => Promise.resolve());
    loadURL = vi.fn(() => Promise.resolve());
    isDestroyed = () => false;
    isVisible = () => this.visible;
    isMaximized = () => this.maximizedState;
    getNormalBounds = () => ({ x: 0, y: 0, width: 1200, height: 800 });
    webContents = { on: vi.fn(), setWindowOpenHandler: vi.fn(), getURL: () => '' };
    constructor() {
      instances.push(this);
    }
    fire(event: string): void {
      this.onceListeners.get(event)?.();
    }
    fireOn(event: string): void {
      for (const listener of this.onListeners.get(event) ?? []) listener();
    }
  }
  return { instances, FakeWindow };
});

/* `window.ts` imports Electron (`BrowserWindow`, `screen`) and, transitively,
   `shell` (navigation.ts) and `app` (renderer-entry.ts). `isPackaged: false`
   keeps `appIconPath` on its dev branch — the packaged one reads
   `process.resourcesPath`, which a plain Node test process does not have. */
vi.mock('electron', () => ({
  BrowserWindow: electron.FakeWindow,
  screen: { getAllDisplays: () => [] },
  shell: { openExternal: vi.fn() },
  app: { isPackaged: false },
}));

const { shouldStartHidden, createMainWindow } = await import('../../src/main/window');

describe('shouldStartHidden', () => {
  it('without a tray the window is never started hidden', () => {
    expect(shouldStartHidden(true, false)).toBe(false);
  });

  it('with a tray, starting minimized starts hidden', () => {
    expect(shouldStartHidden(true, true)).toBe(true);
  });

  it('without startMinimized the window shows even with a tray', () => {
    expect(shouldStartHidden(false, true)).toBe(false);
  });

  it('without startMinimized and without a tray the window shows', () => {
    expect(shouldStartHidden(false, false)).toBe(false);
  });
});

function fakeServices(startMinimized: boolean): Services {
  return {
    settings: {
      app: () => ({
        window: { width: 1200, height: 800, maximized: true },
        customization: { appIcon: 'knowledge-garden' },
        startMinimized,
      }),
      onChange: () => () => undefined,
      saveWindow: vi.fn(),
    },
  } as unknown as Services;
}

function readyWindow(startMinimized: boolean, canStartHidden: boolean) {
  createMainWindow(fakeServices(startMinimized), { canStartHidden });
  const window = electron.instances.at(-1);
  if (!window) throw new Error('createMainWindow built no BrowserWindow');
  window.fire('ready-to-show');
  return window;
}

function readyWindowWithServices(startMinimized: boolean, canStartHidden: boolean) {
  const services = fakeServices(startMinimized);
  createMainWindow(services, { canStartHidden });
  const window = electron.instances.at(-1);
  if (!window) throw new Error('createMainWindow built no BrowserWindow');
  window.fire('ready-to-show');
  return { window, services };
}

describe('createMainWindow: ready-to-show', () => {
  it('a hidden start stays hidden even when the saved bounds say maximized', () => {
    const window = readyWindow(true, true);
    expect(window.maximize).not.toHaveBeenCalled();
    expect(window.show).not.toHaveBeenCalled();
    expect(window.isVisible()).toBe(false);
  });

  it('a normal start maximizes and shows the window', () => {
    const window = readyWindow(false, true);
    expect(window.maximize).toHaveBeenCalledTimes(1);
    expect(window.show).toHaveBeenCalledTimes(1);
  });
});

describe('createMainWindow: bounds persistence across a hidden start (review-fix)', () => {
  /* A hidden start deliberately skips `maximize()` (see above), so
     `isMaximized()` reads `false` even though the user's actual preference
     never changed. Without the fix, closing (or hiding to the tray) a window
     that never got shown would persist that false `false` and silently drop
     the saved "maximized" setting for good — every later start, hidden or
     not, would then come up un-maximized. */
  it('closing a hidden window that was never shown keeps the saved maximized flag', () => {
    const { window, services } = readyWindowWithServices(true, true);
    expect(window.isVisible()).toBe(false);

    window.fireOn('close');

    expect(services.settings.saveWindow).toHaveBeenCalledWith(
      expect.objectContaining({ maximized: true }),
    );
  });

  it('once the window is actually shown, persistence reflects the real maximized state again', () => {
    const { window, services } = readyWindowWithServices(true, true);
    expect(window.isVisible()).toBe(false);

    /* The tray (or any other `showMainWindow` door) brings it back — a real
       `.show()` call, not the `ready-to-show` handler's own. */
    window.show();
    expect(window.isMaximized()).toBe(false);

    window.fireOn('close');

    /* Now that the window has genuinely been shown, its real (unmaximized)
       state is trusted again instead of the stale saved value. */
    expect(services.settings.saveWindow).toHaveBeenCalledWith(
      expect.objectContaining({ maximized: false }),
    );
  });
});
