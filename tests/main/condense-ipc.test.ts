/* The condensation channels in the main process — on real files, without a
 * network. Story 038, D4: `run.ts`/`write.ts` are already exercised at the
 * core level (`tests/core/condense/*`), so this file is about what the IPC
 * seam adds — the `CondenseProposal` wire shape, the accept path's
 * snapshot-then-write, and the conflict a stale hash must produce.
 *
 * Story 045, D2 adds the second level: the same five channels with
 * `unit: 'project'`. What is worth testing there is not the run (044 covers it)
 * but the path — a project's artifact path comes from a scope lookup through the
 * index, not from a slug template, so the tests below pin down that every write,
 * snapshot and delete lands in that project's own folder and nowhere else.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { condensationDueCheck, GERMAN_GARDENER_LABELS, limits } from '@core/gardener';
import type { GardenerContext } from '@core/gardener';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { CondenseProposal, CondenseUnit } from '@shared/types';
import { gardenerIndex } from '../../src/main/ipc/gardener-deps';
import { CLAUDE_PROJECTS_DIR, WORK_PROJECT } from '../fixtures';
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

/* The fixture vault's work project, and the two paths of its folder. The private
   fixture project is the neighbour every path assertion is measured against: no
   request about `kundenportal-relaunch` may ever touch it. */
const PROJECT_SLUG = WORK_PROJECT;
const PROJECT_FILE = `projects/work/${WORK_PROJECT}/project.md`;
const PROJECT_CONDENSED = `projects/work/${WORK_PROJECT}/condensed.md`;
const OTHER_PROJECT_CONDENSED = 'projects/private/hochbeet-bauen/condensed.md';

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { condenseHandlers } = await import('../../src/main/ipc/condense');
  /* Since 073, D3 `condense:run` only queues its work — so the proposal comes
     back through `tasks:result`, and this suite needs that channel alongside
     the five condense ones to assert on a run at all. */
  const { tasksHandlers } = await import('../../src/main/ipc/tasks');
  const { getWorkQueue, resetWorkQueue } = await import('../../src/main/work-queue');
  const { resetTaskResults } = await import('../../src/main/task-results');

  /* Both are process-wide singletons: without this, one test's queue and its
     stored proposals would still be there for the next one — and the registry
     would keep emitting into the previous test's `Services`. */
  resetWorkQueue();
  resetTaskResults();

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const queue = getWorkQueue(services);
  const handlers: Handlers = { ...condenseHandlers(services), ...tasksHandlers(services) };
  const events = vi.spyOn(services, 'sendEvent');
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, call, events, queue };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

/**
 * A full run, from the outside: queue it, wait for the task to settle, and
 * fetch the proposal it stored. What `condense:run` used to answer with
 * directly (073, D3) — so the assertions below still speak about a proposal
 * and stay comparable to what they pinned down before.
 */
async function runProposal(
  harness: Harness,
  unit: CondenseUnit,
  slug: string,
): Promise<CondenseProposal> {
  const queued = await harness.call('condense:run', { unit, slug });
  expect(queued.kind).toBe('condense');
  const finished = await vi.waitFor(() => {
    const task = harness.queue.list().find((entry) => entry.id === queued.id);
    if (task === undefined || task.state === 'queued' || task.state === 'running') {
      throw new Error(`Task ${queued.id} läuft noch`);
    }
    return task;
  });
  /* A failed run must not be read as "no proposal yet" — the message the task
     carries is the run's own reason and belongs in the test output. */
  expect(`${finished.state}: ${finished.message ?? ''}`).toBe('done: ');
  expect(finished.hasResult).toBe(true);
  const result = await harness.call('tasks:result', { id: queued.id });
  if (result === null || result.kind !== 'condense') throw new Error('kein Verdichtungsergebnis');
  return result.proposal;
}

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

/** Routes one condense task to a fake provider that answers with the given
    machine sections — the minimum a `condense:run` needs to reach
    `kind: 'proposal'` instead of falling back to `llm-unavailable`. Mirrors the
    routing helper `gardener-ipc.test.ts` uses for `journal-loose-ends`. */
async function routeCondenseTo(
  harness: Harness,
  task: 'condense-area' | 'condense-project',
  sections: Record<string, unknown>,
) {
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
    tasks: { [task]: { providerId: 'local-1', model: 'qwen2.5:14b' } },
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
    /* The sessions of a project condensation are read from disk, and
       `overview.useClaudeSessions` defaults to true — so this points the reader
       at the fixture sessions. Without it a project run would read the *real*
       `~/.claude` of whoever runs the suite. */
    await harness.services.settings.patchVault({
      overview: { claudeProjectsDir: CLAUDE_PROJECTS_DIR },
    });
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
    /* A `fetch` stub from one test must not answer for the next one. */
    vi.unstubAllGlobals();
  });

  // ── Reading ────────────────────────────────────────────────────────────────

  it('reads null when the area has never been condensed', async () => {
    expect(await harness.call('condense:read', { unit: 'area', slug: 'gesundheit' })).toBeNull();
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

    const read = await harness.call('condense:read', { unit: 'area', slug: 'gesundheit' });

    expect(read?.content).toBe(content);
    expect(read?.condensedAt).toBe('2026-08-01T10:00:00+02:00');
    expect(read?.sources).toEqual(['areas/gesundheit.md']);
    expect(read?.hash).toBe((await vault.store.read(CONDENSED_PATH))?.hash);
  });

  // ── Running ────────────────────────────────────────────────────────────────

  it('says which task has no model configured, without writing anything', async () => {
    await expect(
      harness.call('condense:run', { unit: 'area', slug: 'gesundheit' }),
    ).rejects.toMatchObject({
      code: 'llm-unavailable',
      detail: { task: 'condense-area' },
    });
    expect(await vault.exists(CONDENSED_PATH)).toBe(false);
    /* 073, AC7: the dead end stays a dead end — the refusal happens before
       anything is queued, so there is no task that could only ever fail. */
    expect(harness.queue.list()).toEqual([]);
  });

  // ── Accepting ──────────────────────────────────────────────────────────────

  function proposalFor(after: string, baseHash: string | null): CondenseProposal {
    return {
      unit: 'area',
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
      unit: 'area',
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
    await harness.call('condense:reject', {
      unit: 'area',
      slug: 'gesundheit',
      reason: 'Erster Grund.',
    });

    const result = await harness.call('condense:reject', {
      unit: 'area',
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
      harness.call('condense:reject', { unit: 'area', slug: 'gesundheit', reason: '   ' }),
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
        harness.call('condense:reject', {
          unit: 'area',
          slug: 'gesundheit',
          reason: 'Zu ungenau.',
        }),
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
      unit: 'area',
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

    await harness.call('condense:delete', { unit: 'area', slug: 'gesundheit', expectedHash: hash });

    expect(await harness.call('condense:read', { unit: 'area', slug: 'gesundheit' })).toBeNull();
    const docs = gardenerIndex(harness.services).index().docs;
    expect(docs.some((doc) => doc.path === CONDENSED_PATH)).toBe(false);
  });

  it('refuses a stale hash, leaves the file byte-identical and creates no trash entry', async () => {
    const content = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nAlt.\n';
    await vault.write(CONDENSED_PATH, content);

    await expect(
      harness.call('condense:delete', {
        unit: 'area',
        slug: 'gesundheit',
        expectedHash: 'von-vorgestern',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(await vault.read(CONDENSED_PATH)).toBe(content);
    const allPaths = await vault.store.list({ includeInternal: true });
    expect(allPaths.some((path) => path.includes('trash'))).toBe(false);
  });

  it('refuses to delete an artifact that does not exist', async () => {
    await expect(
      harness.call('condense:delete', {
        unit: 'area',
        slug: 'gesundheit',
        expectedHash: 'irgendein-hash',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('after a delete, 039s condensation-due check reports the area as material without an artifact', async () => {
    const content = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nAlt.\n';
    await vault.write(CONDENSED_PATH, content);
    await harness.services.requireIndex().refresh?.();
    const hash = (await vault.store.read(CONDENSED_PATH))?.hash ?? '';

    await harness.call('condense:delete', { unit: 'area', slug: 'gesundheit', expectedHash: hash });

    // Only the area arm is the question here; since 046 the same check also
    // reports this vault's projects, which this delete does not touch.
    const findings = condensationDueFindings(harness.services).filter((finding) =>
      finding.paths.includes(AREA_PATH),
    );
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
      unit: 'area',
      slug: 'gesundheit',
      reason: 'Der Ton trifft es nicht.',
    });
    const hash = (await vault.store.read(CONDENSED_PATH))?.hash ?? '';

    await harness.call('condense:delete', { unit: 'area', slug: 'gesundheit', expectedHash: hash });

    await routeCondenseTo(harness, 'condense-area', {
      state: { text: 'Rücken und Schlaf im Blick.', sources: [AREA_PATH] },
      patterns: { text: 'Kurze Pausen wirken mehr als langes Liegen.', sources: [AREA_PATH] },
      open: { text: 'Themen bleiben aktuell.', sources: [AREA_PATH] },
    });

    const proposal = await runProposal(harness, 'area', 'gesundheit');

    expect(proposal.after).not.toContain('Der Ton trifft es nicht.');
    const directivesBody = proposal.after.split(/## (?:Direktiven|Directives)/)[1]?.trim() ?? '';
    expect(directivesBody).toBe('');
  });

  it('requires an open vault', async () => {
    await harness.services.closeVault();
    await expect(
      harness.call('condense:read', { unit: 'area', slug: 'gesundheit' }),
    ).rejects.toMatchObject({
      code: 'no-vault',
    });
  });

  // ── The project level (045, D2) ──────────────────────────────────────────

  /** A project artifact as a run would leave it: the four machine sections of
      docs/VAULT-FORMAT.md, in German, plus the frontmatter contract. */
  function projectArtifact(state: string): string {
    return [
      '---',
      'type: condensed',
      'title: Kundenportal Relaunch — verdichtet',
      'condensed_at: 2026-08-01T10:00:00+02:00',
      'sources:',
      `  - ${PROJECT_FILE}`,
      '---',
      '',
      '## Stand',
      '',
      state,
      '',
      '## Nächster Schritt',
      '',
      'Abnahmeprotokoll mit Miriam durchgehen.',
      '',
      '## Wartet auf',
      '',
      'Jonas: Fallback für abgelaufene Sitzungen.',
      '',
      '## Gelernt',
      '',
      'Sammelaufrufe schlagen Einzelabfragen.',
      '',
    ].join('\n');
  }

  function projectProposal(after: string, baseHash: string | null): CondenseProposal {
    return {
      unit: 'project',
      slug: PROJECT_SLUG,
      path: PROJECT_CONDENSED,
      baseHash,
      before: '',
      after,
      sources: [PROJECT_FILE],
    };
  }

  /** Every machine section cites `project.md`, which the run always reads — so
      the reply passes attribution without the test having to predict which
      journal days or sessions came along. */
  function projectSections(): Record<string, unknown> {
    return {
      state: { text: 'Die Angebotsliste liegt auf dem Testsystem.', sources: [PROJECT_FILE] },
      'next-step': { text: 'Abnahmeprotokoll mit Miriam.', sources: [PROJECT_FILE] },
      'waiting-on': { text: 'Jonas liefert den Fallback.', sources: [PROJECT_FILE] },
      learned: { text: 'Einzelabfragen pro Zeile kosten am meisten.', sources: [PROJECT_FILE] },
    };
  }

  it('reads null when the project has never been condensed', async () => {
    expect(await harness.call('condense:read', { unit: 'project', slug: PROJECT_SLUG })).toBeNull();
  });

  it('reads a project artifact and answers with the path inside its own folder', async () => {
    const content = projectArtifact('Auf dem Testsystem.');
    await vault.write(PROJECT_CONDENSED, content);

    const read = await harness.call('condense:read', { unit: 'project', slug: PROJECT_SLUG });

    expect(read?.path).toBe(PROJECT_CONDENSED);
    expect(read?.content).toBe(content);
    expect(read?.condensedAt).toBe('2026-08-01T10:00:00+02:00');
    expect(read?.sources).toEqual([PROJECT_FILE]);
    expect(read?.hash).toBe((await vault.store.read(PROJECT_CONDENSED))?.hash);
  });

  it('refuses an unknown project slug on every channel, without guessing a path', async () => {
    const slug = 'gibt-es-nicht';

    await expect(harness.call('condense:read', { unit: 'project', slug })).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(harness.call('condense:run', { unit: 'project', slug })).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(
      harness.call('condense:accept', {
        proposal: {
          ...projectProposal('egal', null),
          slug,
          path: `projects/work/${slug}/condensed.md`,
        },
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      harness.call('condense:reject', { unit: 'project', slug, reason: 'Passt nicht.' }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      harness.call('condense:delete', { unit: 'project', slug, expectedHash: 'irgendeiner' }),
    ).rejects.toMatchObject({ code: 'invalid' });

    expect(await vault.exists(`projects/work/${slug}/condensed.md`)).toBe(false);
    expect(await vault.exists(`projects/private/${slug}/condensed.md`)).toBe(false);
  });

  it('runs a project and proposes an artifact inside that project’s own folder', async () => {
    const fake = await routeCondenseTo(harness, 'condense-project', projectSections());

    const proposal = await runProposal(harness, 'project', PROJECT_SLUG);

    expect(proposal.unit).toBe('project');
    expect(proposal.slug).toBe(PROJECT_SLUG);
    expect(proposal.path).toBe(PROJECT_CONDENSED);
    expect(proposal.baseHash).toBeNull();
    expect(proposal.before).toBe('');
    expect(proposal.after).toContain('type: condensed');
    expect(proposal.after).toContain('## Stand');
    expect(proposal.sources).toContain(PROJECT_FILE);
    // Guardrail 2: a run proposes; the file appears only on accept.
    expect(await vault.exists(PROJECT_CONDENSED)).toBe(false);
    // The linked fixture session is read and cited as its agent ref (044, D12),
    // and its transcript tail — read here in the shell — reached the prompt.
    expect(proposal.sources.some((source) => source.startsWith('agent:claude/'))).toBe(true);
    const sent = JSON.stringify(fake.calls[0]?.body ?? {});
    expect(sent).toContain('bei 400 Angeboten sind das 400 Abfragen');
    expect(String(fake.calls[0]?.url)).toContain('localhost');
  });

  it('names condense-project when no model is configured, and writes nothing', async () => {
    await expect(
      harness.call('condense:run', { unit: 'project', slug: PROJECT_SLUG }),
    ).rejects.toMatchObject({ code: 'llm-unavailable', detail: { task: 'condense-project' } });

    expect(await vault.exists(PROJECT_CONDENSED)).toBe(false);
    expect(harness.queue.list()).toEqual([]);
  });

  it('accepts a project proposal over an existing artifact and leaves an undo copy', async () => {
    const before = projectArtifact('Alt.');
    await vault.write(PROJECT_CONDENSED, before);
    const hash = (await vault.store.read(PROJECT_CONDENSED))?.hash ?? '';
    const after = projectArtifact('Neu.');

    const result = await harness.call('condense:accept', {
      proposal: projectProposal(after, hash),
    });

    expect(result.path).toBe(PROJECT_CONDENSED);
    expect(await vault.read(PROJECT_CONDENSED)).toBe(after);
    expect(result.hash).toBe((await vault.store.read(PROJECT_CONDENSED))?.hash);
    expect(result.undoToken).not.toBeNull();
    const allPaths = await vault.store.list({ includeInternal: true });
    expect(allPaths.some((path) => path.includes('trash'))).toBe(true);
    // The copy in the trash is the version the diff was built from, byte for byte.
    await vault.store.undo(result.undoToken ?? '');
    expect(await vault.read(PROJECT_CONDENSED)).toBe(before);
    expect(harness.events).toHaveBeenCalledWith('event:vault-changed', {
      paths: [PROJECT_CONDENSED],
      external: false,
    });
  });

  it('refuses a stale project hash: file byte-identical, no trash entry, no neighbour touched', async () => {
    const before = projectArtifact('Alt.');
    await vault.write(PROJECT_CONDENSED, before);

    await expect(
      harness.call('condense:accept', {
        proposal: projectProposal(projectArtifact('Neu.'), 'von-vorgestern'),
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(await vault.read(PROJECT_CONDENSED)).toBe(before);
    const allPaths = await vault.store.list({ includeInternal: true });
    expect(allPaths.some((path) => path.includes('trash'))).toBe(false);
    expect(await vault.exists(OTHER_PROJECT_CONDENSED)).toBe(false);
  });

  it('accept derives the project path from the slug, not from a tampered proposal.path', async () => {
    const before = projectArtifact('Alt.');
    await vault.write(PROJECT_CONDENSED, before);
    const hash = (await vault.store.read(PROJECT_CONDENSED))?.hash ?? '';
    const after = projectArtifact('Neu.');
    /* A path pointing at the *other* fixture project: the request names
       `kundenportal-relaunch`, so nothing may happen in `hochbeet-bauen`. */
    const tampered: CondenseProposal = {
      ...projectProposal(after, hash),
      path: OTHER_PROJECT_CONDENSED,
    };

    const result = await harness.call('condense:accept', { proposal: tampered });

    expect(result.path).toBe(PROJECT_CONDENSED);
    expect(await vault.read(PROJECT_CONDENSED)).toBe(after);
    expect(await vault.exists(OTHER_PROJECT_CONDENSED)).toBe(false);
  });

  it('a project rejection appends one directive line and touches no machine section', async () => {
    const before = projectArtifact('Auf dem Testsystem.');
    await vault.write(PROJECT_CONDENSED, before);

    const result = await harness.call('condense:reject', {
      unit: 'project',
      slug: PROJECT_SLUG,
      reason: 'Der nächste Schritt ist zu unkonkret.',
    });

    expect(result.path).toBe(PROJECT_CONDENSED);
    const raw = (await vault.read(PROJECT_CONDENSED)) ?? '';
    /* Everything up to the new directives section is the file as it was — the
       four machine sections and the frontmatter byte for byte, so the reason was
       spliced in rather than the body recomposed. */
    const [head, directives = ''] = raw.split('## Direktiven');
    expect(head).toBe(`${before.replace(/\s+$/, '')}\n\n`);
    expect(directives.trim()).toBe('Der nächste Schritt ist zu unkonkret.');
  });

  it('deletes a project artifact, offers a restorable undo token, and then reads null', async () => {
    const content = projectArtifact('Auf dem Testsystem.');
    await vault.write(PROJECT_CONDENSED, content);
    await harness.services.requireIndex().refresh?.();
    const hash = (await vault.store.read(PROJECT_CONDENSED))?.hash ?? '';

    const result = await harness.call('condense:delete', {
      unit: 'project',
      slug: PROJECT_SLUG,
      expectedHash: hash,
    });

    expect(result.path).toBe(PROJECT_CONDENSED);
    expect(result.undoToken.length).toBeGreaterThan(0);
    expect(await vault.exists(PROJECT_CONDENSED)).toBe(false);
    expect(await harness.call('condense:read', { unit: 'project', slug: PROJECT_SLUG })).toBeNull();

    await vault.store.undo(result.undoToken);

    expect(await vault.read(PROJECT_CONDENSED)).toBe(content);
  });

  it('refuses to delete a project artifact that does not exist', async () => {
    await expect(
      harness.call('condense:delete', {
        unit: 'project',
        slug: PROJECT_SLUG,
        expectedHash: 'irgendein-hash',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('reads, rejects and deletes a project artifact without a model and without a network', async () => {
    /* Nothing is routed in this test: only `condense:run` needs a model. A
       `fetch` that would answer is installed anyway, so a request escaping to
       the network shows up as a recorded call instead of as a green test. */
    const fake = createFetchFake(() => jsonResponse({}));
    vi.stubGlobal('fetch', fake.fetch);
    await vault.write(PROJECT_CONDENSED, projectArtifact('Auf dem Testsystem.'));

    const read = await harness.call('condense:read', { unit: 'project', slug: PROJECT_SLUG });
    expect(read?.path).toBe(PROJECT_CONDENSED);

    await harness.call('condense:reject', {
      unit: 'project',
      slug: PROJECT_SLUG,
      reason: 'Zu allgemein.',
    });
    const hash = (await vault.store.read(PROJECT_CONDENSED))?.hash ?? '';
    const deleted = await harness.call('condense:delete', {
      unit: 'project',
      slug: PROJECT_SLUG,
      expectedHash: hash,
    });

    expect(deleted.path).toBe(PROJECT_CONDENSED);
    expect(fake.calls).toHaveLength(0);
  });
});
