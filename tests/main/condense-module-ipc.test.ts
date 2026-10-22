/* The condensation channels at the module level, on real files and without a
   network. What matters here is not the run (`tests/core/condense/run-module.test.ts`)
   but the seam: the overview is an existing wiki page that is condensed in place,
   so accepting must keep the previous file, a stale hash must not overwrite an
   external edit, a rejection must not touch anything but its directives, and the
   channel must refuse to delete the page. */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { CondenseProposal } from '@shared/types';
import { createFetchFake, jsonResponse } from '../fakes/llm';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { freezeTime } from '../helpers/time';

/* No Electron in tests: no windows, no encryption. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const SLUG = 'rollenmodell';
const OVERVIEW = `modules/${SLUG}/wiki/overview.md`;
const MODULE_FILE = `modules/${SLUG}/module.md`;
const RBAC = `modules/${SLUG}/wiki/concepts/rbac.md`;
const GUIDE = `modules/${SLUG}/wiki/sources/s-2026-07-02-auth0-guide.md`;

const STUB = [
  '---',
  'type: overview',
  `title: Rollenmodell — Synthese`,
  `module: ${SLUG}`,
  '---',
  '',
  '## Seiten',
  '',
].join('\n');

function wikiPage(type: string, title: string, body: string): string {
  return `---\ntype: ${type}\ntitle: ${title}\nmodule: ${SLUG}\n---\n\n${body}\n`;
}

/** A module the way creation leaves it, plus two pages worth condensing. */
const MODULE_FILES: Record<string, string> = {
  [MODULE_FILE]: `---\ntype: note\ntitle: Rollenmodell\nslug: ${SLUG}\ndescription: Rollen pro Tenant\n---\n\nRollen.\n`,
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

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { condenseHandlers } = await import('../../src/main/ipc/condense');
  const { tasksHandlers } = await import('../../src/main/ipc/tasks');
  const { getWorkQueue, resetWorkQueue } = await import('../../src/main/work-queue');
  const { resetTaskResults } = await import('../../src/main/task-results');

  /* Process-wide singletons: one test's queue must not leak into the next. */
  resetWorkQueue();
  resetTaskResults();

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const queue = getWorkQueue(services);
  const handlers: Handlers = { ...condenseHandlers(services), ...tasksHandlers(services) };
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, call, queue };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

/** Queue a module run, wait for the task to settle and fetch the stored proposal. */
async function runProposal(harness: Harness, slug = SLUG): Promise<CondenseProposal> {
  const queued = await harness.call('condense:run', { unit: 'module', slug });
  const finished = await vi.waitFor(() => {
    const task = harness.queue.list().find((entry) => entry.id === queued.id);
    if (task === undefined || task.state === 'queued' || task.state === 'running') {
      throw new Error(`Task ${queued.id} läuft noch`);
    }
    return task;
  });
  expect(`${finished.state}: ${finished.message ?? ''}`).toBe('done: ');
  const result = await harness.call('tasks:result', { id: queued.id });
  if (result === null || result.kind !== 'condense') throw new Error('kein Verdichtungsergebnis');
  return result.proposal;
}

/** Routes `condense-module` to a fake provider answering with a reply that cites
    only pages the run reads, so the run reaches a proposal. */
async function routeModuleCondensation(harness: Harness) {
  await harness.services.settings.setVaultSection('providers', [
    {
      id: 'local-1',
      label: 'Lokal',
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      hasKey: false,
      local: true,
      enabled: true,
      models: ['qwen2.5:14b'],
      createdAt: '2026-08-10T12:00:00.000Z',
    },
  ]);
  await harness.services.settings.setVaultSection('routing', {
    tasks: { 'condense-module': { providerId: 'local-1', model: 'qwen2.5:14b' } },
    defaults: {},
  });
  const reply = {
    decided: { text: 'Rollen pro Tenant.', sources: [RBAC] },
    open: { text: 'Token-Laufzeit offen.', sources: [GUIDE] },
    contradictions: { text: '', sources: [] },
  };
  const fake = createFetchFake(() =>
    jsonResponse({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
  );
  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

describe('condense channels at the module level', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    freezeTime();
    vault = await createTempVault({ files: MODULE_FILES });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-condense-module-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  async function trashedPaths(): Promise<string[]> {
    const all = await vault.store.list({ includeInternal: true });
    return all.filter((path) => path.includes('trash'));
  }

  it('an overview never condensed reads as not condensed', async () => {
    expect(await harness.call('condense:read', { unit: 'module', slug: SLUG })).toBeNull();
  });

  it('accepting writes overview.md and leaves the previous file in .secondbrain/trash/', async () => {
    await routeModuleCondensation(harness);
    const proposal = await runProposal(harness);
    expect(proposal.path).toBe(OVERVIEW);
    expect(proposal.before).toBe(STUB);
    // Guardrail 2: the run proposes, the file changes only on accept.
    expect(await vault.read(OVERVIEW)).toBe(STUB);

    const result = await harness.call('condense:accept', { proposal });

    expect(result.path).toBe(OVERVIEW);
    expect(await vault.read(OVERVIEW)).toBe(proposal.after);
    expect(proposal.after).toContain('type: overview');
    const trashed = await trashedPaths();
    expect(trashed.some((path) => path.startsWith('.secondbrain/trash/'))).toBe(true);
    const contents = await Promise.all(trashed.map((path) => vault.read(path)));
    expect(contents).toContain(STUB);

    const read = await harness.call('condense:read', { unit: 'module', slug: SLUG });
    expect(read?.path).toBe(OVERVIEW);
    expect(read?.content).toBe(proposal.after);
    expect(read?.sources).toEqual([GUIDE, RBAC].sort());
  });

  it('accepting after overview.md changed on disk is a conflict and leaves it byte-identical', async () => {
    await routeModuleCondensation(harness);
    const proposal = await runProposal(harness);
    const edited = `${STUB}\nVon Hand ergänzt.\n`;
    await vault.write(OVERVIEW, edited);

    await expect(harness.call('condense:accept', { proposal })).rejects.toMatchObject({
      code: 'conflict',
    });

    expect(await vault.read(OVERVIEW)).toBe(edited);
    expect(await trashedPaths()).toEqual([]);
  });

  it('rejecting a module proposal appends the reason to its directives and changes nothing else', async () => {
    const before = await Promise.all(Object.keys(MODULE_FILES).map((path) => vault.read(path)));

    const result = await harness.call('condense:reject', {
      unit: 'module',
      slug: SLUG,
      reason: 'Die Widersprüche fehlen.',
    });

    expect(result.path).toBe(OVERVIEW);
    const raw = (await vault.read(OVERVIEW)) ?? '';
    const [head, directives = ''] = raw.split('## Direktiven');
    expect(head).toBe(`${STUB.replace(/\s+$/, '')}\n\n`);
    expect(directives.trim()).toBe('Die Widersprüche fehlen.');
    const after = await Promise.all(Object.keys(MODULE_FILES).map((path) => vault.read(path)));
    expect(after.filter((_, index) => Object.keys(MODULE_FILES)[index] !== OVERVIEW)).toEqual(
      before.filter((_, index) => Object.keys(MODULE_FILES)[index] !== OVERVIEW),
    );
  });

  it('a rejection of a module without an overview file creates a wiki page, not a condensed artifact', async () => {
    await rm(vault.absolute(OVERVIEW));

    await harness.call('condense:reject', { unit: 'module', slug: SLUG, reason: 'Zu knapp.' });

    const raw = (await vault.read(OVERVIEW)) ?? '';
    expect(raw).toContain('type: overview');
    expect(raw).not.toContain('type: condensed');
  });

  it('a module condensation writes its headings in the document language, not the UI language', async () => {
    await harness.services.settings.patchVault({ languages: { ui: 'de', documents: 'en' } });
    await routeModuleCondensation(harness);

    const proposal = await runProposal(harness);

    expect(proposal.after).toContain('## Decided');
    expect(proposal.after).not.toContain('## Entschieden');
  });

  it('without a model for condense-module the run names the task and writes nothing', async () => {
    await expect(
      harness.call('condense:run', { unit: 'module', slug: SLUG }),
    ).rejects.toMatchObject({
      code: 'llm-unavailable',
      detail: { reason: 'no-route', task: 'condense-module' },
    });

    expect(await vault.read(OVERVIEW)).toBe(STUB);
    expect(harness.queue.list()).toEqual([]);
  });

  it('an unknown module is refused on every channel without guessing a path', async () => {
    const slug = 'gibt-es-nicht';
    const proposal: CondenseProposal = {
      unit: 'module',
      slug,
      path: `modules/${slug}/wiki/overview.md`,
      baseHash: null,
      before: '',
      after: 'egal',
      sources: [],
    };

    await expect(harness.call('condense:read', { unit: 'module', slug })).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(harness.call('condense:run', { unit: 'module', slug })).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(harness.call('condense:accept', { proposal })).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(
      harness.call('condense:reject', { unit: 'module', slug, reason: 'Passt nicht.' }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      harness.call('condense:read', { unit: 'module', slug: '  ' }),
    ).rejects.toMatchObject({ code: 'invalid' });

    expect(await vault.exists(proposal.path)).toBe(false);
  });

  it('a module overview cannot be deleted through condense', async () => {
    const hash = (await vault.store.read(OVERVIEW))?.hash ?? '';

    await expect(
      harness.call('condense:delete', { unit: 'module', slug: SLUG, expectedHash: hash }),
    ).rejects.toMatchObject({ code: 'invalid' });

    expect(await vault.read(OVERVIEW)).toBe(STUB);
    expect(await trashedPaths()).toEqual([]);
  });
});
