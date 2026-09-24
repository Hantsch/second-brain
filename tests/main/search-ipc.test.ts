/* Die Such-Kanäle im Main: `search:query` bleibt unangetastet nebenan, im
 * Zentrum steht `search:resolveLinks` (059, D2) — die einzige Stelle, an der
 * ein Link-Ziel gegen den echten, indizierten Vault aufgelöst wird.
 *
 * Der Prüfstein: ohne Index kommt für jedes Ziel `null` zurück, nie ein Wurf —
 * dieselbe Absicherung, die `search:query` schon für ein leeres Ergebnis
 * nimmt. Die eigentliche Auflösung selbst ist bereits an `resolveLink()` in
 * `tests/core/index/resolve-link.test.ts` durchgespielt; hier zählt nur, dass
 * der Kanal wirklich bis dorthin durchreicht, mit echten, indizierten Dateien.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { freezeTime } from '../helpers/time';

/* Kein Electron im Test: keine Fenster, keine Verschlüsselung. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

const WORK = 'projects/work/kundenportal-relaunch/project.md';
const AREA = 'areas/gesundheit.md';

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { searchHandlers } = await import('../../src/main/ipc/search');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const handlers: Handlers = { ...searchHandlers(services) };
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, call };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

describe('Such-Kanäle im Main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    freezeTime();
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-search-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  it('löst ein Ziel gegen den echten, indizierten Vault auf', async () => {
    const resolved = await harness.call('search:resolveLinks', {
      from: AREA,
      targets: ['kundenportal-relaunch', 'does-not-exist-anywhere'],
    });

    expect(resolved['kundenportal-relaunch']).toBe(WORK);
    expect(resolved['does-not-exist-anywhere']).toBeNull();
  });

  it('löst jedes angefragte Ziel genau einmal auf, auch bei Wiederholung', async () => {
    const resolved = await harness.call('search:resolveLinks', {
      from: AREA,
      targets: ['kundenportal-relaunch', 'kundenportal-relaunch'],
    });

    expect(Object.keys(resolved)).toEqual(['kundenportal-relaunch']);
    expect(resolved['kundenportal-relaunch']).toBe(WORK);
  });

  it('liefert für jedes Ziel null, wenn kein Index besteht — nie einen Wurf', async () => {
    await harness.services.closeVault();

    const resolved = await harness.call('search:resolveLinks', {
      from: AREA,
      targets: ['kundenportal-relaunch', 'gesundheit'],
    });

    expect(resolved).toEqual({ 'kundenportal-relaunch': null, gesundheit: null });
  });
});
