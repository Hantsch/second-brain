/* A module's condensation handed to the agent, in main, on real files and without a model.
   The agent is played by the test: it writes a result file exactly as the job tells it to.
   What matters is that its answer ends up where an in-app run's proposal does, that the
   human still decides, and that nothing reaches the vault before that. */

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { AGENT_DIRS, type CondenseProposal } from '@shared/types';
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

const SLUG = 'rollenmodell';
const OVERVIEW = `modules/${SLUG}/wiki/overview.md`;
const RBAC = `modules/${SLUG}/wiki/concepts/rbac.md`;
const GUIDE = `modules/${SLUG}/wiki/sources/s-2026-07-02-auth0-guide.md`;

const STUB = [
  '---',
  'type: overview',
  'title: Rollenmodell — Synthese',
  `module: ${SLUG}`,
  '---',
  '',
  '## Seiten',
  '',
].join('\n');

function wikiPage(type: string, title: string, body: string): string {
  return `---\ntype: ${type}\ntitle: ${title}\nmodule: ${SLUG}\n---\n\n${body}\n`;
}

const MODULE_FILES: Record<string, string> = {
  [`modules/${SLUG}/module.md`]: `---\ntype: note\ntitle: Rollenmodell\nslug: ${SLUG}\ndescription: Rollen pro Tenant\n---\n\nRollen.\n`,
  [`modules/${SLUG}/wiki/index.md`]: '# Katalog — Rollenmodell\n',
  [`modules/${SLUG}/wiki/log.md`]: '# Chronik\n',
  [OVERVIEW]: STUB,
  [RBAC]: wikiPage('concept', 'RBAC', 'Rollen werden pro Tenant vergeben.'),
  [GUIDE]: wikiPage(
    'source',
    'Auth0-Guide',
    'Der Guide nennt eine Token-Laufzeit von einer Stunde.',
  ),
};

const EDITED = `${STUB}\nVon Hand ergänzt.\n`;

function answerBody(): string {
  const reply = {
    decided: { text: 'Rollen pro Tenant.', sources: [RBAC] },
    open: { text: 'Token-Laufzeit offen.', sources: [GUIDE] },
    contradictions: { text: '', sources: [] },
  };
  return `Done.\n\n\`\`\`json\n${JSON.stringify(reply, null, 2)}\n\`\`\`\n`;
}

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { agentJobsHandlers } = await import('../../src/main/ipc/agent-jobs');
  const { condenseHandlers } = await import('../../src/main/ipc/condense');
  const { tasksHandlers } = await import('../../src/main/ipc/tasks');
  const { getWorkQueue, resetWorkQueue } = await import('../../src/main/work-queue');
  const { resetTaskResults } = await import('../../src/main/task-results');

  // Process-wide singletons: one test's queue must not leak into the next.
  resetWorkQueue();
  resetTaskResults();

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));
  services.attachWatcher(() => ({ dispose: () => undefined }));

  const handlers: Handlers = {
    ...agentJobsHandlers(services),
    ...condenseHandlers(services),
    ...tasksHandlers(services),
  };
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`no handler for ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };
  return { services, call, queue: getWorkQueue(services) };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

describe("handing a module's condensation to the agent", () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    vault = await createTempVault({ files: MODULE_FILES });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-condense-agent-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
  });

  const handOver = (slug = SLUG) =>
    harness.call('agent:handOverCondense', { kind: 'condense-module', slug });
  const jobFiles = async () =>
    (await readdir(vault.absolute(AGENT_DIRS.jobs)).catch(() => [] as string[])).filter((name) =>
      name.endsWith('.md'),
    );
  const condenseTasks = () => harness.queue.list().filter((task) => task.kind === 'condense');
  const jobs = () => harness.call('agent:jobs', undefined);

  async function agentAnswers(id: string): Promise<void> {
    await vault.write(
      `${AGENT_DIRS.results}/${id}.md`,
      `---\nstatus: done\n---\n\n${answerBody()}`,
    );
    const { settleAgentJobsQueued } = await import('../../src/main/agent-jobs-settle');
    await settleAgentJobsQueued(harness.services);
  }

  /** Hands over, lets the agent answer validly and returns the proposal that waits. */
  async function proposalFromAgent(): Promise<CondenseProposal> {
    const { job } = await handOver();
    await agentAnswers(job.id);
    const task = condenseTasks()[0];
    const result = task === undefined ? null : await harness.call('tasks:result', { id: task.id });
    if (result === null || result.kind !== 'condense') throw new Error('no condense proposal');
    return result.proposal;
  }

  it("handing a module's condensation over writes exactly one job and a second click writes none", async () => {
    const first = await handOver();
    const again = await handOver();

    expect(first.outcome).toBe('filed');
    expect(again).toMatchObject({ outcome: 'exists', job: { id: first.job.id } });
    expect(await jobFiles()).toHaveLength(1);
    expect(condenseTasks()).toMatchObject([
      { state: 'running', subject: { ref: `module:${SLUG}`, label: 'Rollenmodell' } },
    ]);
    const jobText = (await vault.read(`${AGENT_DIRS.jobs}/${first.job.id}.md`)) ?? '';
    expect(jobText).toContain(RBAC);
    expect(jobText).not.toContain('Rollen werden pro Tenant vergeben.');
    expect(await vault.read(OVERVIEW)).toBe(STUB);
  });

  it('refuses a module that does not exist and writes nothing', async () => {
    await expect(handOver('no-such-module')).rejects.toMatchObject({ code: 'invalid' });

    expect(await jobFiles()).toEqual([]);
    expect(condenseTasks()).toEqual([]);
  });

  it("an in-app condensation is refused while the module's condensation is with the agent", async () => {
    await handOver();

    await expect(
      harness.call('condense:run', { unit: 'module', slug: SLUG }),
    ).rejects.toMatchObject({
      code: 'invalid',
      message: "This module's condensation is with the agent.",
    });

    expect(condenseTasks()).toHaveLength(1);
  });

  it("a valid agent result waits as the module's condense proposal and nothing is written", async () => {
    const before = await Promise.all(Object.keys(MODULE_FILES).map((path) => vault.read(path)));

    const proposal = await proposalFromAgent();

    expect(proposal).toMatchObject({ unit: 'module', slug: SLUG, path: OVERVIEW });
    expect(proposal.sources).toEqual([GUIDE, RBAC].sort());
    expect(proposal.after).toContain('Rollen pro Tenant.');
    expect(condenseTasks()).toMatchObject([{ state: 'done', hasResult: true }]);
    expect(await jobs()).toMatchObject([{ kind: 'condense-module', state: 'done' }]);
    const after = await Promise.all(Object.keys(MODULE_FILES).map((path) => vault.read(path)));
    expect(after).toEqual(before);
  });

  it('an agent result for an overview changed since the hand-over fails the job with that reason', async () => {
    const { job } = await handOver();
    await vault.write(OVERVIEW, EDITED);

    await agentAnswers(job.id);

    expect(await jobs()).toMatchObject([
      { state: 'failed', reason: 'overview.md changed since it was handed to the agent.' },
    ]);
    expect(condenseTasks()).toMatchObject([{ state: 'failed' }]);
    expect(await vault.read(OVERVIEW)).toBe(EDITED);
  });

  it('accepting an agent proposal after overview.md changed is a conflict and leaves it byte-identical', async () => {
    const proposal = await proposalFromAgent();
    await vault.write(OVERVIEW, EDITED);

    await expect(harness.call('condense:accept', { proposal })).rejects.toMatchObject({
      code: 'conflict',
    });

    expect(await vault.read(OVERVIEW)).toBe(EDITED);
  });

  it('rejecting an agent proposal appends the reason to the directives section and changes nothing else', async () => {
    const proposal = await proposalFromAgent();
    const proposalTask = condenseTasks()[0];
    if (proposalTask === undefined) throw new Error('no condense task');
    const others = Object.keys(MODULE_FILES).filter((path) => path !== OVERVIEW);
    const before = await Promise.all(others.map((path) => vault.read(path)));

    await harness.call('condense:reject', {
      unit: 'module',
      slug: SLUG,
      reason: 'Die Widersprüche fehlen.',
    });

    const raw = (await vault.read(OVERVIEW)) ?? '';
    const [head, directives = ''] = raw.split('## Direktiven');
    expect(head).toBe(`${STUB.replace(/\s+$/, '')}\n\n`);
    expect(directives.trim()).toBe('Die Widersprüche fehlen.');
    expect(directives).not.toContain(proposal.after);
    expect(await harness.call('tasks:result', { id: proposalTask.id })).toBeNull();
    const after = await Promise.all(others.map((path) => vault.read(path)));
    expect(after).toEqual(before);
  });

  it("withdrawing a module's condensation lifts the block on the in-app condensation", async () => {
    const { job } = await handOver();

    await harness.call('agent:withdrawJob', { id: job.id });

    const run = harness.call('condense:run', { unit: 'module', slug: SLUG });
    await run.catch((error: unknown) => {
      expect((error as { message?: string }).message).not.toBe(
        "This module's condensation is with the agent.",
      );
    });
    expect(await jobs()).toMatchObject([{ kind: 'condense-module', state: 'withdrawn' }]);
  });

  it("a module's condensation is not handed over while an in-app condensation of it is queued", async () => {
    harness.queue.enqueue(
      {
        kind: 'condense',
        lane: 'model',
        subject: { label: 'Rollenmodell', ref: `module:${SLUG}` },
      },
      () => new Promise<void>(() => undefined),
    );

    await expect(handOver()).rejects.toMatchObject({ code: 'invalid' });

    expect(await jobFiles()).toEqual([]);
  });

  it('handing over again re-attaches the task a restart dropped', async () => {
    const { job } = await handOver();
    const { resetWorkQueue } = await import('../../src/main/work-queue');
    resetWorkQueue();

    const again = await handOver();

    expect(again).toMatchObject({ outcome: 'exists', job: { id: job.id } });
    expect(await jobFiles()).toHaveLength(1);
    const { getWorkQueue } = await import('../../src/main/work-queue');
    expect(
      getWorkQueue(harness.services)
        .list()
        .filter((task) => task.kind === 'condense'),
    ).toMatchObject([{ state: 'running', subject: { ref: `module:${SLUG}` } }]);
  });
});
