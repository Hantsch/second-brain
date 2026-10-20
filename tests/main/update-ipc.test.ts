/* The update channels: the service state goes out over `update:state` and
   every change is pushed as `event:update`. */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sent: Array<{ channel: string; payload: unknown }> = [];

vi.mock('electron', () => ({
  app: { getVersion: () => '1.2.3', isPackaged: false },
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
        },
      },
    ],
  },
  safeStorage: { isEncryptionAvailable: () => false },
}));

async function createHarness(userDataDir: string) {
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { updateHandlers } = await import('../../src/main/ipc/update');
  const settings = await SettingsService.load(userDataDir);
  const keys = {} as unknown as Parameters<typeof createServices>[1];
  const services = createServices(settings, keys, userDataDir);
  return { services, handlers: updateHandlers(services) };
}

describe('update channels in main', () => {
  let userDataDir: string;

  beforeEach(async () => {
    sent.length = 0;
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-update-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(userDataDir, { recursive: true, force: true });
  });

  it('update:state returns the service state and every change is sent as event:update', async () => {
    vi.stubEnv('SB_E2E_UPDATE_FIXTURE', 'available');
    const { handlers } = await createHarness(userDataDir);

    const before = await handlers['update:state']!(undefined as never);
    expect(before).toMatchObject({ status: 'idle', currentVersion: '1.2.3', update: null });

    const checked = await handlers['update:check']!(undefined as never);
    expect(checked).toMatchObject({ status: 'available', update: { version: '99.0.0' } });
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((entry) => entry.channel === 'event:update')).toBe(true);
    expect(sent.at(-1)?.payload).toEqual(checked);
    expect(await handlers['update:state']!(undefined as never)).toEqual(checked);
  });

  it('the state names the distribution', async () => {
    vi.stubEnv('PORTABLE_EXECUTABLE_DIR', 'D:/usb');
    const portable = await createHarness(userDataDir);
    expect(await portable.handlers['update:state']!(undefined as never)).toMatchObject({
      distribution: 'portable',
    });

    vi.stubEnv('PORTABLE_EXECUTABLE_DIR', '');
    const installed = await createHarness(userDataDir);
    expect(await installed.handlers['update:state']!(undefined as never)).toMatchObject({
      distribution: 'installed',
    });
  });
});
