/* D4 of 071: closing the vault, and quitting the app, must not leave work in
 * flight against a vault that is on its way out.
 *
 * `Services.closeVault()` and the `will-quit` handler in `src/main/index.ts`
 * both call `getWorkQueue(...).cancelAll('shutdown')` followed by `.clear()`,
 * right next to the existing `cancelGardenerRun('shutdown')` net for that
 * same moment (mirrors `gardener-run-delay.test.ts`'s coverage of that call).
 *
 * `index.ts` itself can't be imported here: it runs `app.requestSingleInstanceLock()`
 * and registers `app.on(...)` at module load time, which needs a real Electron
 * app. The second test below exercises the exact registry call sequence that
 * handler runs instead — cancelling and clearing is `WorkRegistry` behaviour,
 * not something `will-quit`'s glue code adds on top, so asserting that
 * sequence leaves nothing running/queued covers what the handler relies on.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyStore } from '../../src/main/secrets';
import { getWorkQueue, resetWorkQueue } from '../../src/main/work-queue';
import type { Services } from '../../src/main/services';

/* `Services.closeVault()` calls `sendEvent`, which reaches for
   `BrowserWindow.getAllWindows()` — the same minimal Electron stand-in
   `services.test.ts` uses, just with no window attached since none of these
   tests inspect what got sent. */
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

async function createContainer(userDataDir: string): Promise<Services> {
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const settings = await SettingsService.load(userDataDir);
  /* No secrets are touched by anything here. */
  const keys = {
    encryptionAvailable: false,
    has: () => false,
    get: () => null,
    set: async () => ({ persisted: false, encrypted: false }),
    remove: async () => undefined,
    ids: () => [],
  };
  return createServices(settings, keys as unknown as KeyStore, userDataDir);
}

/* Flushes the microtasks a queued task's start runs on — `pump()` awaits the
   runner, so state moves past "queued" a tick or two after `enqueue` returns. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('work queue lifecycle: closing the vault, quitting the app (071, D4)', () => {
  let userDataDir: string;

  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-'));
  });

  afterEach(async () => {
    resetWorkQueue();
    await rm(userDataDir, { recursive: true, force: true });
  });

  it('closing the vault cancels the running task and clears the queue', async () => {
    const services = await createContainer(userDataDir);
    const queue = getWorkQueue(services);

    /* A runner that never resolves on its own — per D2, cancellation forces
       the task terminal regardless of what the runner's promise later does. */
    queue.enqueue(
      { kind: 'condense', lane: 'free', subject: { label: 'Daily note', ref: null } },
      () => new Promise(() => undefined),
    );
    await flush();
    expect(queue.list().some((task) => task.state === 'running')).toBe(true);

    await services.closeVault();

    const list = getWorkQueue(services).list();
    expect(list.filter((task) => task.state === 'queued' || task.state === 'running')).toEqual([]);
    expect(list).toEqual([]);
  });

  it('the shutdown cancel-and-clear sequence will-quit runs leaves nothing running or queued', async () => {
    const services = await createContainer(userDataDir);
    const queue = getWorkQueue(services);

    queue.enqueue(
      { kind: 'ingest', lane: 'model', subject: { label: 'A video', ref: null } },
      () => new Promise(() => undefined),
    );
    queue.enqueue(
      { kind: 'ingest', lane: 'model', subject: { label: 'Another video', ref: null } },
      () => new Promise(() => undefined),
    );
    await flush();
    expect(queue.list().some((task) => task.state === 'running')).toBe(true);
    expect(queue.list().some((task) => task.state === 'queued')).toBe(true);

    /* The same two calls `index.ts`'s `will-quit` handler makes, right next
       to its `cancelGardenerRun('shutdown')`. */
    getWorkQueue(services).cancelAll('shutdown');
    getWorkQueue(services).clear();

    expect(getWorkQueue(services).list()).toEqual([]);
  });
});
