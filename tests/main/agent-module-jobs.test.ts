/* Handing a module or a maintenance run to the agent, in main, on real files without a model.
   The agent is played by the test: it writes a result file exactly as the job tells it to. */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findingId } from '@core/gardener';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { HELP_MODULE_SLUG } from '@shared/help-module';
import { AGENT_DIRS, type AgentJobView, type GardenerFinding } from '@shared/types';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { stamp } from '../helpers/time';

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
const FIRST = `modules/${MODULE}/wiki/entities/oauth2.md`;
const SECOND = `modules/${MODULE}/wiki/entities/scim.md`;
const CANDIDATE: GardenerFinding = {
  id: findingId('near-duplicate', 'oauth2+scim'),
  kind: 'near-duplicate',
  severity: 'warn',
  title: 'near-duplicate oauth2+scim',
  detail: '',
  paths: [FIRST, SECOND],
  module: MODULE,
  foundAt: stamp(),
  fix: null,
};

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { agentJobsHandlers } = await import('../../src/main/ipc/agent-jobs');
  const { gardenerHandlers } = await import('../../src/main/ipc/gardener');
  const { gardenerStateFor } = await import('../../src/main/ipc/gardener-deps');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));
  services.attachWatcher(() => ({ dispose: () => undefined }));

  const handlers: Handlers = { ...agentJobsHandlers(services), ...gardenerHandlers(services) };
  const events = vi.spyOn(services, 'sendEvent');
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`no handler for ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };
  return { services, call, events, gardenerStateFor };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

describe('handing a module or a maintenance run to the agent', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-module-jobs-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
  });

  async function storeRun(ranAt = stamp(-1)): Promise<void> {
    const state = await harness.gardenerStateFor(harness.services);
    await state.save({
      ranAt,
      usedLlm: false,
      findings: [CANDIDATE],
      advice: [],
      size: 10,
    });
  }

  const gardenerFile = () => vault.read('.secondbrain/gardener.json');

  async function agentAnswers(id: string, lines: string[]): Promise<void> {
    await vault.write(
      `${AGENT_DIRS.results}/${id}.md`,
      ['---', 'status: done', ...lines, '---', ''].join('\n'),
    );
  }

  async function settle(): Promise<void> {
    const { settleAgentJobsQueued } = await import('../../src/main/agent-jobs-settle');
    await settleAgentJobsQueued(harness.services);
  }

  const jobs = () => harness.call('agent:jobs', undefined);

  it('refuses the help module and anything that is not a module slug', async () => {
    await expect(
      harness.call('agent:handOverModule', { module: HELP_MODULE_SLUG }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      harness.call('agent:handOverModule', { module: '../identity-management' }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      harness.call('agent:handOverModule', { module: 'no-such-module' }),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(await jobs()).toEqual([]);
  });

  it('a module handed over twice files one job that shows what its run did once reported', async () => {
    const first = await harness.call('agent:handOverModule', { module: MODULE });
    const again = await harness.call('agent:handOverModule', { module: MODULE });
    expect(first.outcome).toBe('filed');
    expect(again).toMatchObject({ outcome: 'exists', job: { id: first.job.id } });

    await agentAnswers(first.job.id, []);
    await settle();
    expect(await jobs()).toEqual([
      expect.objectContaining({ id: first.job.id, state: 'done', curate: { reportPending: true } }),
    ]);

    const report = [
      '---',
      'gaston: run-report',
      'version: 1',
      'skill: gaston-curate',
      'started: 2026-08-10T08:00:00Z',
      'finished: 2026-08-10T08:10:00Z',
      'pages:',
      `  - ${FIRST}`,
      'jobsDone:',
      `  - ${first.job.id}`,
      '---',
      '',
    ].join('\n');
    await vault.write(`${AGENT_DIRS.runs}/2026-08-10T080000Z.md`, report);
    const view = (await jobs())[0] as AgentJobView;
    expect(view.curate).toEqual({ pagesChanged: 1, proposalsWritten: 0 });
  });

  it('refuses to hand over a maintenance run that does not exist or has no audit to ask for', async () => {
    await expect(harness.call('agent:handOverGardenerRun', undefined)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(await jobs()).toEqual([]);
  });

  it('offers the stored run to the agent until a job is open', async () => {
    await storeRun();
    expect((await harness.call('gardener:report', undefined))?.agentAudit).toEqual({
      offered: true,
      open: false,
    });

    const first = await harness.call('agent:handOverGardenerRun', undefined);
    const again = await harness.call('agent:handOverGardenerRun', undefined);

    expect(first.outcome).toBe('filed');
    expect(again).toMatchObject({ outcome: 'exists', job: { id: first.job.id } });
    expect((await harness.call('gardener:report', undefined))?.agentAudit).toEqual({
      offered: true,
      open: true,
    });
  });

  it('a job left for an older run neither counts as open nor blocks handing over the current run', async () => {
    await storeRun(stamp(-2));
    const old = await harness.call('agent:handOverGardenerRun', undefined);
    await storeRun(stamp(-1));

    expect((await harness.call('gardener:report', undefined))?.agentAudit).toEqual({
      offered: true,
      open: false,
    });
    const current = await harness.call('agent:handOverGardenerRun', undefined);

    expect(current.outcome).toBe('filed');
    expect(current.job.id).not.toBe(old.job.id);
    expect((await harness.call('gardener:report', undefined))?.agentAudit).toEqual({
      offered: true,
      open: true,
    });
    const again = await harness.call('agent:handOverGardenerRun', undefined);
    expect(again).toMatchObject({ outcome: 'exists', job: { id: current.job.id } });
  });

  it('an invalid audit result leaves gardener.json byte-identical and fails the job', async () => {
    await storeRun();
    const { job } = await harness.call('agent:handOverGardenerRun', undefined);
    const before = await gardenerFile();

    await agentAnswers(job.id, [
      'confirmed:',
      `  - ${CANDIDATE.id}`,
      '  - not-a-finding-of-this-job',
    ]);
    await settle();

    expect(await gardenerFile()).toBe(before);
    expect(await jobs()).toEqual([
      expect.objectContaining({
        id: job.id,
        state: 'failed',
        reason: expect.stringContaining('not-a-finding-of-this-job'),
      }),
    ]);
  });

  it('a valid audit result is booked once even when the result file is seen twice', async () => {
    await storeRun();
    const state = await harness.gardenerStateFor(harness.services);
    const book = vi.spyOn(state, 'bookAgentAudit');
    const { job } = await harness.call('agent:handOverGardenerRun', undefined);

    await agentAnswers(job.id, [
      'rejected:',
      `  - ${CANDIDATE.id}`,
      'advice:',
      '  - Keep both pages.',
    ]);
    harness.events.mockClear();
    const { settleAgentJobsQueued } = await import('../../src/main/agent-jobs-settle');
    await Promise.all([
      settleAgentJobsQueued(harness.services),
      settleAgentJobsQueued(harness.services),
    ]);
    await settle();

    expect(book).toHaveBeenCalledTimes(1);
    expect(state.run()?.audit).toMatchObject({ by: 'agent' });
    expect(await jobs()).toEqual([expect.objectContaining({ id: job.id, state: 'done' })]);
    expect(harness.events).toHaveBeenCalledWith('event:vault-changed', {
      paths: ['.secondbrain/gardener.json'],
      external: false,
    });
    await expect(harness.call('agent:handOverGardenerRun', undefined)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect((await harness.call('gardener:report', undefined))?.agentAudit).toEqual({
      offered: false,
      open: false,
    });
  });
});
