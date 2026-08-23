// @vitest-environment jsdom
/* `Transcript` (story 001, D14): the condensed course of a single session,
 * paged one 128 KB window at a time by `readTranscriptPage`
 * (`@core/agents/transcript.ts`, D8). This file's job is to prove the
 * frontend honours that backend guarantee instead of undoing it:
 *
 * - the first page renders as soon as it arrives, with `user`/`assistant`
 *   entries visibly distinguishable (not merely by wording);
 * - a `tool-call` row stays collapsed until clicked, then reveals `raw`;
 * - "load more" asks for exactly the previous page's `nextCursor` and
 *   appends, never replaces;
 * - `nextCursor === null` retires the trigger, honestly — with an "end of
 *   transcript" note only when `totalKnown` says so, never a fabricated one;
 * - and the deliverable's actual grading criterion: however many pages a
 *   session has, the underlying transcript query fires exactly once before
 *   any click and exactly once per subsequent "load more" click — never
 *   speculatively, never more than one page ahead.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type {
  AgentKind,
  AgentProject,
  AgentSessionSummary,
  OverviewSettings,
  TranscriptEntry,
  TranscriptPage,
  VaultSettings,
} from '@shared/types';
import { AllSessionsScreen } from '@renderer/screens/projects/AllSessionsScreen';
import { Transcript } from '@renderer/screens/agents/Transcript';
import { setLanguage } from '@renderer/i18n';
import type { SbBridge } from '@renderer/lib/bridge';

const NOW = '2026-08-12T09:00:00+02:00';

function userEntry(id: string, text: string): TranscriptEntry {
  return { id, kind: 'user', at: NOW, text, toolName: null, toolTarget: null, raw: null };
}

function assistantEntry(id: string, text: string): TranscriptEntry {
  return { id, kind: 'assistant', at: NOW, text, toolName: null, toolTarget: null, raw: null };
}

function toolCallEntry(id: string, name: string, target: string, raw: unknown): TranscriptEntry {
  return { id, kind: 'tool-call', at: NOW, text: null, toolName: name, toolTarget: target, raw };
}

function page(
  entries: TranscriptEntry[],
  nextCursor: string | null,
  totalKnown = false,
): TranscriptPage {
  return { entries, nextCursor, totalKnown };
}

beforeEach(() => {
  setLanguage('en');
  document.documentElement.lang = 'en';
});

afterEach(() => {
  delete window.sb;
  vi.restoreAllMocks();
});

type TranscriptRequest = {
  agent: AgentKind;
  sessionId: string;
  projectKey: string;
  cursor: string | null;
};

/** Tracks every `agents:transcript` call (channel + cursor) so tests can assert on it directly. */
function installTranscriptMock(byCursor: (cursor: string | null) => TranscriptPage): {
  invoke: ReturnType<typeof vi.fn>;
  cursorsRequested: () => (string | null)[];
} {
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    if (channel === 'vault:status') {
      return {
        root: 'C:/vaults/demo',
        name: 'Demo',
        ready: true,
        docCount: 1,
        indexedAt: NOW,
        indexing: false,
      };
    }
    if (channel === 'agents:transcript') {
      const request = payload as TranscriptRequest;
      return byCursor(request.cursor);
    }
    throw Object.assign(new Error(`no handler for ${channel}`), { code: 'invalid' });
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;

  const cursorsRequested = () =>
    invoke.mock.calls
      .filter(([channel]) => channel === 'agents:transcript')
      .map(([, payload]) => (payload as TranscriptRequest).cursor);

  return { invoke, cursorsRequested };
}

function renderTranscript(
  byCursor: (cursor: string | null) => TranscriptPage,
  onBack = () => undefined,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const mock = installTranscriptMock(byCursor);
  const view = render(
    <QueryClientProvider client={client}>
      <Transcript
        agent="claude"
        sessionId="session-1"
        projectKey="c:/repos/second-brain"
        onBack={onBack}
      />
    </QueryClientProvider>,
  );
  return { ...view, ...mock };
}

describe('Transcript', () => {
  it('renders the first page on mount with user and assistant visibly distinguishable', async () => {
    renderTranscript(() =>
      page(
        [
          userEntry('u1', 'Where did we leave off?'),
          assistantEntry('a1', 'At the ingest pipeline.'),
        ],
        null,
        true,
      ),
    );

    const userTurn = (await screen.findByText('Where did we leave off?')).closest('article');
    const assistantTurn = screen.getByText('At the ingest pipeline.').closest('article');

    expect(userTurn?.className).toContain('sb-dturn--user');
    expect(assistantTurn?.className).toContain('sb-dturn--assistant');
    expect(userTurn?.className).not.toBe(assistantTurn?.className);
    // Distinguishable by more than color alone: a role label sits above each turn.
    expect(within(userTurn!).getByText('You')).toBeTruthy();
    expect(within(assistantTurn!).getByText('Claude Code')).toBeTruthy();
  });

  it('shows an honest empty state when the session has no messages', async () => {
    renderTranscript(() => page([], null, true));
    expect(await screen.findByText('No messages recorded for this session.')).toBeTruthy();
  });

  it('keeps a tool call collapsed until clicked, then reveals its raw record', async () => {
    renderTranscript(() =>
      page(
        [toolCallEntry('t1', 'Read', 'src/file.ts', { tool: 'Read', path: 'src/file.ts' })],
        null,
        true,
      ),
    );

    await screen.findByText('Read');
    expect(screen.getByText('src/file.ts')).toBeTruthy();
    expect(screen.queryByText(/"path": "src\/file\.ts"/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Tool call Read/ }));

    expect(screen.getByText(/"path": "src\/file\.ts"/)).toBeTruthy();
  });

  it("fetches the next page with the previous page's cursor and appends, without dropping the first page", async () => {
    const { cursorsRequested } = renderTranscript((cursor) =>
      cursor === null
        ? page([assistantEntry('a1', 'First page turn')], 'cursor-2')
        : page([assistantEntry('a2', 'Second page turn')], null, true),
    );

    await screen.findByText('First page turn');
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await screen.findByText('Second page turn');
    expect(screen.getByText('First page turn')).toBeTruthy();
    expect(cursorsRequested()).toEqual([null, 'cursor-2']);
  });

  it('hides the load-more trigger and states the end honestly once the total is known', async () => {
    renderTranscript(() => page([assistantEntry('a1', 'Only turn')], null, true));

    await screen.findByText('Only turn');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(screen.getByText('End of transcript')).toBeTruthy();
  });

  it('hides the load-more trigger without inventing an end note when the total is not known', async () => {
    renderTranscript(() => page([assistantEntry('a1', 'Only turn')], null, false));

    await screen.findByText('Only turn');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(screen.queryByText('End of transcript')).toBeNull();
  });

  it('never fetches more than one page ahead of what the user asked for', async () => {
    const pagesByCursor: Record<string, TranscriptPage> = {
      root: page([assistantEntry('a0', 'Turn 0')], 'c1'),
      c1: page([assistantEntry('a1', 'Turn 1')], 'c2'),
      c2: page([assistantEntry('a2', 'Turn 2')], 'c3'),
      c3: page([assistantEntry('a3', 'Turn 3')], 'c4'),
      c4: page([assistantEntry('a4', 'Turn 4')], null, true),
    };
    const { invoke } = renderTranscript((cursor) => pagesByCursor[cursor ?? 'root']!);

    const transcriptCalls = () =>
      invoke.mock.calls.filter(([channel]) => channel === 'agents:transcript').length;

    await screen.findByText('Turn 0');
    expect(transcriptCalls()).toBe(1);

    for (let click = 1; click <= 4; click += 1) {
      const button = screen.getByRole('button', { name: 'Load more' });
      await userEvent.click(button);
      await waitFor(() => expect(transcriptCalls()).toBe(click + 1));
    }

    // All five turns present, the trigger retired, and never more than one
    // fetch per click — the exact freeze-risk guarantee this deliverable exists for.
    await screen.findByText('Turn 4');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(transcriptCalls()).toBe(5);
  });
});

/* ── Back path through `AllSessionsScreen`, D13's URL-assertion pattern ────── */

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

function installScreenMock(handlers: Handlers): void {
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) {
      throw Object.assign(new Error(`no handler for ${channel}`), { code: 'invalid' });
    }
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
}

function Location() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

function overviewOf(overview: Partial<OverviewSettings> = {}): VaultSettings {
  return {
    version: 1,
    languages: { ui: 'en', documents: 'en', conversation: 'en', translateSources: true },
    capture: {
      quickCaptureShortcut: 'Control+Shift+Space',
      autoClassify: true,
      closeAfterCapture: true,
    },
    overview: {
      staleAfterDays: 14,
      deadlineHorizonDays: 14,
      waitingNudgeDays: 5,
      useClaudeSessions: true,
      claudeProjectsDir: '',
      useCodexSessions: true,
      codexSessionsDir: '',
      notifications: true,
      dismissedAgentProjects: [],
      showEmptySessionsTab: false,
      ...overview,
    },
    journal: { mode: 'tips' },
    gardener: { runOnOpen: true, reviewAfterDays: 120, useLlm: true },
    providers: [],
    routing: { tasks: {}, defaults: {} },
    dashboard: { tiles: [], updated: NOW },
    preferredTags: [],
  };
}

function claudeProject(): AgentProject {
  return {
    key: 'c:/repos/second-brain',
    path: 'C:/repos/second-brain',
    name: 'second-brain',
    agent: 'claude',
    sessionCount: 1,
    firstActivity: '2026-07-01T09:00:00+02:00',
    lastActivity: NOW,
    vaultProject: null,
  };
}

function fullSession(): AgentSessionSummary {
  return {
    id: 'session-full',
    agent: 'claude',
    projectKey: claudeProject().key,
    title: 'Refactor the ingest pipeline',
    startedAt: NOW,
    lastActivity: NOW,
    durationMs: 42 * 60_000,
    messageCount: 18,
    gitBranch: 'feature/ingest',
    model: 'claude-opus-4',
    subagents: ['code-reviewer'],
    contextTokens: 128_000,
    vaultProject: null,
  };
}

function mountScreen(): void {
  installScreenMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 12,
      indexedAt: NOW,
      indexing: false,
    }),
    'settings:get': () => ({
      app: {
        version: 1,
        lastVault: 'C:/vaults/demo',
        recentVaults: [],
        theme: 'dark' as const,
        customization: { background: 'none' as const, appIcon: 'knowledge-garden' as const },
        uiLanguage: 'en' as const,
        window: { width: 1440, height: 900 },
        startMinimized: false,
        onboarded: true,
        machine: { vramOverrideMb: null, resourceBudgetPercent: 80 },
      },
      vault: overviewOf(),
    }),
    'agents:projects': () => [claudeProject()],
    'agents:sessions': () => [fullSession()],
    'agents:transcript': () => page([assistantEntry('a1', 'Session content')], null, true),
  });
}

function renderScreen(at: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <AllSessionsScreen />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AllSessionsScreen: into the transcript and back', () => {
  it('opens the transcript on session click, with the session id in the URL', async () => {
    mountScreen();
    renderScreen('/projects/sessions?p=c%3A%2Frepos%2Fsecond-brain');

    await userEvent.click(await screen.findByRole('button', { name: /Open session/ }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('s='));
    expect(await screen.findByText('Session content')).toBeTruthy();
  });

  it('returns to the session list on back, clearing only the session id from the URL', async () => {
    mountScreen();
    renderScreen('/projects/sessions?p=c%3A%2Frepos%2Fsecond-brain&s=session-full');

    await screen.findByText('Session content');

    await userEvent.click(screen.getByRole('button', { name: 'Back to sessions' }));

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '/projects/sessions?p=c%3A%2Frepos%2Fsecond-brain',
      ),
    );
    await screen.findByRole('button', { name: /Open session/ });
  });
});
