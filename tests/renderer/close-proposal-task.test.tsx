// @vitest-environment jsdom
/* The journal's day close against the shared work queue (story 073, D6).
 *
 * Mirrors `condensed-unit-panel-task.test.tsx` for the close-day path: before
 * D6 the close-out lived in the screen's own mutation (an internal await
 * inside `mutations.close`, D4's stopgap) — a run that outlived the component
 * (navigating away mid-run) was lost, and the screen had to ask the model a
 * second time. Since D6 the screen reads a close-day task's whole run state —
 * running, queued-with-a-position, failed-with-a-reason, done-with-a-result —
 * off the session-lived work queue via `useTaskForSubject`, exactly the way
 * `CondensedUnitPanel` reads a condensation.
 *
 * Every test below seeds the queue as if a run had already happened (or is
 * already going) *before* this render ever asked for it — `work:list`
 * answers with a task the screen never triggered — and then asserts what the
 * screen makes of it. `journal:close` is deliberately absent from several
 * fixtures below, so a screen that still triggered its own run for any of
 * this would fail with "no handler", never quietly agree by coincidence. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse, JournalDayView } from '@shared/ipc';
import type {
  JournalCloseSuggestion,
  JournalDay,
  Project,
  ProviderConfig,
  Routing,
  SettingsSnapshot,
  VaultDoc,
  WorkTask,
} from '@shared/types';
import { JournalScreen } from '@renderer/screens/journal/JournalScreen';
import type { SbBridge } from '@renderer/lib/bridge';
import { clear as clearProposal } from '@renderer/lib/close-proposal';
import { setLanguage } from '@renderer/i18n';
import { getWorkTasks, resetWorkTasksStoreForTests, setWorkTasks } from '@renderer/lib/tasks-store';

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

interface Mock {
  calls: { channel: IpcChannel; payload: unknown }[];
}

/* Own mock rather than the shared one from `tests/setup.ts` — same reason
   `journal.test.tsx` and `condensed-unit-panel-task.test.tsx` give for their
   own copies. */
function installMock(handlers: Handlers): Mock {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) throw Object.assign(new Error(`no handler for ${channel}`), { code: 'invalid' });
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return { calls };
}

const NOW = new Date('2026-08-10T18:40:00+02:00');
const TODAY = '2026-08-10';
const DAY_PATH = 'journal/2026/08/2026-08-10.md';
const DAY_TEXT = 'Morning on the test system, prepared the acceptance protocol in the afternoon.';

const project: Project = {
  path: 'projects/work/portal-relaunch/project.md',
  slug: 'portal-relaunch',
  title: 'Portal Relaunch',
  scope: 'work',
  status: 'active',
  priority: 1,
  favorite: false,
  deadline: null,
  nextStep: 'Go through the acceptance protocol',
  nextStepStale: false,
  waitingOn: [],
  tags: [],
  modules: [],
  repos: [],
  lastTouch: NOW.toISOString(),
  lastTouchSource: 'file',
  ageDays: 0,
  stale: false,
  todoCount: 2,
  openTodoCount: 1,
  excerpt: 'The new offer list sits on the test system.',
};

function day(patch: Partial<JournalDay> = {}): JournalDay {
  return {
    path: DAY_PATH,
    date: TODAY,
    title: 'Monday, August 10, 2026',
    closed: null,
    mood: 3,
    energy: 2,
    people: [],
    projects: [project.slug],
    tags: [],
    areas: [],
    excerpt: DAY_TEXT,
    wordCount: 42,
    turns: 0,
    ...patch,
  };
}

function doc(patch: Partial<VaultDoc> = {}): VaultDoc {
  return {
    path: DAY_PATH,
    frontmatter: { type: 'journal', title: 'Monday, August 10, 2026', created: NOW.toISOString() },
    body: `## Day\n\n${DAY_TEXT}\n`,
    hash: 'hash-1',
    modified: NOW.toISOString(),
    size: 400,
    ...patch,
  };
}

function view(patch: Partial<JournalDayView> = {}): JournalDayView {
  return {
    day: day(),
    doc: doc(),
    text: DAY_TEXT,
    stream: [{ kind: 'entry', text: DAY_TEXT, at: null }],
    turns: [],
    facts: '',
    looseEnds: [],
    ...patch,
  };
}

const suggestion: JournalCloseSuggestion = {
  date: TODAY,
  path: DAY_PATH,
  proposal: {
    dumpPath: DAY_PATH,
    title: 'Monday, August 10, 2026',
    scope: 'work',
    tags: [],
    primary: { target: 'journal', path: DAY_PATH, section: 'Facts', content: '' },
    extras: [],
    alternatives: [],
    confidence: 1,
    reason: 'Recognised without a model: 1 todo.',
    todos: [
      {
        text: 'Measure the offer list load time',
        scope: 'work',
        due: null,
        waitingFor: null,
        priority: 0,
        project: project.slug,
      },
    ],
    waitingOn: [],
    entities: [],
    heuristic: true,
    createdAt: NOW.toISOString(),
  },
  frontmatter: { people: [], projects: [project.slug], areas: [], mood: 2, energy: null, tags: [] },
  heuristic: true,
};

const RERUN_SUGGESTION: JournalCloseSuggestion = {
  ...suggestion,
  proposal: {
    ...suggestion.proposal,
    reason: 'Second run: only one thing left open.',
    todos: [
      {
        text: 'Only this one thing',
        scope: 'work',
        due: null,
        waitingFor: null,
        priority: 0,
        project: null,
      },
    ],
  },
};

/** The `subject.ref` `journal:close` enqueues with — the date itself
    (`src/main/ipc/journal.ts`: `const ref = date;`). Written out here rather
    than derived, so a change to that on the main side shows up as a failing
    test, not as a screen that silently finds nothing. */
const REF = TODAY;

function baseTask(overrides: Partial<WorkTask> = {}): WorkTask {
  return {
    id: 'close-task-1',
    kind: 'close-day',
    lane: 'free',
    subject: { label: TODAY, ref: REF },
    state: 'running',
    progress: 0.5,
    message: null,
    error: null,
    queuePosition: null,
    queuedAt: '2026-08-10T09:00:00.000Z',
    startedAt: '2026-08-10T09:00:01.000Z',
    finishedAt: null,
    hasResult: false,
    retryable: true,
    ...overrides,
    detail: overrides.detail ?? null,
  };
}

const LOCAL_PROVIDER: ProviderConfig = {
  id: 'local-1',
  label: 'Ollama',
  kind: 'openai-compatible',
  baseUrl: 'http://localhost:11434/v1',
  hasKey: false,
  local: true,
  enabled: true,
  models: ['qwen2.5:14b'],
  createdAt: NOW.toISOString(),
};

function routing(providerId: string): Routing {
  return { tasks: { 'journal-chat': { providerId, model: 'qwen2.5:14b' } }, defaults: {} };
}

const settings: SettingsSnapshot = {
  app: {
    version: 1,
    lastVault: 'C:/vaults/demo',
    recentVaults: [],
    theme: 'dark',
    customization: { background: 'none', appIcon: 'knowledge-garden' },
    uiLanguage: 'en',
    newVaultLanguages: { documents: 'en', conversation: 'en', translateSources: true },
    window: { width: 1440, height: 900 },
    startMinimized: false,
    closeToTray: true,
    onboarded: true,
    machine: {
      vramOverrideMb: null,
      resourceBudgetPercent: 80,
      llamaAutoStart: 'manual',
      llamaOverrides: { gpuLayers: null, contextTokens: null },
    },
  },
  vault: {
    version: 1,
    languages: { ui: 'en', documents: 'en', conversation: 'en', translateSources: false },
    capture: {
      quickCaptureShortcut: 'Ctrl+Shift+Space',
      autoClassify: false,
      closeAfterCapture: true,
    },
    overview: {
      staleAfterDays: 14,
      deadlineHorizonDays: 14,
      waitingNudgeDays: 5,
      useClaudeSessions: false,
      claudeProjectsDir: '',
      useCodexSessions: false,
      codexSessionsDir: '',
      notifications: false,
      dismissedAgentProjects: [],
      showEmptySessionsTab: false,
    },
    journal: { mode: 'listen' },
    gardener: { runOnOpen: false, reviewAfterDays: 120, useLlm: false },
    providers: [LOCAL_PROVIDER],
    routing: routing(LOCAL_PROVIDER.id),
    dashboard: { tiles: [], updated: NOW.toISOString() },
    preferredTags: [],
  },
};

/** Renders the full journal screen with a queue that already holds `tasks` —
    the state a screen mounting after a run was started (or finished)
    elsewhere has to read. `journal:close` is present only when `extra` adds
    it, so a test whose queue is meant to be read-only, never triggered,
    fails loudly instead of silently if the screen ever calls it anyway.
    Accepts an existing `client` (returned by a previous call) so a test can
    simulate the screen remounting within the SAME app session — the same
    `QueryClient` a real navigate-away-and-back keeps — rather than a full
    reload, which would start from an empty cache regardless of what this
    story fixes. */
function renderJournal(
  tasks: WorkTask[],
  extra: Handlers = {},
  client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
): Mock & { client: QueryClient; unmount: () => void } {
  const sb = installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 3,
      indexedAt: NOW.toISOString(),
      indexing: false,
    }),
    'settings:get': () => settings,
    'journal:list': () => [day()],
    'journal:get': () => view(),
    'projects:list': () => [project],
    'areas:list': () => [],
    'llm:routing': () => routing(LOCAL_PROVIDER.id),
    'llm:tasks': () => [],
    'llm:providers': () => [LOCAL_PROVIDER],
    'work:list': () => tasks,
    ...extra,
  });
  const rendered = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <JournalScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...sb, client, unmount: rendered.unmount };
}

beforeEach(() => {
  setLanguage('en');
  document.documentElement.lang = 'en';
  resetWorkTasksStoreForTests();
  clearProposal(TODAY);
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  /* jsdom doesn't know `scrollIntoView` — without a stub `ErrorState` dies
     reaching for it (same stub `journal.test.tsx`/`condense-area.test.tsx`
     carry). */
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
  vi.useRealTimers();
  clearProposal(TODAY);
  delete window.sb;
});

describe("the journal's day close reads its run from the work queue (073, D6)", () => {
  it('seeds `emptySuggestion` immediately when there is nothing to close (regression check)', async () => {
    const sb = renderJournal([], { 'journal:close': () => null });

    await userEvent.click(await screen.findByRole('button', { name: 'Close the day' }));

    expect(
      await screen.findByText('There is nothing in the text of the day to pull out yet.'),
    ).toBeTruthy();
    /* Never went through the task queue at all — `journal:close` answered
       `null` directly, no task was ever enqueued for this day. */
    expect(sb.calls.some((entry) => entry.channel === 'journal:close')).toBe(true);
    expect(sb.calls.some((entry) => entry.channel === 'tasks:result')).toBe(false);
  });

  it('shows a running task as running on mount, not a blank trigger', async () => {
    const sb = renderJournal([baseTask()]);

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Close the day' }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    /* Nothing here started that run — the screen only reads it. */
    expect(sb.calls.some((entry) => entry.channel === 'journal:close')).toBe(false);
  });

  it('shows a queued task with its queue position, not as running', async () => {
    renderJournal([baseTask({ state: 'queued', progress: 0, startedAt: null, queuePosition: 3 })]);

    expect(await screen.findByText('Waiting for the model — queue position 3')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Close the day' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('seeds the proposal from a task that finished before the screen ever mounted (AC3)', async () => {
    const sb = renderJournal(
      [
        baseTask({
          state: 'done',
          progress: 1,
          finishedAt: '2026-08-10T09:00:09.000Z',
          hasResult: true,
        }),
      ],
      { 'tasks:result': () => ({ kind: 'journal-close', suggestion }) },
    );

    expect(await screen.findByText(suggestion.proposal.reason)).toBeTruthy();
    expect(
      within(
        (await screen.findByText(suggestion.proposal.reason)).closest(
          '.sb-close-proposal',
        ) as HTMLElement,
      ).getByLabelText('Measure the offer list load time'),
    ).toBeTruthy();
    /* Read, not triggered — the screen never called journal:close itself. */
    expect(sb.calls.some((entry) => entry.channel === 'journal:close')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Close the day' })).toBeNull();
  });

  it('shows a failed task next to the trigger, not a stuck running state', async () => {
    renderJournal([
      baseTask({
        state: 'failed',
        progress: 0,
        finishedAt: '2026-08-10T09:00:09.000Z',
        error: 'unknown',
        message: 'The model did not answer.',
      }),
    ]);

    expect(await screen.findByText('Reason: The model did not answer.')).toBeTruthy();
    /* Not stuck claiming to run, and the trigger is back for a retry. */
    const button = screen.getByRole('button', { name: 'Close the day' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('running again re-seeds with the new suggestion once the second task finishes', async () => {
    const RERUN_TASK_ID = 'close-task-2';
    const sb = renderJournal(
      [
        baseTask({
          state: 'done',
          progress: 1,
          finishedAt: '2026-08-10T09:00:09.000Z',
          hasResult: true,
        }),
      ],
      {
        /* Puts its own task on the live queue the moment it runs — the same
           reason `closesTo` in `journal.test.tsx` does: `useTaskForSubject`
           reads the queue store, not the mocked IPC response directly, so the
           new task only becomes visible once it actually lands there, exactly
           as the main process's `event:work-tasks` would. */
        'journal:close': () => {
          const task = baseTask({
            id: RERUN_TASK_ID,
            state: 'done',
            progress: 1,
            finishedAt: '2026-08-10T09:05:00.000Z',
            hasResult: true,
          });
          setWorkTasks([...getWorkTasks(), task]);
          return task;
        },
        'tasks:result': (request) => {
          const { id } = request as unknown as { id: string };
          return {
            kind: 'journal-close',
            suggestion: id === RERUN_TASK_ID ? RERUN_SUGGESTION : suggestion,
          };
        },
      },
    );

    /* The first task's result is already showing, unprompted (AC3). */
    const panelBefore = (await screen.findByText(suggestion.proposal.reason)).closest(
      '.sb-close-proposal',
    ) as HTMLElement;
    expect(panelBefore).toBeTruthy();

    await userEvent.click(within(panelBefore).getByRole('button', { name: 'Run again' }));

    const panelAfter = (await screen.findByText(RERUN_SUGGESTION.proposal.reason)).closest(
      '.sb-close-proposal',
    ) as HTMLElement;
    expect(within(panelAfter).getByLabelText('Only this one thing')).toBeTruthy();
    /* The stale first result is actually gone, not just supplemented. */
    expect(screen.queryByText(suggestion.proposal.reason)).toBeNull();
    expect(screen.queryByLabelText('Measure the offer list load time')).toBeNull();
    expect(sb.calls.filter((entry) => entry.channel === 'journal:close').length).toBe(1);
  });
});

describe('a discarded or applied close proposal never resurfaces (073 review finding 2)', () => {
  /* `tasks:result` here plays main's own part: once the decision channel it
     is paired with fires, it honestly answers `null`, mirroring what
     `TaskResultStore.markBySubject` really does (proven separately in
     `tests/main/ipc/journal-close-task.test.ts`). What these two tests pin
     down is the screen's OWN half — that discarding/applying actually calls
     the right channel, and that a remount doesn't hand the same suggestion
     back out in the meantime, the same way `CondensedUnitPanel`'s
     `forgetResult` already keeps a condensation's decided proposal from
     resurfacing. */
  const doneTask = baseTask({
    state: 'done',
    progress: 1,
    finishedAt: '2026-08-10T09:00:09.000Z',
    hasResult: true,
  });

  it('discarding tells main, and a remount within the same session does not bring the proposal back', async () => {
    let discarded = false;
    const handlers: Handlers = {
      'tasks:result': () => (discarded ? null : { kind: 'journal-close', suggestion }),
      'journal:discardClose': () => {
        discarded = true;
      },
    };

    const first = renderJournal([doneTask], handlers);
    const panel = (await screen.findByText(suggestion.proposal.reason)).closest(
      '.sb-close-proposal',
    ) as HTMLElement;

    await userEvent.click(within(panel).getByRole('button', { name: 'Discard' }));

    // Main is told about the discard — not only the renderer's own buffer.
    expect(
      first.calls.some(
        (entry) =>
          entry.channel === 'journal:discardClose' &&
          (entry.payload as { date: string }).date === TODAY,
      ),
    ).toBe(true);
    expect(screen.queryByText(suggestion.proposal.reason)).toBeNull();

    first.unmount();

    /* A remount within the SAME session, on the SAME query client — the one
       thing `forgetCloseResult` (mirroring `CondensedUnitPanel`'s
       `forgetResult`) protects against: a stale, pre-discard cache entry
       re-seeding the proposal before a fresh fetch would have caught up.
       `tasks:result` here also answers honestly post-discard (`discarded` is
       still `true`), so either way nothing brings the suggestion back. */
    renderJournal([doneTask], handlers, first.client);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Close the day' })).toBeTruthy());
    expect(screen.queryByText(suggestion.proposal.reason)).toBeNull();
    expect(screen.queryByLabelText('Measure the offer list load time')).toBeNull();
  });

  it('applying, then remounting within the same session, never re-offers the same suggestion to apply a second time', async () => {
    let applied = false;
    const handlers: Handlers = {
      'tasks:result': () => (applied ? null : { kind: 'journal-close', suggestion }),
      'journal:applyClose': () => {
        applied = true;
        return { written: [DAY_PATH], undo: [] };
      },
    };

    const first = renderJournal([doneTask], handlers);
    const panel = (await screen.findByText(suggestion.proposal.reason)).closest(
      '.sb-close-proposal',
    ) as HTMLElement;

    await userEvent.click(within(panel).getByRole('button', { name: 'Apply and close' }));

    await waitFor(() =>
      expect(first.calls.some((entry) => entry.channel === 'journal:applyClose')).toBe(true),
    );
    expect(screen.queryByText(suggestion.proposal.reason)).toBeNull();

    first.unmount();

    /* Same remount, same client. Main already marked this `accepted` on
       `journal:applyClose`'s own success — the bug this guards against is
       the renderer's OWN cache still serving the pre-mark suggestion from
       here, which would let the same todos be filed a second time. */
    renderJournal([doneTask], handlers, first.client);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Close the day' })).toBeTruthy());
    expect(screen.queryByText(suggestion.proposal.reason)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply and close' })).toBeNull();
  });
});
