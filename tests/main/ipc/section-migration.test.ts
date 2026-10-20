/* The section-migration channels (story 024, D7) against a real, seeded
 * vault: `vault:sectionPlan` has to find the German headings the fixture
 * carries, and `vault:sectionMigrate` has to actually rewrite them and
 * report a conflict honestly when the hash no longer matches.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { createTempVault } from '../../helpers/vault';
import type { TempVault } from '../../helpers/vault';
import { freezeTime } from '../../helpers/time';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../../src/main/secrets');
  const { createServices } = await import('../../../src/main/services');
  const { SettingsService } = await import('../../../src/main/settings');
  const { sectionMigrationHandlers } = await import('../../../src/main/ipc/section-migration');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const handlers: Handlers = { ...sectionMigrationHandlers(services) };
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

describe('section-migration channels in main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    freezeTime();
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-section-migration-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  it('finds the seeded vault’s German headings when planning a move to English', async () => {
    const plan = await harness.call('vault:sectionPlan', { to: 'en' });

    expect(plan.to).toBe('en');
    expect(plan.count).toBe(plan.entries.length);
    expect(plan.count).toBeGreaterThan(0);
    expect(plan.entries.some((entry) => entry.renames.length + entry.folds.length > 0)).toBe(true);
  });

  it('reports no work once every file already speaks the target language', async () => {
    const plan = await harness.call('vault:sectionPlan', { to: 'de' });
    expect(plan.count).toBe(0);
    expect(plan.entries).toEqual([]);
  });

  it('migrates a planned rename and rewrites the heading in the real file', async () => {
    const plan = await harness.call('vault:sectionPlan', { to: 'en' });
    const entry = plan.entries.find((candidate) => candidate.renames.length > 0);
    expect(entry).toBeDefined();
    if (entry === undefined) throw new Error('no rename entry in the plan');

    const result = await harness.call('vault:sectionMigrate', {
      to: 'en',
      entries: [entry],
    });

    expect(result.migrated).toBe(1);
    expect(result.conflicts).toBe(0);
    expect(result.results[0]?.outcome).toBe('migrated');

    const rewritten = await vault.read(entry.path);
    expect(rewritten).not.toBeNull();
    const rename = entry.renames[0];
    if (rename !== undefined) expect(rewritten).toContain(`## ${rename.to}`);
  });

  it('reports a conflict instead of overwriting a file that changed since the plan', async () => {
    const plan = await harness.call('vault:sectionPlan', { to: 'en' });
    const entry = plan.entries.find((candidate) => candidate.renames.length > 0);
    expect(entry).toBeDefined();
    if (entry === undefined) throw new Error('no rename entry in the plan');

    /* An edit the plan doesn't know about — the same "someone else touched it
       meanwhile" scenario the engine's own conflict rule exists for. */
    const before = await vault.read(entry.path);
    expect(before).not.toBeNull();
    await vault.write(entry.path, `${before ?? ''}\n\nEin Satz, den der Plan nicht kennt.\n`);

    const result = await harness.call('vault:sectionMigrate', { to: 'en', entries: [entry] });

    expect(result.migrated).toBe(0);
    expect(result.conflicts).toBe(1);
    expect(result.results[0]?.outcome).toBe('conflict');
  });
});
