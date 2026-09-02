/* The condensation channels in the main process — on real files, without a
 * network. Story 038, D4: `run.ts`/`write.ts` are already exercised at the
 * core level (`tests/core/condense/*`), so this file is about what the IPC
 * seam adds — the `CondenseProposal` wire shape, the accept path's
 * snapshot-then-write, and the conflict a stale hash must produce.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { condensationDueCheck, GERMAN_GARDENER_LABELS, limits } from '@core/gardener';
import type { GardenerContext } from '@core/gardener';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { CondenseProposal } from '@shared/types';
import { gardenerIndex } from '../../src/main/ipc/gardener-deps';
import { createFetchFake, jsonResponse } from '../fakes/llm';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { freezeTime, TODAY } from '../helpers/time';

/* No Electron in tests: no windows, no encryption. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const CONDENSED_PATH = 'areas/gesundheit.condensed.md';
const AREA_PATH = 'areas/gesundheit.md';

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { condenseHandlers } = await import('../../src/main/ipc/condense');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const handlers: Handlers = { ...condenseHandlers(services) };
  const events = vi.spyOn(services, 'sendEvent');
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, call, events };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

/** The findings `condensationDueCheck` (story 039) reports over this vault's real
    index — the same check the maintenance run wires up, but called directly here
    so a delete's effect on it doesn't depend on running the whole gardener. */
function condensationDueFindings(services: Harness['services']) {
  const ctx: GardenerContext = {
    index: gardenerIndex(services),
    modules: [],
    limits: limits(),
    today: TODAY,
    ranAt: new Date().toISOString(),
    labels: GERMAN_GARDENER_LABELS,
    docLanguage: 'de',
    replyLanguage: 'de',
  };
  return condensationDueCheck.run(ctx);
}

/** Routes `condense-area` to a fake provider that answers with the given three
    machine sections — the minimum a `condense:run` needs to reach `kind: 'proposal'`
    instead of falling back to `llm-unavailable`. Mirrors the routing helper
    `gardener-ipc.test.ts` uses for `journal-loose-ends`. */
async function routeCondenseAreaTo(harness: Harness, sections: Record<string, unknown>) {
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
    tasks: { 'condense-area': { providerId: 'local-1', model: 'qwen2.5:14b' } },
    defaults: {},
  });
  const fake = createFetchFake(() =>
    jsonResponse({ choices: [{ message: { content: JSON.stringify(sections) } }] }),
  );
  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

describe('condense channels in main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    freezeTime();
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-condense-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  // ── Reading ────────────────────────────────────────────────────────────────

  it('reads null when the area has never been condensed', async () => {
    expect(await harness.call('condense:read', { slug: 'gesundheit' })).toBeNull();
  });

  it('reads the existing artifact with its hash and sources', async () => {
    const content = [
      '---',
      'type: condensed',
      'title: Gesundheit',
      'condensed_at: 2026-08-01T10:00:00+02:00',
      'sources:',
      '  - areas/gesundheit.md',
      '---',
      '',
      '## Stand',
      '',
      'Alt.',
      '',
    ].join('\n');
    await vault.write(CONDENSED_PATH, content);

    const read = await harness.call('condense:read', { slug: 'gesundheit' });

    expect(read?.content).toBe(content);
    expect(read?.condensedAt).toBe('2026-08-01T10:00:00+02:00');
    expect(read?.sources).toEqual(['areas/gesundheit.md']);
    expect(read?.hash).toBe((await vault.store.read(CONDENSED_PATH))?.hash);
  });

  // ── Running ────────────────────────────────────────────────────────────────

  it('says which task has no model configured, without writing anything', async () => {
    await expect(harness.call('condense:run', { slug: 'gesundheit' })).rejects.toMatchObject({
      code: 'llm-unavailable',
      detail: { task: 'condense-area' },
    });
    expect(await vault.exists(CONDENSED_PATH)).toBe(false);
  });

  // ── Accepting ──────────────────────────────────────────────────────────────

  function proposalFor(after: string, baseHash: string | null): CondenseProposal {
    return {
      slug: 'gesundheit',
      path: CONDENSED_PATH,
      baseHash,
      before: '',
      after,
      sources: ['areas/gesundheit.md'],
    };
  }

  it('accepts a first-time proposal: writes once, no undo token to offer', async () => {
    const after = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nNeu.\n';

    const result = await harness.call('condense:accept', { proposal: proposalFor(after, null) });

    expect(await vault.read(CONDENSED_PATH)).toBe(after);
    expect(result.hash).toBe((await vault.store.read(CONDENSED_PATH))?.hash);
    expect(result.undoToken).toBeNull();
    expect(harness.events).toHaveBeenCalledWith('event:vault-changed', {
      paths: [CONDENSED_PATH],
      external: false,
    });
  });

  it('accepts a proposal over an existing artifact and offers an undo token', async () => {
    const before = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nAlt.\n';
    await vault.write(CONDENSED_PATH, before);
    const hash = (await vault.store.read(CONDENSED_PATH))?.hash ?? '';
    const after = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nNeu.\n';

    const result = await harness.call('condense:accept', {
      proposal: proposalFor(after, hash),
    });

    expect(await vault.read(CONDENSED_PATH)).toBe(after);
    expect(result.hash).toBe((await vault.store.read(CONDENSED_PATH))?.hash);
    expect(result.undoToken).not.toBeNull();
  });

  it('refuses a stale hash, leaves the file byte-identical and writes nothing', async () => {
    const before = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nAlt.\n';
    await vault.write(CONDENSED_PATH, before);
    const staleHash = 'von-vorgestern';
    const after = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nNeu.\n';

    await expect(
      harness.call('condense:accept', { proposal: proposalFor(after, staleHash) }),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(await vault.read(CONDENSED_PATH)).toBe(before);
  });

  it('a stale-hash accept creates no trash entry', async () => {
    const before = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nAlt.\n';
    await vault.write(CONDENSED_PATH, before);
    const after = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nNeu.\n';

    await expect(
      harness.call('condense:accept', { proposal: proposalFor(after, 'von-vorgestern') }),
    ).rejects.toMatchObject({ code: 'conflict' });

    // The precondition check must run BEFORE `snapshot()` — otherwise a
    // refused accept would still leave an orphaned copy in the trash.
    const allPaths = await vault.store.list({ includeInternal: true });
    expect(allPaths.some((path) => path.includes('trash'))).toBe(false);
  });

  it('accept derives the write path from the slug, not from a tampered proposal.path', async () => {
    const before = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nAlt.\n';
    await vault.write(CONDENSED_PATH, before);
    const hash = (await vault.store.read(CONDENSED_PATH))?.hash ?? '';
    const after = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nNeu.\n';
    const tampered = {
      ...proposalFor(after, hash),
      path: 'areas/anderswo.condensed.md',
    };

    const result = await harness.call('condense:accept', { proposal: tampered });

    expect(await vault.read(CONDENSED_PATH)).toBe(after);
    expect(await vault.exists('areas/anderswo.condensed.md')).toBe(false);
    expect(result.path).toBe(CONDENSED_PATH);
  });

  it('refuses to create over a file that appeared since the proposal was built', async () => {
    const after = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nNeu.\n';
    /* The proposal was built as if nothing existed yet (baseHash: null), but a
       file has since appeared — same "must not exist" guard `areas:create` uses. */
    await vault.write(CONDENSED_PATH, 'von einem zweiten Lauf');

    await expect(
      harness.call('condense:accept', { proposal: proposalFor(after, null) }),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(await vault.read(CONDENSED_PATH)).toBe('von einem zweiten Lauf');
  });

  // ── Rejecting ──────────────────────────────────────────────────────────────

  it('records a rejection as a minimal artifact when none existed yet', async () => {
    const result = await harness.call('condense:reject', {
      slug: 'gesundheit',
      reason: 'Der Ton trifft es nicht.',
    });

    expect(result.path).toBe(CONDENSED_PATH);
    const raw = (await vault.read(CONDENSED_PATH)) ?? '';
    expect(raw).toContain('type: condensed');
    expect(raw).toContain('Der Ton trifft es nicht.');
    expect(raw).not.toContain('## Stand');
  });

  it('appends a second rejection to the existing directives, keeping the first', async () => {
    await harness.call('condense:reject', { slug: 'gesundheit', reason: 'Erster Grund.' });

    const result = await harness.call('condense:reject', {
      slug: 'gesundheit',
      reason: 'Zweiter Grund.',
    });

    const raw = (await vault.read(CONDENSED_PATH)) ?? '';
    expect(raw).toContain('Erster Grund.');
    expect(raw).toContain('Zweiter Grund.');
    expect(result.path).toBe(CONDENSED_PATH);
  });

  it('refuses a blank reason without writing anything', async () => {
    await expect(
      harness.call('condense:reject', { slug: 'gesundheit', reason: '   ' }),
    ).rejects.toMatchObject({ code: 'invalid' });

    expect(await vault.exists(CONDENSED_PATH)).toBe(false);
  });

  it('catches an external edit landing between the read and the write as a conflict', async () => {
    const before = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Direktiven\n\nAlt.\n';
    await vault.write(CONDENSED_PATH, before);
    const { FsVaultStore } = await import('@core/vault');
    const originalReadText = FsVaultStore.prototype.readText;
    const externalEdit = before + '\nExterner Eintrag.\n';
    const spy = vi.spyOn(FsVaultStore.prototype, 'readText').mockImplementationOnce(async function (
      this: InstanceType<typeof FsVaultStore>,
      path: string,
    ) {
      const text = await originalReadText.call(this, path);
      // Simulate a concurrent external edit landing right after the read
      // this handler is about to build its write from.
      await vault.write(CONDENSED_PATH, externalEdit);
      return text;
    });

    try {
      await expect(
        harness.call('condense:reject', { slug: 'gesundheit', reason: 'Zu ungenau.' }),
      ).rejects.toMatchObject({ code: 'conflict' });
    } finally {
      spy.mockRestore();
    }

    // Nothing from the stale read was written over the external edit.
    expect(await vault.read(CONDENSED_PATH)).toBe(externalEdit);
  });

  // ── Deleting (043, D1) ───────────────────────────────────────────────────

  it('deletes a fresh-hash artifact, offers an undo token, and undo restores it byte-identical', async () => {
    const content = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nAlt.\n';
    await vault.write(CONDENSED_PATH, content);
    const hash = (await vault.store.read(CONDENSED_PATH))?.hash ?? '';

    const result = await harness.call('condense:delete', {
      slug: 'gesundheit',
      expectedHash: hash,
    });

    expect(result.path).toBe(CONDENSED_PATH);
    expect(await vault.exists(CONDENSED_PATH)).toBe(false);
    expect(result.undoToken.length).toBeGreaterThan(0);

    await vault.store.undo(result.undoToken);

    expect(await vault.read(CONDENSED_PATH)).toBe(content);
  });

  it('a fresh-hash delete drops the document from the index', async () => {
    const content = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nAlt.\n';
    await vault.write(CONDENSED_PATH, content);
    await harness.services.requireIndex().refresh?.();
    const hash = (await vault.store.read(CONDENSED_PATH))?.hash ?? '';

    await harness.call('condense:delete', { slug: 'gesundheit', expectedHash: hash });

    expect(await harness.call('condense:read', { slug: 'gesundheit' })).toBeNull();
    const docs = gardenerIndex(harness.services).index().docs;
    expect(docs.some((doc) => doc.path === CONDENSED_PATH)).toBe(false);
  });

  it('refuses a stale hash, leaves the file byte-identical and creates no trash entry', async () => {
    const content = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nAlt.\n';
    await vault.write(CONDENSED_PATH, content);

    await expect(
      harness.call('condense:delete', { slug: 'gesundheit', expectedHash: 'von-vorgestern' }),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(await vault.read(CONDENSED_PATH)).toBe(content);
    const allPaths = await vault.store.list({ includeInternal: true });
    expect(allPaths.some((path) => path.includes('trash'))).toBe(false);
  });

  it('refuses to delete an artifact that does not exist', async () => {
    await expect(
      harness.call('condense:delete', { slug: 'gesundheit', expectedHash: 'irgendein-hash' }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('after a delete, 039s condensation-due check reports the area as material without an artifact', async () => {
    const content = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nAlt.\n';
    await vault.write(CONDENSED_PATH, content);
    await harness.services.requireIndex().refresh?.();
    const hash = (await vault.store.read(CONDENSED_PATH))?.hash ?? '';

    await harness.call('condense:delete', { slug: 'gesundheit', expectedHash: hash });

    const findings = condensationDueFindings(harness.services);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe('condensation-due');
    // The "missing artifact" variant names only the area file — the "existing but
    // stale" variant would also name the (now gone) artifact path.
    expect(findings[0]?.paths).toEqual([AREA_PATH]);
  });

  it('condense:run after a delete starts fresh: no directive carries over from before', async () => {
    // A rejection first, so the artifact has a non-empty "Direktiven" section —
    // the state a plain reject (038) would leave behind.
    await harness.call('condense:reject', {
      slug: 'gesundheit',
      reason: 'Der Ton trifft es nicht.',
    });
    const hash = (await vault.store.read(CONDENSED_PATH))?.hash ?? '';

    await harness.call('condense:delete', { slug: 'gesundheit', expectedHash: hash });

    await routeCondenseAreaTo(harness, {
      state: { text: 'Rücken und Schlaf im Blick.', sources: [AREA_PATH] },
      patterns: { text: 'Kurze Pausen wirken mehr als langes Liegen.', sources: [AREA_PATH] },
      open: { text: 'Themen bleiben aktuell.', sources: [AREA_PATH] },
    });

    const proposal = await harness.call('condense:run', { slug: 'gesundheit' });

    expect(proposal.after).not.toContain('Der Ton trifft es nicht.');
    const directivesBody = proposal.after.split(/## (?:Direktiven|Directives)/)[1]?.trim() ?? '';
    expect(directivesBody).toBe('');
  });

  it('requires an open vault', async () => {
    await harness.services.closeVault();
    await expect(harness.call('condense:read', { slug: 'gesundheit' })).rejects.toMatchObject({
      code: 'no-vault',
    });
  });
});
