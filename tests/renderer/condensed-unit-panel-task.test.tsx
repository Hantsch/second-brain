// @vitest-environment jsdom
/* `CondensedUnitPanel` against the shared work queue (story 073, D5).
 *
 * The panel used to hold a run in its own state — the mutation's `isPending`
 * and a `useState` for the proposal. Both die with the component, so leaving
 * the panel mid-run and coming back showed nothing and asked for a second run.
 * Since D5 every run-related state is derived from the session-lived queue
 * (`tasks-store.ts` → `useTaskForSubject`), and this file is what proves it:
 *
 * every test below seeds the queue as if the run had been started somewhere
 * else — `work:list` answers with a task the panel never triggered — and then
 * asserts what the panel makes of it. `condense:run` is deliberately absent
 * from the handler set in three of the four tests, so a panel that still went
 * through its own mutation for any of this would fail with "no handler",
 * never quietly agree by coincidence.
 *
 * `condense-area.test.tsx` covers the run *the panel itself* starts; this file
 * covers the four states it must be able to read off the queue on mount:
 * running, waiting-with-a-position, failed-with-a-reason, done-with-a-result.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { CondenseProposal, WorkTask } from '@shared/types';
import { AreaCondensedTab } from '@renderer/screens/notes/AreaCondensedTab';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';
import { resetWorkTasksStoreForTests } from '@renderer/lib/tasks-store';

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

interface Mock {
  calls: { channel: IpcChannel; payload: unknown }[];
}

/* Own mock rather than the shared one from `tests/setup.ts` — same reason
   `condense-area.test.tsx` gives for its own copy. */
function installMock(handlers: Handlers): Mock {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler)
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return { calls };
}

const AREA = { slug: 'gesundheit', title: 'Gesundheit' };

/** The `subject.ref` `condense:run` enqueues with — `<unit>:<slug>`. Written
    out here rather than derived, so a change to that format on the main side
    shows up as a failing test and not as a panel that silently finds nothing. */
const REF = 'area:gesundheit';

const BASE_TASK: WorkTask = {
  id: 'task-1',
  kind: 'condense',
  lane: 'model',
  subject: { label: 'Gesundheit', ref: REF },
  state: 'running',
  progress: 0.5,
  message: null,
  error: null,
  queuePosition: null,
  queuedAt: '2026-08-10T09:00:00.000Z',
  startedAt: '2026-08-10T09:00:01.000Z',
  finishedAt: null,
  hasResult: false,
  detail: null,
  retryable: true,
};

const PROPOSAL: CondenseProposal = {
  unit: 'area',
  slug: AREA.slug,
  path: 'areas/gesundheit.condensed.md',
  baseHash: 'hash-before',
  before: 'Alte Zeile.',
  after: 'Neue Zeile.',
  sources: [],
};

const ROUTED: Handlers = {
  'llm:routing': () => ({
    tasks: { 'condense-area': { providerId: 'local', model: 'qwen' } },
    defaults: {},
  }),
  'llm:tasks': () => [],
};

/** Renders the panel with a queue that already holds `tasks` — the state a
    panel mounting after a run was started elsewhere has to read. */
function renderWithQueue(tasks: WorkTask[], extra: Handlers = {}): Mock {
  const sb = installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 5,
      indexedAt: '2026-08-10T09:00:00+02:00',
      indexing: false,
    }),
    'condense:read': () => null,
    'work:list': () => tasks,
    ...ROUTED,
    ...extra,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AreaCondensedTab area={AREA} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return sb;
}

function triggerButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Diesen Bereich verdichten' }) as HTMLButtonElement;
}

beforeEach(() => {
  setLanguage('de');
  resetWorkTasksStoreForTests();
});

afterEach(() => {
  delete window.sb;
});

/* jsdom kennt `scrollIntoView` nicht — ohne Attrappe stirbt `ErrorState`
   daran, wie in `condense-area.test.tsx`. */
Element.prototype.scrollIntoView = () => undefined;

describe('CondensedUnitPanel liest seinen Lauf aus der Warteschlange (073, D5)', () => {
  it('zeigt einen laufenden Task als laufend und sperrt den Auslöser', async () => {
    const sb = renderWithQueue([BASE_TASK]);

    expect(await screen.findByText('Verdichtung läuft')).toBeTruthy();
    expect(triggerButton().disabled).toBe(true);
    /* Nothing here started that run — the panel is only reading it. */
    expect(sb.calls.some((entry) => entry.channel === 'condense:run')).toBe(false);
  });

  it('zeigt einen wartenden Task mit seinem Platz in der Warteschlange, nicht als laufend', async () => {
    renderWithQueue([
      { ...BASE_TASK, state: 'queued', progress: 0, startedAt: null, queuePosition: 2 },
    ]);

    expect(
      await screen.findByText('Wartet auf das Modell — Platz 2 in der Warteschlange'),
    ).toBeTruthy();
    /* A waiting run must not claim to be running — the two are different
       answers to "what is happening right now". */
    expect(screen.queryByText('Verdichtung läuft')).toBeNull();
    expect(triggerButton().disabled).toBe(true);
  });

  it('nennt bei einem fehlgeschlagenen Task dessen Grund im Panel', async () => {
    renderWithQueue([
      {
        ...BASE_TASK,
        state: 'failed',
        progress: 0,
        finishedAt: '2026-08-10T09:00:09.000Z',
        error: 'unknown',
        message: 'Das Modell hat nicht geantwortet.',
      },
    ]);

    expect(await screen.findByText('Grund: Das Modell hat nicht geantwortet.')).toBeTruthy();
    /* Neither a blank panel nor a run that is still claiming to go. */
    expect(screen.queryByText('Verdichtung läuft')).toBeNull();
    expect(triggerButton().disabled).toBe(false);
  });

  it('zeigt den Vorschlag eines Tasks, der fertig war, bevor das Panel überhaupt aufgebaut wurde', async () => {
    const sb = renderWithQueue(
      [
        {
          ...BASE_TASK,
          state: 'done',
          progress: 1,
          finishedAt: '2026-08-10T09:00:09.000Z',
          hasResult: true,
        },
      ],
      { 'tasks:result': () => ({ kind: 'condense', proposal: PROPOSAL }) },
    );

    /* The diff and both decisions, without a single click in this test: this
       is the mount-and-see-the-finished-result case (AC2) at unit level. */
    expect(await screen.findByText('Alte Zeile.')).toBeTruthy();
    expect(await screen.findByText('Neue Zeile.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Übernehmen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ablehnen' })).toBeTruthy();
    /* Read, not re-run — and nothing written by merely showing it. */
    expect(sb.calls.some((entry) => entry.channel === 'condense:run')).toBe(false);
    expect(sb.calls.some((entry) => entry.channel === 'condense:accept')).toBe(false);
    expect(sb.calls.filter((entry) => entry.channel === 'tasks:result').length).toBe(1);
  });
});
