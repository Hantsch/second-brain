/* 034, AC 6: "closing the app stops what the app started."
 *
 * The `will-quit` handler runs a list of best-effort cleanups, and only the
 * last of them ends a real OS process — everything before it merely drops
 * in-process state. That ordering made the one irreversible step the most
 * fragile one: a throw anywhere above it (a gardener run in an odd state, say)
 * skipped it, and a `llama-server` this app spawned — not detached, so nothing
 * else would ever reap it — outlived the app.
 *
 * Nothing here starts an app: `requestSingleInstanceLock()` answers `false`, so
 * importing `src/main/index.ts` registers its handlers and bootstraps nothing.
 */

import { describe, expect, it, vi } from 'vitest';
import type * as LlamaLifecycle from '../../src/main/ipc/runtime/llamacpp-lifecycle';
import type * as GardenerRunState from '../../src/main/gardener-run-state';

const electron = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();
  return {
    handlers,
    app: {
      requestSingleInstanceLock: () => false,
      quit: vi.fn(),
      setAppUserModelId: vi.fn(),
      getPath: () => '',
      getVersion: () => '0.0.0-test',
      whenReady: () => Promise.resolve(),
      on: (event: string, listener: () => void) => {
        handlers.set(event, listener);
      },
    },
  };
});

vi.mock('electron', () => ({
  app: electron.app,
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  globalShortcut: { register: vi.fn(), unregister: vi.fn(), unregisterAll: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { openExternal: vi.fn(), openPath: vi.fn() },
  Notification: class {},
  nativeTheme: { on: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  Tray: class {},
  Menu: { buildFromTemplate: vi.fn() },
  nativeImage: { createFromPath: vi.fn() },
}));

/* Spread the real modules so every *other* importer in the graph still gets
   the exports it expects; only the two functions this test is about change. */
vi.mock('../../src/main/gardener-run-state', async (importOriginal) => ({
  ...(await importOriginal<typeof GardenerRunState>()),
  cancelGardenerRun: vi.fn(() => {
    throw new Error('a cleanup step that fails on the way out');
  }),
}));

vi.mock('../../src/main/ipc/runtime/llamacpp-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof LlamaLifecycle>()),
  stopOwnedLlamaEngineOnQuit: vi.fn(),
}));

await import('../../src/main/index');
const { stopOwnedLlamaEngineOnQuit } =
  await import('../../src/main/ipc/runtime/llamacpp-lifecycle');
const { cancelGardenerRun } = await import('../../src/main/gardener-run-state');

describe('will-quit', () => {
  it('stops the app-owned engine even when an earlier cleanup step throws', () => {
    const quit = electron.handlers.get('will-quit');
    if (!quit) throw new Error('no will-quit handler registered');

    // The failure is not swallowed — Electron still sees it — but it no
    // longer decides whether a spawned engine is signalled.
    expect(() => quit()).toThrow('a cleanup step that fails on the way out');
    expect(cancelGardenerRun).toHaveBeenCalledWith('shutdown');
    expect(stopOwnedLlamaEngineOnQuit).toHaveBeenCalledTimes(1);
  });
});
