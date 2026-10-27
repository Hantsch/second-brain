/* Story 063, D4: the module-lifecycle IPC channels — plan, apply and undo for
 * rename and delete — wired through the real handlers, a real vault on disk
 * and a real `IndexService`, exactly the way the app runs them.
 *
 * One test per acceptance line from the story's D4 section:
 * - a stale fingerprint refuses the apply with `conflict`, not a half-rename (AC3)
 * - a rename moves search and `askQuestion`'s citations to the new path, never
 *   the old one (AC4)
 * - a delete makes search and `askQuestion` say, honestly, that there is
 *   nothing (AC4)
 * - `modules:undo` makes the deleted state searchable again (AC4)
 * - a digestion still queued into the module blocks the plan and refuses the
 *   apply with `conflict` — the lock only covers a running write, so a queued
 *   job would recreate the folder right after the operation lands
 * - rename, delete and undo never call `createGateway` (AC5)
 *
 * `askQuestion` is called directly (not through `chat:ask`'s streaming) with a
 * `FakeProvider` built by `tests/fakes/llm.ts` — the story's own "askQuestion
 * with the fake provider" — which keeps these assertions off the streaming
 * machinery `chat:ask` needs and lets each test see the answer synchronously,
 * right after `modules:rename`/`delete`/`undo`'s own awaited `settle()`.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FsVaultStore, watchVault } from '@core/vault';
import { askQuestion } from '@core/wiki';
import type { WikiIndexView } from '@core/wiki';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { createEmptyGateway } from '../fakes/llm';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { MODULE, MODULE_FILE, PAGE_A, fixtureFiles } from '../core/wiki/module-lifecycle-fixture';
import { createGateway } from '../../src/main/llm-bridge';
import type * as LlmBridgeModule from '../../src/main/llm-bridge';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

/* Spies on the real `createGateway` for every importer of `../llm-bridge`
   (module-lifecycle.ts deliberately never imports it at all; wiki-bridge.ts,
   which `chat`/`ingest`/`condense` go through, does) — a `vi.mock` factory
   rather than `vi.spyOn` on the namespace, because it has to catch the call
   regardless of how each importer's bundled binding reaches the export. */
vi.mock('../../src/main/llm-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof LlmBridgeModule>();
  return { ...actual, createGateway: vi.fn(actual.createGateway) };
});

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

async function createHarness(userDataDir: string) {
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { moduleHandlers } = await import('../../src/main/ipc/modules');
  const { moduleLifecycleHandlers } = await import('../../src/main/ipc/module-lifecycle');
  const { searchHandlers } = await import('../../src/main/ipc/search');
  const { ingestHandlers } = await import('../../src/main/ipc/ingest');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));
  vi.spyOn(services, 'sendEvent').mockImplementation(() => undefined);

  const handlers: Handlers = {
    ...moduleHandlers(services),
    ...moduleLifecycleHandlers(services),
    ...searchHandlers(services),
    ...ingestHandlers(services),
  };

  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, settings, call };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

/** `askQuestion` against the vault exactly as it stands right now, with no
    route at all (`createEmptyGateway`, never `createGateway` from
    `../llm-bridge` — this never trips the spy above): the honest "no model
    configured" fallback answers with the search hits themselves, each one a
    literal quote straight out of the file it cites. */
async function askAbout(harness: Harness, question: string) {
  const gateway = createEmptyGateway();
  const store = new FsVaultStore(harness.services.requireVaultRoot());
  const index = harness.services.requireIndex() as unknown as WikiIndexView;
  return askQuestion({ store, index, gateway, docLanguage: 'de' }, { question });
}

async function search(harness: Harness, text: string) {
  return harness.call('search:query', { text });
}

/** A nonsense word planted in page A only — MiniSearch's fuzzy matching turns
    any ordinary German phrase ("Inhalt von A") into hits all over the fixture
    vault, so the search/ask assertions below need a term nothing else could
    ever fuzzy-match. */
const MARKER = 'zagreusmarke';

describe('module-lifecycle IPC (063, D4)', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    vault = await createTempVault();
    for (const [path, content] of Object.entries(fixtureFiles())) {
      await vault.write(path, content);
    }
    await vault.write(PAGE_A, `${fixtureFiles()[PAGE_A] ?? ''}\n${MARKER} eindeutig.\n`);
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-lifecycle-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
    vi.mocked(createGateway).mockClear();
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup().catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await vault.cleanup();
    });
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
  });

  it('a stale fingerprint returns conflict', async () => {
    const plan = await harness.call('modules:renamePlan', {
      slug: MODULE,
      title: 'Produktkenntnisse',
    });

    // An external edit lands after the preview, before the user confirms it.
    await vault.write(PAGE_A, `${(await vault.read(PAGE_A)) ?? ''}\nEin fremder Satz.\n`);

    await expect(
      harness.call('modules:rename', {
        slug: MODULE,
        title: 'Produktkenntnisse',
        fingerprint: plan.fingerprint,
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('after a rename search and ask cite the new path, never the old one', async () => {
    const plan = await harness.call('modules:renamePlan', {
      slug: MODULE,
      title: 'Produktkenntnisse',
    });
    const result = await harness.call('modules:rename', {
      slug: MODULE,
      title: 'Produktkenntnisse',
      fingerprint: plan.fingerprint,
    });
    const newSlug = result.newSlug;
    expect(newSlug).not.toBe(MODULE);

    const hits = await search(harness, MARKER);
    expect(hits.some((hit) => hit.path === `modules/${newSlug}/wiki/concepts/a.md`)).toBe(true);
    expect(hits.some((hit) => hit.path === PAGE_A)).toBe(false);

    const answer = await askAbout(harness, MARKER);
    expect(answer.citations.length).toBeGreaterThan(0);
    for (const citation of answer.citations) {
      expect(citation.path.startsWith(`modules/${MODULE}/`)).toBe(false);
    }
    expect(
      answer.citations.some((citation) => citation.path.startsWith(`modules/${newSlug}/`)),
    ).toBe(true);
  });

  it('after a delete search finds nothing and ask says it has no evidence', async () => {
    const plan = await harness.call('modules:deletePlan', { slug: MODULE });
    await harness.call('modules:delete', { slug: MODULE, fingerprint: plan.fingerprint });

    const hits = await search(harness, MARKER);
    expect(hits.some((hit) => hit.path.startsWith(`modules/${MODULE}/`))).toBe(false);

    const answer = await askAbout(harness, MARKER);
    expect(answer.unsupported).toBe(true);
    expect(answer.citations).toEqual([]);
  });

  it('after undo the module is searchable again', async () => {
    const plan = await harness.call('modules:deletePlan', { slug: MODULE });
    const deleted = await harness.call('modules:delete', {
      slug: MODULE,
      fingerprint: plan.fingerprint,
    });

    expect((await search(harness, MARKER)).some((hit) => hit.path === PAGE_A)).toBe(false);

    const undone = await harness.call('modules:undo', { undoToken: deleted.undoToken });
    expect(undone.restored.length).toBeGreaterThan(0);

    expect((await search(harness, MARKER)).some((hit) => hit.path === PAGE_A)).toBe(true);
    const answer = await askAbout(harness, MARKER);
    expect(answer.citations.some((citation) => citation.path === PAGE_A)).toBe(true);
  });

  it('rename, delete and undo run with no model configured and never create a gateway', async () => {
    const renamePlanResult = await harness.call('modules:renamePlan', {
      slug: MODULE,
      title: 'Produktkenntnisse',
    });
    const renamed = await harness.call('modules:rename', {
      slug: MODULE,
      title: 'Produktkenntnisse',
      fingerprint: renamePlanResult.fingerprint,
    });

    const deletePlanResult = await harness.call('modules:deletePlan', { slug: renamed.newSlug });
    const deleted = await harness.call('modules:delete', {
      slug: renamed.newSlug,
      fingerprint: deletePlanResult.fingerprint,
    });

    await harness.call('modules:undo', { undoToken: deleted.undoToken });

    expect(createGateway).not.toHaveBeenCalled();
  });
});

describe('a queued digestion blocks a module plan and apply (063, D4)', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;
  const envKey = 'SB_E2E_INGEST_DELAY_MS';
  const previousDelay = process.env[envKey];

  beforeEach(async () => {
    /* `ingest.ts` reads this env var exactly once, at module load — so the
       delay only takes effect if it's set *before* the module is (re-)imported. */
    process.env[envKey] = '60000';
    vi.resetModules();
    vault = await createTempVault();
    for (const [path, content] of Object.entries(fixtureFiles())) {
      await vault.write(path, content);
    }
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-lifecycle-pending-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
    /* A route for `summarize-source` only — enough for the ingest queue's own
       `llmAvailable()` check to let the job past `awaiting-llm` and into the
       held phase; the fake provider never runs since the job is cancelled
       while still paused there. */
    await harness.settings.setVaultSection('providers', [
      {
        id: 'fake-1',
        label: 'Fake',
        kind: 'fake',
        baseUrl: 'http://fake.local/v1',
        hasKey: false,
        local: true,
        enabled: true,
        models: ['fake-small'],
        createdAt: '2026-08-10T12:00:00.000Z',
      },
    ]);
    await harness.settings.setVaultSection('routing', {
      tasks: { 'summarize-source': { providerId: 'fake-1', model: 'fake-small' } },
      defaults: {},
    });
  });

  afterEach(async () => {
    if (previousDelay === undefined) delete process.env[envKey];
    else process.env[envKey] = previousDelay;
    vi.resetModules();
    await harness.services.closeVault();
    await vault.cleanup().catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await vault.cleanup();
    });
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
  });

  it('blocks the plan with digestion-pending and refuses the apply with conflict', async () => {
    const started = await harness.call('ingest:start', {
      kind: 'text',
      input: 'Ein neuer Text fuer das Modul.',
      module: MODULE,
    });

    // Deterministic: the queue sets `summarizing` right before the held phase.
    await vi.waitFor(
      async () => {
        const jobs = await harness.call('ingest:jobs', undefined);
        const job = jobs.find((entry) => entry.id === started.id);
        expect(job?.stage).toBe('summarizing');
      },
      { interval: 10 },
    );

    const renamePlanResult = await harness.call('modules:renamePlan', {
      slug: MODULE,
      title: 'Produktkenntnisse',
    });
    expect(renamePlanResult.blocked).toBe('digestion-pending');
    await expect(
      harness.call('modules:rename', {
        slug: MODULE,
        title: 'Produktkenntnisse',
        fingerprint: renamePlanResult.fingerprint,
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    const deletePlanResult = await harness.call('modules:deletePlan', { slug: MODULE });
    expect(deletePlanResult.blocked).toBe('digestion-pending');
    await expect(
      harness.call('modules:delete', { slug: MODULE, fingerprint: deletePlanResult.fingerprint }),
    ).rejects.toMatchObject({ code: 'conflict' });

    await harness.call('ingest:cancel', { id: started.id });
  });
});

/* Windows-specific regression (infrastructure gap found during e2e testing, not
 * part of 063's own D1-D6): the real app always has a live chokidar watcher on
 * the vault root (`core-bridge.ts`'s `attachWatcher`), and on Windows that
 * watcher's recursive handle deterministically `EPERM`s a directory
 * rename/delete beneath it — a structural lock, not the transient
 * antivirus-style one `fs-io.ts`'s retry-with-backoff already covers. Every
 * other suite in this file runs with no watcher attached at all, which is
 * exactly why it didn't catch this: `Services.withoutWatcher` (`services.ts`)
 * now pauses the watcher around the three folder-touching module-lifecycle
 * operations, and this is the one test in the file that wires up a *real*
 * `watchVault` the way `core-bridge.ts` does, so a regression here fails loud
 * instead of only ever showing up against the built app.
 */
describe('module-lifecycle IPC with the real vault watcher active (063, D4 regression)', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    vault = await createTempVault();
    for (const [path, content] of Object.entries(fixtureFiles())) {
      await vault.write(path, content);
    }
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-lifecycle-watch-'));
    harness = await createHarness(userDataDir);
    // Mirrors `attachCore`'s wiring in `src/main/core-bridge.ts` exactly.
    harness.services.attachWatcher(async (root, onChange) => {
      const watcher = watchVault(root, (paths) => onChange(paths, true));
      await watcher.whenReady();
      return watcher;
    });
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup().catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await vault.cleanup();
    });
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
  });

  it("a rename moves the folder even while the vault's real file watcher is active (Windows EPERM regression)", async () => {
    const plan = await harness.call('modules:renamePlan', {
      slug: MODULE,
      title: 'Produktkenntnisse',
    });

    const result = await harness.call('modules:rename', {
      slug: MODULE,
      title: 'Produktkenntnisse',
      fingerprint: plan.fingerprint,
    });

    expect(result.newSlug).not.toBe(MODULE);
    expect(await vault.read(MODULE_FILE)).toBeNull();
    expect(await vault.read(`modules/${result.newSlug}/module.md`)).not.toBeNull();

    // `modules:undo` moves the folder back under the same live watcher.
    const undone = await harness.call('modules:undo', { undoToken: result.undoToken });
    expect(undone.restored.length).toBeGreaterThan(0);
    expect(await vault.read(MODULE_FILE)).not.toBeNull();
  });

  it('two concurrent withoutWatcher operations serialize instead of leaking a watcher', async () => {
    /* Wraps the watcher factory `beforeEach` already attached (the real
       `watchVault`) with counters, so a leak — two watchers created without
       the first one ever being disposed — is directly observable, instead of
       inferring it indirectly from a subsequent operation happening to
       succeed. */
    let created = 0;
    const disposed: boolean[] = [];
    harness.services.attachWatcher(async (root, onChange) => {
      const index = created;
      created += 1;
      disposed[index] = false;
      const watcher = watchVault(root, (paths) => onChange(paths, true));
      await watcher.whenReady();
      return {
        dispose: async () => {
          disposed[index] = true;
          await watcher.dispose();
        },
      };
    });

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // Fired without awaiting the first — nothing today prevents a user from
    // triggering two module-lifecycle mutations back to back.
    await Promise.all([
      harness.services.withoutWatcher(() => delay(20)),
      harness.services.withoutWatcher(() => delay(5)),
    ]);

    // Serialized: the second call's dispose only ever sees the first call's
    // already-recreated watcher, one at a time — never two live at once, and
    // never one left orphaned (undisposed) once its turn has passed.
    expect(created).toBe(2);
    expect(disposed[0]).toBe(true);
    expect(disposed[1]).toBe(false);
  });
});
