/* 058, D-f: a tray that cannot be built must cost the app its tray, not its
 * window. `new Tray(icon)` throws when the icon can't be loaded; before the
 * guard in `start()`, that rejected `start()` before any window existed and
 * left a process holding the single-instance lock with nothing to show.
 *
 * Unlike `will-quit.test.ts`, this file lets `start()` run: the lock is granted
 * and `whenReady()` hands back the promise `start()` returns, so the test can
 * await it. Everything `start()` reaches beyond the tray is stubbed — the real
 * bootstrap graph is not what is under test here — while `tray.ts` itself stays
 * real, so the throw comes from the same `Tray` constructor it would in the app.
 */

import { describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => {
  const started: { promise: Promise<void> | null } = { promise: null };
  const handlers = new Map<string, () => void>();
  return {
    started,
    handlers,
    app: {
      requestSingleInstanceLock: () => true,
      quit: vi.fn(),
      setAppUserModelId: vi.fn(),
      getPath: () => '',
      isPackaged: false,
      on: (event: string, listener: () => void) => {
        handlers.set(event, listener);
      },
      whenReady: () => ({
        then: (start: () => Promise<void>) => {
          started.promise = start();
          return started.promise;
        },
      }),
    },
  };
});

vi.mock('electron', () => ({
  app: electron.app,
  Tray: class {
    constructor() {
      throw new Error('icon could not be loaded');
    }
  },
  Menu: { buildFromTemplate: vi.fn() },
}));

const window = { on: vi.fn() };
/* One shared object: the startup check and the quit-time stop must hit the same
   service, or the assertions would pass against two unrelated fakes. */
const updateService = { scheduleStartupCheck: vi.fn(), stop: vi.fn() };
const services = {
  settings: {
    app: () => ({
      closeToTray: true,
      lastVault: null,
      /* `createAppTray` reads this before constructing `Tray` — without it,
         the throw would come from an undefined `.appIcon` lookup here, not
         from the real `Tray` constructor this test means to exercise. */
      customization: { appIcon: 'knowledge-garden' },
    }),
  },
  setMainWindow: vi.fn(),
  mainWindow: () => window,
  updates: () => updateService,
  index: () => null,
};

vi.mock('../../src/main/settings', () => ({ SettingsService: { load: async () => ({}) } }));
vi.mock('../../src/main/secrets', () => ({ createKeyStore: async () => ({}) }));
vi.mock('../../src/main/services', () => ({ createServices: () => services }));
vi.mock('../../src/main/core-bridge', () => ({ attachCore: vi.fn() }));
vi.mock('../../src/main/ipc/register-all', () => ({ registerAllHandlers: vi.fn() }));
vi.mock('../../src/main/ipc/runtime/llamacpp-lifecycle', () => ({
  stopOwnedLlamaEngineOnQuit: vi.fn(),
}));
vi.mock('../../src/main/window', () => ({ createMainWindow: vi.fn(() => window) }));
vi.mock('../../src/main/close-guard', () => ({ attachCloseGuard: vi.fn() }));
vi.mock('../../src/main/hotkey', () => ({
  syncQuickCaptureHotkey: vi.fn(),
  watchQuickCaptureHotkey: vi.fn(),
  unregisterHotkeys: vi.fn(),
  triggerQuickCapture: vi.fn(),
}));
vi.mock('../../src/main/quick-capture', () => ({ destroyQuickCapture: vi.fn() }));
vi.mock('../../src/main/shortcut-icon', () => ({ watchShortcutIcon: vi.fn() }));
vi.mock('../../src/main/show-main-window', () => ({ showMainWindow: vi.fn() }));
vi.mock('../../src/main/gardener-autorun', () => ({
  startGardenerAutorun: vi.fn(() => ({ stop: vi.fn() })),
}));
vi.mock('../../src/main/reminder-notify', () => ({
  startReminderNotifier: vi.fn(() => ({ stop: vi.fn() })),
}));
vi.mock('../../src/main/ipc/tasks-e2e-fixture', () => ({ runTasksFixture: vi.fn() }));
vi.mock('../../src/main/vault-layout', () => ({ isVault: async () => false }));
vi.mock('../../src/main/work-queue', () => ({
  getWorkQueue: vi.fn(() => ({ cancelAll: vi.fn(), clear: vi.fn() })),
}));

describe('start() without a tray', () => {
  it('a throwing Tray constructor still opens a window that never starts hidden', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await import('../../src/main/index');
    const { createMainWindow } = await import('../../src/main/window');
    const { startReminderNotifier } = await import('../../src/main/reminder-notify');

    if (!electron.started.promise) throw new Error('start() was never invoked');
    await expect(electron.started.promise).resolves.toBeUndefined();

    /* No tray means no way back from a hidden start (D-f). */
    expect(createMainWindow).toHaveBeenCalledWith(services, { canStartHidden: false });
    expect(services.setMainWindow).toHaveBeenCalledWith(window);
    /* And the rest of startup ran past the failed tray. */
    expect(startReminderNotifier).toHaveBeenCalledWith(services);
    expect(warn).toHaveBeenCalledWith('[start] tray could not be created:', expect.any(Error));
    warn.mockRestore();
  });

  it('start schedules the one startup update check and will-quit stops it', async () => {
    await import('../../src/main/index');
    if (!electron.started.promise) throw new Error('start() was never invoked');
    await electron.started.promise;

    expect(updateService.scheduleStartupCheck).toHaveBeenCalledTimes(1);
    expect(updateService.stop).not.toHaveBeenCalled();

    const quit = electron.handlers.get('will-quit');
    if (!quit) throw new Error('no will-quit handler registered');
    quit();
    expect(updateService.stop).toHaveBeenCalledTimes(1);
  });
});
