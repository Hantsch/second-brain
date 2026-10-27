/* The agent's job channels in main, on real files, without network and without a model.
   The agent is played by the test: it writes a page and a result file, exactly as the
   `gaston-jobs` skill tells it to, and the watcher is replaced by a captured callback. */

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { AgentJobView } from '@shared/types';
import { AGENT_DIRS } from '@shared/types';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const MODULE = 'identity-management';
const RAW = 'raw/web/2026-08-06-digital-gardening-ueberblick.md';
const PROTOCOL = 'raw/web/2026-08-06-digital-gardening-ueberblick.ingest.json';
const PAGE = `modules/${MODULE}/wiki/sources/s-2026-10-27-digital-gardening.md`;
const PAGE_TEXT = [
  '---',
  'type: source',
  'title: Digital gardening',
  `module: ${MODULE}`,
  `raw: ${RAW}`,
  '---',
  '',
  'Digital gardens grow notes slowly and in public.',
  '',
].join('\n');

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { agentJobsHandlers } = await import('../../src/main/ipc/agent-jobs');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  const watcher: { onChange: ((paths: string[], external: boolean) => void) | null } = {
    onChange: null,
  };
  services.attachWatcher((_root, onChange) => {
    watcher.onChange = onChange;
    return { dispose: () => undefined };
  });

  const handlers: Handlers = agentJobsHandlers(services);
  const events = vi.spyOn(services, 'sendEvent');
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`no handler for ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };
  return { services, watcher, call, events };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

describe('agent job channels in main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-agent-jobs-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
  });

  const handOver = () => harness.call('agent:handOverSource', { rawPath: RAW, module: MODULE });

  /** The agent answers: the page first, the result file last. */
  async function agentAnswers(id: string): Promise<void> {
    await vault.write(PAGE, PAGE_TEXT);
    await vault.write(
      `${AGENT_DIRS.results}/${id}.md`,
      ['---', 'status: done', `sourcePage: ${PAGE}`, '---', ''].join('\n'),
    );
  }

  /** The job files on disk; the folder does not exist until a job was filed. */
  async function jobFiles(): Promise<string[]> {
    try {
      return (await readdir(join(vault.root, AGENT_DIRS.jobs))).filter((name) =>
        name.endsWith('.md'),
      );
    } catch {
      return [];
    }
  }

  const changed = (id: string) =>
    harness.watcher.onChange?.([`${AGENT_DIRS.results}/${id}.md`], true);

  it('handing a source over twice files one job', async () => {
    const first = await handOver();
    const again = await handOver();

    expect(first.outcome).toBe('filed');
    expect(again).toMatchObject({ outcome: 'exists', job: { id: first.job.id } });
    const files = (await readdir(join(vault.root, AGENT_DIRS.jobs))).filter((name) =>
      name.endsWith('.md'),
    );
    expect(files).toEqual([`${first.job.id}.md`]);
    expect(await harness.call('agent:jobs', undefined)).toEqual([
      expect.objectContaining({ id: first.job.id, state: 'with-agent', module: MODULE }),
    ]);
  });

  it('no job exists for a source nobody handed over', async () => {
    expect(await harness.call('agent:jobs', undefined)).toEqual([]);
    await expect(
      harness.call('agent:handOverSource', { rawPath: 'notes/idea.md', module: null }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      harness.call('agent:handOverSource', { rawPath: 'raw/web/nothing.md', module: null }),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(await harness.call('agent:jobs', undefined)).toEqual([]);
    expect(await jobFiles()).toEqual([]);

    const { settleAgentJobsQueued } = await import('../../src/main/agent-jobs-settle');
    await settleAgentJobsQueued(harness.services);
    expect(await jobFiles()).toEqual([]);
  });

  it('a result written into the results folder is settled on the next change and emitted', async () => {
    const { job } = await handOver();
    await agentAnswers(job.id);
    harness.events.mockClear();

    changed(job.id);

    await vi.waitFor(
      () => {
        const emitted = harness.events.mock.calls
          .filter(([name]) => name === 'event:agent-jobs')
          .map(([, payload]) => payload as AgentJobView[]);
        expect(emitted.at(-1)).toEqual([
          expect.objectContaining({ id: job.id, state: 'done', finishedAt: expect.any(String) }),
        ]);
      },
      { timeout: 5000, interval: 20 },
    );
    const protocol = JSON.parse((await vault.read(PROTOCOL)) ?? '{}') as { sourcePage?: string };
    expect(protocol.sourcePage).toBe('s-2026-10-27-digital-gardening');
    expect(await readdir(join(vault.root, AGENT_DIRS.jobs))).not.toContain(`${job.id}.md`);
  });

  it('a fresh session on the same vault lists the open job as with the agent', async () => {
    const { job } = await handOver();
    await harness.services.closeVault();

    const other = await mkdtemp(join(tmpdir(), 'sb-userdata-agent-jobs-'));
    try {
      const fresh = await createHarness(other);
      await fresh.services.openVault(vault.root);
      expect(await fresh.call('agent:jobs', undefined)).toEqual([
        expect.objectContaining({ id: job.id, state: 'with-agent', subject: RAW }),
      ]);
      await fresh.services.closeVault();
    } finally {
      await rm(other, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it('withdrawing returns the source to waiting and a late result books nothing', async () => {
    const { job } = await handOver();
    const protocolBefore = await vault.read(PROTOCOL);

    const views = await harness.call('agent:withdrawJob', { id: job.id });
    expect(views).toEqual([
      expect.objectContaining({ id: job.id, state: 'withdrawn', reason: 'Withdrawn by the user' }),
    ]);

    await agentAnswers(job.id);
    changed(job.id);
    await vi.waitFor(
      async () => {
        expect(await readdir(join(vault.root, AGENT_DIRS.results))).not.toContain(`${job.id}.md`);
      },
      { timeout: 5000, interval: 20 },
    );

    expect(await vault.read(PROTOCOL)).toBe(protocolBefore);
    expect(await harness.call('agent:jobs', undefined)).toEqual([
      expect.objectContaining({ id: job.id, state: 'withdrawn' }),
    ]);

    const again = await handOver();
    expect(again.outcome).toBe('filed');
    expect(await jobFiles()).toEqual([`${again.job.id}.md`]);
  });
});
