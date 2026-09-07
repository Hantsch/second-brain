/* `journal:close` as a run you walk away from (story 073, D4).
 *
 * D3 did the identical transformation for `condense:run`
 * (`tests/main/ipc/condense-task.test.ts`) — this file is its sibling for the
 * day close-out. The seam under test is not the close-out itself (`close.ts`,
 * `tests/main/journal-ipc.test.ts`'s "Tagesabschluss" block) but *when* the
 * answer arrives: the channel queues a task and answers with it, the
 * suggestion is stored under that task's id and fetched back through
 * `tasks:result`.
 *
 * The one thing that sets this apart from `condense:run`: a heuristic-only
 * close (no model routed for `extract-tasks`) still queues a task, off the
 * model lane — 071's decision that a heuristic close is a useful result, not
 * a dead end the way an unrouted condensation is (073, AC7 is about
 * condense, not about close-day).
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { TaskResult, WorkTask } from '@shared/types';
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

const DATE = '2026-08-11';
const DAY_PATH = 'journal/2026/08/2026-08-11.md';

const DAY_BODY = [
  '---',
  'type: journal',
  "title: 'Dienstag, 11. August 2026'",
  'date: 2026-08-11',
  'tags: []',
  '---',
  '',
  '## Tag',
  '',
  'Heute war Miriam beim Abnahmeprotokoll dabei.',
  'Ich muss morgen die Ladezeiten der Angebotsliste messen.',
  '',
].join('\n');

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../../src/main/secrets');
  const { createServices } = await import('../../../src/main/services');
  const { SettingsService } = await import('../../../src/main/settings');
  const { journalHandlers } = await import('../../../src/main/ipc/journal');
  const { tasksHandlers } = await import('../../../src/main/ipc/tasks');
  const { getWorkQueue, resetWorkQueue } = await import('../../../src/main/work-queue');
  const { getTaskResults, resetTaskResults } = await import('../../../src/main/task-results');

  /* Both are process-wide singletons — a fresh pair per test, or one test's
     queue and stored suggestions would answer for the next one. */
  resetWorkQueue();
  resetTaskResults();

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const queue = getWorkQueue(services);
  const results = getTaskResults();
  const handlers: Handlers = { ...journalHandlers(services), ...tasksHandlers(services) };
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

/** Routes `extract-tasks` at a fake provider whose one reply answers both of
    `closeDay`'s internal steps at once (`extractTasks`' schema and
    `dayFacts`' free-form JSON) — both gate on this same task name, so one
    route is enough to take the whole close off the heuristic path. */
async function routeExtractTasks(harness: Harness) {
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
    tasks: { 'extract-tasks': { providerId: 'local-1', model: 'qwen2.5:14b' } },
    defaults: {},
  });
  const fake = createFetchFake(() =>
    jsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              todos: [
                {
                  text: 'Ladezeiten der Angebotsliste messen',
                  due: '2026-08-12',
                  priority: 1,
                  project: null,
                },
              ],
              waitingOn: [],
              people: ['Miriam'],
              projects: [],
              areas: [],
              mood: null,
              energy: null,
              tags: [],
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

/** `tasks:result` narrowed to the one variant this file cares about. */
function closeSuggestionOf(result: TaskResult | null) {
  if (result === null || result.kind !== 'journal-close') return null;
  return result.suggestion;
}

describe('journal:close as a queued task (073, D4)', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    freezeTime();
    vault = await createTempVault({ sample: true });
    await vault.write(DAY_PATH, DAY_BODY);
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-journal-close-task-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('returns a WorkTask, not a suggestion, for a day with an entry and text', async () => {
    const task = await harness.call('journal:close', { date: DATE });

    expect(task).not.toBeNull();
    expect(task?.kind).toBe('close-day');
    expect(task?.subject).toEqual({ label: DATE, ref: DATE });
    expect(task?.id.length).toBeGreaterThan(0);
  });

  it('with a model routed for extract-tasks: the model lane, and tasks:result matches the model-backed suggestion', async () => {
    await routeExtractTasks(harness);

    const task = await harness.call('journal:close', { date: DATE });
    expect(task?.lane).toBe('model');

    const finished = await settled(harness, task?.id ?? '');
    expect(finished.state).toBe('done');
    expect(finished.hasResult).toBe(true);
    expect(finished.error).toBeNull();

    const suggestion = closeSuggestionOf(
      await harness.call('tasks:result', { id: task?.id ?? '' }),
    );
    expect(suggestion).not.toBeNull();
    expect(suggestion?.date).toBe(DATE);
    expect(suggestion?.path).toBe(DAY_PATH);
    /* Both internal steps answered from the model, so this run is not
       heuristic. */
    expect(suggestion?.heuristic).toBe(false);
    expect(suggestion?.frontmatter.people).toContain('Miriam');
    /* "morgen" is the day after the entry, not after today (close.ts). */
    const todo = suggestion?.proposal.todos.find((entry) => entry.text.includes('Ladezeiten'));
    expect(todo).toMatchObject({ due: '2026-08-12' });
  });

  it('without a routed model (071): the free lane, still a finished task with a heuristic suggestion', async () => {
    const task = await harness.call('journal:close', { date: DATE });
    expect(task?.lane).toBe('free');

    const finished = await settled(harness, task?.id ?? '');
    expect(finished.state).toBe('done');
    expect(finished.hasResult).toBe(true);

    const suggestion = closeSuggestionOf(
      await harness.call('tasks:result', { id: task?.id ?? '' }),
    );
    expect(suggestion).not.toBeNull();
    /* This is the 071 proof this suite exists for: unlike an unrouted
       `condense:run` (AC7, no task at all), a heuristic close still runs to
       completion and leaves a usable result behind. */
    expect(suggestion?.heuristic).toBe(true);
    const todo = suggestion?.proposal.todos.find((entry) => entry.text.includes('Ladezeiten'));
    expect(todo).toMatchObject({ due: '2026-08-12' });
  });

  it('answers null and queues nothing for a day with no entry', async () => {
    const missing = '2026-08-09';

    const task = await harness.call('journal:close', { date: missing });

    expect(task).toBeNull();
    expect(harness.queue.list().filter((entry) => entry.kind === 'close-day')).toEqual([]);
  });

  it('answers null and queues nothing for a day whose entry has no text', async () => {
    const empty = '2026-08-07';
    await vault.write(
      `journal/2026/08/${empty}.md`,
      [
        '---',
        'type: journal',
        "title: 'leer'",
        `date: ${empty}`,
        'tags: []',
        '---',
        '',
        '## Tag',
        '',
        '## Fakten',
        '',
      ].join('\n'),
    );

    const task = await harness.call('journal:close', { date: empty });

    expect(task).toBeNull();
    expect(harness.queue.list().filter((entry) => entry.kind === 'close-day')).toEqual([]);
  });

  it('the close task writes nothing before applyClose', async () => {
    const before = (await vault.read(DAY_PATH)) ?? '';

    const task = await harness.call('journal:close', { date: DATE });
    const finished = await settled(harness, task?.id ?? '');
    expect(finished.hasResult).toBe(true);

    /* Guardrail 2: the run proposes, the file appears only on `applyClose`. */
    expect(await vault.read(DAY_PATH)).toBe(before);

    const suggestion = closeSuggestionOf(
      await harness.call('tasks:result', { id: task?.id ?? '' }),
    );
    expect(suggestion).not.toBeNull();
    if (suggestion === null) throw new Error('kein Vorschlag');

    const applied = await harness.call('journal:applyClose', {
      date: DATE,
      todos: suggestion.proposal.todos,
      frontmatter: suggestion.frontmatter,
    });

    expect(applied.written).toContain(DAY_PATH);
    expect(await vault.read(DAY_PATH)).not.toBe(before);
    /* The decision is recorded against the task that proposed it, and the
       payload is let go with it — nothing left to decide about a suggestion
       already accepted. */
    expect(harness.results.status(task?.id ?? '')).toBe('accepted');
    expect(await harness.call('tasks:result', { id: task?.id ?? '' })).toBeNull();
  });

  it('a conflicted applyClose leaves the stored suggestion retrievable — nothing was marked (073 review finding 3)', async () => {
    await routeExtractTasks(harness);
    const task = await harness.call('journal:close', { date: DATE });
    const finished = await settled(harness, task?.id ?? '');
    expect(finished.hasResult).toBe(true);

    const suggestion = closeSuggestionOf(
      await harness.call('tasks:result', { id: task?.id ?? '' }),
    );
    if (suggestion === null) throw new Error('kein Vorschlag');

    /* A stale `expectedHash` makes `applyClose`'s own guarded write refuse
       with `conflict` before anything lands. Before the fix, the stored
       suggestion was marked `accepted` — and dropped — BEFORE this write was
       even attempted, so a refused apply would already have lost the run
       the user would otherwise have retried. */
    await expect(
      harness.call('journal:applyClose', {
        date: DATE,
        todos: suggestion.proposal.todos,
        frontmatter: suggestion.frontmatter,
        expectedHash: 'von-vorgestern',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(harness.results.status(task?.id ?? '')).toBeNull();
    const stillThere = closeSuggestionOf(
      await harness.call('tasks:result', { id: task?.id ?? '' }),
    );
    expect(stillThere).not.toBeNull();
  });

  it('applyClose marking is a safe no-op when nothing was ever queued for that date', async () => {
    /* A caller (a test, or a vault seeded directly) invoking `applyClose`
       without going through `journal:close` first — nothing is stored for
       this date, so the best-effort mark must not refuse the write. */
    await expect(
      harness.call('journal:applyClose', {
        date: DATE,
        todos: [],
        frontmatter: { people: [], projects: [], areas: [], mood: null, energy: null, tags: [] },
      }),
    ).resolves.toMatchObject({ written: [DAY_PATH] });
    expect(harness.results.status('irrelevant-id')).toBeNull();
  });

  it('requires an open vault', async () => {
    await harness.services.closeVault();

    await expect(harness.call('journal:close', { date: DATE })).rejects.toMatchObject({
      code: 'no-vault',
    });
  });
});
