/* `condense:run` as a run you walk away from (story 073, D3).
 *
 * The seam this file is about is not the condensation itself — `044`/`045` and
 * `tests/main/condense-ipc.test.ts` already pin down what a run produces and
 * where it writes. What is new here is *when* the answer arrives: the channel
 * queues a task and answers with it, the proposal is stored under that task's
 * id and fetched back through `tasks:result`, and the decision the user then
 * makes marks that stored result.
 *
 * The two prüfsteine of the deliverable:
 *
 * - With a model routed, a run is a task — done, `hasResult: true`, and the
 *   proposal `condense:run` used to answer with directly is what
 *   `tasks:result` hands back.
 * - Without one, nothing is queued at all (AC7). The dead end has to stay the
 *   dead end it was, not become a task that could only ever fail.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { WorkTask } from '@shared/types';
import { CLAUDE_PROJECTS_DIR } from '../../fixtures';
import { createFetchFake, jsonResponse } from '../../fakes/llm';
import { createTempVault } from '../../helpers/vault';
import type { TempVault } from '../../helpers/vault';
import { freezeTime } from '../../helpers/time';

/* No Electron in tests: no windows, no encryption. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const AREA_SLUG = 'gesundheit';
const AREA_PATH = 'areas/gesundheit.md';
const CONDENSED_PATH = 'areas/gesundheit.condensed.md';

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../../src/main/secrets');
  const { createServices } = await import('../../../src/main/services');
  const { SettingsService } = await import('../../../src/main/settings');
  const { condenseHandlers } = await import('../../../src/main/ipc/condense');
  const { tasksHandlers } = await import('../../../src/main/ipc/tasks');
  const { getWorkQueue, resetWorkQueue } = await import('../../../src/main/work-queue');
  const { getTaskResults, resetTaskResults } = await import('../../../src/main/task-results');

  /* Both are process-wide singletons — a fresh pair per test, or one test's
     queue and stored proposals would answer for the next one. */
  resetWorkQueue();
  resetTaskResults();

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const queue = getWorkQueue(services);
  const results = getTaskResults();
  const handlers: Handlers = { ...condenseHandlers(services), ...tasksHandlers(services) };
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, call, queue, results };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

/** Routes `condense-area` at a fake provider that answers with the three
    machine sections an area artifact needs — every one citing the area file
    the run always reads, so attribution passes without the test predicting
    which journal days came along. Mirrors `condense-ipc.test.ts`'s helper. */
async function routeArea(harness: Harness) {
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
    jsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              state: { text: 'Rücken und Schlaf im Blick.', sources: [AREA_PATH] },
              patterns: {
                text: 'Kurze Pausen wirken mehr als langes Liegen.',
                sources: [AREA_PATH],
              },
              open: { text: 'Themen bleiben aktuell.', sources: [AREA_PATH] },
            }),
          },
        },
      ],
    }),
  );
  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

/** Waits until the queue reports this task terminal, and answers with it. */
async function settled(harness: Harness, id: string): Promise<WorkTask> {
  return vi.waitFor(() => {
    const task = harness.queue.list().find((entry) => entry.id === id);
    if (task === undefined || task.state === 'queued' || task.state === 'running') {
      throw new Error(`Task ${id} läuft noch`);
    }
    return task;
  });
}

describe('condense:run as a queued task (073, D3)', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    freezeTime();
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-condense-task-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
    /* Points the session reader at the fixture sessions instead of the real
       `~/.claude` of whoever runs the suite — same reason as in
       `condense-ipc.test.ts`. */
    await harness.services.settings.patchVault({
      overview: { claudeProjectsDir: CLAUDE_PROJECTS_DIR },
    });
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('answers with the queued task, not with the proposal', async () => {
    await routeArea(harness);

    const task = await harness.call('condense:run', { unit: 'area', slug: AREA_SLUG });

    expect(task.kind).toBe('condense');
    expect(task.lane).toBe('model');
    /* The label is the unit's own name — the tasks screen renders the kind
       itself, so nothing here repeats it. */
    expect(task.subject).toEqual({ label: AREA_SLUG, ref: `area:${AREA_SLUG}` });
    expect(task.id.length).toBeGreaterThan(0);
  });

  it('finishes the task with hasResult, and tasks:result hands back the proposal', async () => {
    await routeArea(harness);

    const queued = await harness.call('condense:run', { unit: 'area', slug: AREA_SLUG });
    const finished = await settled(harness, queued.id);

    expect(finished.state).toBe('done');
    expect(finished.hasResult).toBe(true);
    expect(finished.error).toBeNull();

    const result = await harness.call('tasks:result', { id: queued.id });

    expect(result?.kind).toBe('condense');
    const proposal = result?.kind === 'condense' ? result.proposal : null;
    /* The very shape the synchronous channel used to answer with (038, D4). */
    expect(proposal?.unit).toBe('area');
    expect(proposal?.slug).toBe(AREA_SLUG);
    expect(proposal?.path).toBe(CONDENSED_PATH);
    expect(proposal?.baseHash).toBeNull();
    expect(proposal?.before).toBe('');
    expect(proposal?.after).toContain('type: condensed');
    expect(proposal?.after).toContain('Rücken und Schlaf im Blick.');
    expect(proposal?.sources).toContain(AREA_PATH);
    /* Guardrail 2: the run proposes, the file appears only on accept. */
    expect(await vault.exists(CONDENSED_PATH)).toBe(false);
  });

  it('answers null for a task id nothing was ever stored under', async () => {
    expect(await harness.call('tasks:result', { id: 'gibt-es-nicht' })).toBeNull();
  });

  it('without a routed model: the same dead end as before, and no task at all', async () => {
    /* A `fetch` that would answer is installed anyway, so a request escaping
       to the network shows up as a recorded call rather than as a green test. */
    const fake = createFetchFake(() => jsonResponse({}));
    vi.stubGlobal('fetch', fake.fetch);

    await expect(
      harness.call('condense:run', { unit: 'area', slug: AREA_SLUG }),
    ).rejects.toMatchObject({
      code: 'llm-unavailable',
      detail: { task: 'condense-area' },
    });

    /* AC7: nothing was queued — not a failed task, not a cancelled one. */
    expect(harness.queue.list()).toEqual([]);
    expect(fake.calls).toHaveLength(0);
    expect(await vault.exists(CONDENSED_PATH)).toBe(false);
  });

  it('accept marks the stored result and still writes and answers as before', async () => {
    await routeArea(harness);
    const queued = await harness.call('condense:run', { unit: 'area', slug: AREA_SLUG });
    await settled(harness, queued.id);
    const result = await harness.call('tasks:result', { id: queued.id });
    const proposal = result?.kind === 'condense' ? result.proposal : null;
    if (proposal === null) throw new Error('kein Verdichtungsvorschlag');

    const accepted = await harness.call('condense:accept', { proposal });

    /* Unchanged from before the queue existed: the file is written and the
       three-field answer is the same. */
    expect(accepted.path).toBe(CONDENSED_PATH);
    expect(await vault.read(CONDENSED_PATH)).toBe(proposal.after);
    expect(accepted.hash).toBe((await vault.store.read(CONDENSED_PATH))?.hash);
    expect(accepted.undoToken).toBeNull();

    /* The decision is recorded, and the payload is let go with it — there is
       nothing left to decide about a proposal already accepted. */
    expect(harness.results.status(queued.id)).toBe('accepted');
    expect(await harness.call('tasks:result', { id: queued.id })).toBeNull();
  });

  it('a conflicted accept leaves the stored proposal retrievable — nothing was marked (073 review finding 3)', async () => {
    await routeArea(harness);
    const queued = await harness.call('condense:run', { unit: 'area', slug: AREA_SLUG });
    await settled(harness, queued.id);
    const result = await harness.call('tasks:result', { id: queued.id });
    const proposal = result?.kind === 'condense' ? result.proposal : null;
    if (proposal === null) throw new Error('kein Verdichtungsvorschlag');
    expect(proposal.baseHash).toBeNull();

    /* The proposal was built as if nothing existed yet — but a file has since
       appeared, so `condense:accept`'s own pre-check refuses with `conflict`
       BEFORE ever writing. Before the fix, the mark happened before that
       pre-check too, so a refused accept would still have dropped the stored
       proposal even though nothing was written. */
    await vault.write(CONDENSED_PATH, 'von einem zweiten Lauf');

    await expect(harness.call('condense:accept', { proposal })).rejects.toMatchObject({
      code: 'conflict',
    });

    expect(harness.results.status(queued.id)).toBeNull();
    const stillThere = await harness.call('tasks:result', { id: queued.id });
    expect(stillThere?.kind).toBe('condense');
  });

  it('reject marks the stored result the other way, and still appends its directive', async () => {
    await routeArea(harness);
    const queued = await harness.call('condense:run', { unit: 'area', slug: AREA_SLUG });
    await settled(harness, queued.id);

    const rejected = await harness.call('condense:reject', {
      unit: 'area',
      slug: AREA_SLUG,
      reason: 'Der Ton trifft es nicht.',
    });

    expect(rejected.path).toBe(CONDENSED_PATH);
    expect((await vault.read(CONDENSED_PATH)) ?? '').toContain('Der Ton trifft es nicht.');
    expect(harness.results.status(queued.id)).toBe('rejected');
    expect(await harness.call('tasks:result', { id: queued.id })).toBeNull();
  });

  it('a blank rejection changes nothing — not the file, not the stored result', async () => {
    await routeArea(harness);
    const queued = await harness.call('condense:run', { unit: 'area', slug: AREA_SLUG });
    await settled(harness, queued.id);

    await expect(
      harness.call('condense:reject', { unit: 'area', slug: AREA_SLUG, reason: '   ' }),
    ).rejects.toMatchObject({ code: 'invalid' });

    expect(await vault.exists(CONDENSED_PATH)).toBe(false);
    expect(harness.results.status(queued.id)).toBeNull();
    expect(await harness.call('tasks:result', { id: queued.id })).not.toBeNull();
  });

  it("a retried run stores its proposal under the RETRIED task's own id, not the failed one's (073 review finding 1)", async () => {
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
    /* Every fetch fails — a non-retryable HTTP 400 — until `succeedNow` flips,
       right before the retry: the provider's own native-schema/prompt-fallback
       path (`openai-compatible.ts`) can make more than one HTTP call per run,
       so gating on a flag rather than a fixed call index is what reliably
       fails the FIRST run outright and lets only the RETRIED run's calls
       succeed. Before the fix, the runner's closure read the task id from a
       `let` captured once after the FIRST `enqueue()`, so the retried run's
       proposal would land under `first.id` instead of its own. */
    let succeedNow = false;
    const fake = createFetchFake(() =>
      succeedNow
        ? jsonResponse({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    state: { text: 'Rücken und Schlaf im Blick.', sources: [AREA_PATH] },
                    patterns: {
                      text: 'Kurze Pausen wirken mehr als langes Liegen.',
                      sources: [AREA_PATH],
                    },
                    open: { text: 'Themen bleiben aktuell.', sources: [AREA_PATH] },
                  }),
                },
              },
            ],
          })
        : jsonResponse({ error: 'bad request' }, 400),
    );
    vi.stubGlobal('fetch', fake.fetch);

    const first = await harness.call('condense:run', { unit: 'area', slug: AREA_SLUG });
    const failed = await settled(harness, first.id);
    expect(failed.state).toBe('failed');

    succeedNow = true;
    const retried = harness.queue.retry(first.id);
    expect(retried).not.toBeNull();
    if (retried === null) throw new Error('unreachable');
    expect(retried.id).not.toBe(first.id);

    const finished = await settled(harness, retried.id);
    expect(finished.state).toBe('done');
    expect(finished.hasResult).toBe(true);

    /* The proposal is retrievable under the RETRIED task's id ... */
    const resultForRetried = await harness.call('tasks:result', { id: retried.id });
    expect(resultForRetried?.kind).toBe('condense');
    /* ... and never under the failed one's — nothing was ever stored there. */
    expect(await harness.call('tasks:result', { id: first.id })).toBeNull();
  });

  it('accepting a proposal no task ever produced is a no-op, not a failure', async () => {
    /* The path a test — or a renderer holding a proposal from an earlier
       session — takes: nothing is stored for this subject, so the mark finds
       nothing and the accept goes through unchanged. */
    const after = '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nNeu.\n';

    const accepted = await harness.call('condense:accept', {
      proposal: {
        unit: 'area',
        slug: AREA_SLUG,
        path: CONDENSED_PATH,
        baseHash: null,
        before: '',
        after,
        sources: [AREA_PATH],
      },
    });

    expect(accepted.path).toBe(CONDENSED_PATH);
    expect(await vault.read(CONDENSED_PATH)).toBe(after);
  });
});
