// @vitest-environment jsdom
/* `ProjectDetail` (story 001, D13): the session rows a project's detail view
 * shows once `AllSessionsScreen` (D11) drills into a project (`ProjectList`,
 * D12). Two levels of coverage:
 *
 * - `ProjectDetail` in isolation: the session facts it renders (start, last
 *   activity, duration, messages, branch, model, subagents, context), and —
 *   the deliverable's exact acceptance criterion — that `subagents: null`
 *   ("the format doesn't record this") reads as unknown while
 *   `subagents: []` ("recorded as zero") reads as an explicit, different
 *   zero-count state. Neither ever collapses into the other.
 * - `AllSessionsScreen` end to end: a click on a project card writes `p` into
 *   the address and swaps the list for the detail view; the back control
 *   returns to the list with the Claude/Codex switch untouched; a stale
 *   `p` from a hand-edited URL is an honest "not found", not a crash.
 * - The vault link (AC8): an unlinked project offers the way to link it and
 *   calls `agents:link` with its own key and agent; a linked one states the
 *   link instead of offering it again.
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
  Project,
  VaultSettings,
} from '@shared/types';
import { AllSessionsScreen } from '@renderer/screens/projects/AllSessionsScreen';
import { ProjectDetail } from '@renderer/screens/agents/ProjectDetail';
import { setLanguage } from '@renderer/i18n';
import type { SbBridge } from '@renderer/lib/bridge';

const NOW = '2026-08-12T09:00:00+02:00';

function freezeTime(): void {
  vi.useFakeTimers({ now: Date.parse(NOW), toFake: ['Date'] });
}

function claudeProject(): AgentProject {
  return {
    key: 'c:/repos/second-brain',
    path: 'C:/repos/second-brain',
    name: 'second-brain',
    agent: 'claude',
    sessionCount: 2,
    firstActivity: '2026-07-01T09:00:00+02:00',
    lastActivity: NOW,
    vaultProject: null,
  };
}

function codexProject(): AgentProject {
  return {
    key: 'c:/repos/godot-rag',
    path: 'C:/repos/godot-rag',
    name: 'godot-rag',
    agent: 'codex',
    sessionCount: 1,
    firstActivity: '2026-08-01T09:00:00+02:00',
    lastActivity: NOW,
    vaultProject: null,
  };
}

/** Every fact the trail can record, filled in — the "everything known" row. */
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
    subagents: ['code-reviewer', 'test-runner'],
    contextTokens: 128_000,
    vaultProject: null,
  };
}

/** Codex-shaped: none of the optional facts are recorded — all unknown. */
function unknownFactsSession(): AgentSessionSummary {
  return {
    id: 'session-unknown',
    agent: 'codex',
    projectKey: codexProject().key,
    title: null,
    startedAt: '2026-08-11T08:00:00+02:00',
    lastActivity: '2026-08-11T08:10:00+02:00',
    durationMs: null,
    messageCount: 5,
    gitBranch: null,
    model: null,
    subagents: null,
    contextTokens: null,
    vaultProject: null,
  };
}

/**
 * A session that ran across two days: its start and its last activity fall on
 * different ones, so the two facts cannot be confused for each other.
 */
function spanningSession(): AgentSessionSummary {
  return {
    ...fullSession(),
    id: 'session-spanning',
    title: 'Long haul',
    startedAt: '2026-08-10T09:00:00+02:00',
    lastActivity: NOW,
    durationMs: 2 * 24 * 60 * 60_000,
  };
}

/** `subagents: []` — a session where zero subagents genuinely ran. */
function zeroSubagentsSession(): AgentSessionSummary {
  return {
    id: 'session-zero',
    agent: 'claude',
    projectKey: claudeProject().key,
    title: 'Quick fix',
    startedAt: '2026-08-10T08:00:00+02:00',
    lastActivity: '2026-08-10T08:05:00+02:00',
    durationMs: 5 * 60_000,
    messageCount: 3,
    gitBranch: 'main',
    model: 'claude-sonnet-4',
    subagents: [],
    contextTokens: 4_096,
    vaultProject: null,
  };
}

beforeEach(() => {
  setLanguage('en');
  document.documentElement.lang = 'en';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProjectDetail', () => {
  it('shows start, last activity, duration, messages, branch, model, subagents and context for a fully-recorded session', () => {
    freezeTime();
    render(
      <ProjectDetail
        project={claudeProject()}
        sessions={[fullSession()]}
        link={null}
        onBack={() => undefined}
        onOpenSession={() => undefined}
      />,
    );

    const card = within(
      screen.getByRole('button', { name: 'Open session Refactor the ingest pipeline' }),
    );
    expect(card.getByText('started today · last active today')).toBeTruthy();
    expect(card.getByText('duration 42m · 18 messages')).toBeTruthy();
    expect(card.getByText('branch feature/ingest · model claude-opus-4')).toBeTruthy();
    expect(card.getByText('2 subagents · code-reviewer, test-runner')).toBeTruthy();
    expect(card.getByText('128,000 tokens context')).toBeTruthy();
  });

  /* Both timestamps are shown, and each from its own field: a session that ran
     across two days must not report its start as its last activity. */
  it('reads the last activity from the session, not from its start', () => {
    freezeTime();
    render(
      <ProjectDetail
        project={claudeProject()}
        sessions={[spanningSession()]}
        link={null}
        onBack={() => undefined}
        onOpenSession={() => undefined}
      />,
    );

    expect(screen.getByText('started 2 days ago · last active today')).toBeTruthy();
  });

  it('reads null subagents (and every other unrecorded fact) as unknown, never as zero', () => {
    render(
      <ProjectDetail
        project={codexProject()}
        sessions={[unknownFactsSession()]}
        link={null}
        onBack={() => undefined}
        onOpenSession={() => undefined}
      />,
    );

    expect(screen.getByText('duration unknown · 5 messages')).toBeTruthy();
    expect(screen.getByText('branch unknown · model unknown')).toBeTruthy();
    expect(screen.getByText('subagents unknown')).toBeTruthy();
    expect(screen.getByText('context size unknown')).toBeTruthy();
    expect(screen.queryByText(/^0 subagents/)).toBeNull();
    expect(screen.queryByText('no subagents')).toBeNull();
  });

  it('reads an empty subagents array as an explicit zero, distinct from unknown', () => {
    render(
      <ProjectDetail
        project={claudeProject()}
        sessions={[zeroSubagentsSession()]}
        link={null}
        onBack={() => undefined}
        onOpenSession={() => undefined}
      />,
    );

    expect(screen.getByText('no subagents')).toBeTruthy();
    expect(screen.queryByText('subagents unknown')).toBeNull();
  });

  it('falls back to the start date as the session label when no title was recorded', () => {
    render(
      <ProjectDetail
        project={codexProject()}
        sessions={[unknownFactsSession()]}
        link={null}
        onBack={() => undefined}
        onOpenSession={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: /Open session 11 Aug 2026/ })).toBeTruthy();
  });

  it('calls onOpenSession with the session id on click', async () => {
    const onOpenSession = vi.fn();
    render(
      <ProjectDetail
        project={claudeProject()}
        sessions={[fullSession()]}
        link={null}
        onBack={() => undefined}
        onOpenSession={onOpenSession}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Open session Refactor the ingest pipeline' }),
    );
    expect(onOpenSession).toHaveBeenCalledWith('session-full');
  });

  it('calls onBack when the back control is used', async () => {
    const onBack = vi.fn();
    render(
      <ProjectDetail
        project={claudeProject()}
        sessions={[fullSession()]}
        link={null}
        onBack={onBack}
        onOpenSession={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'All projects' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('offers the link only while no vault project is known', () => {
    const { rerender } = render(
      <ProjectDetail
        project={claudeProject()}
        sessions={[fullSession()]}
        link={<span>link me</span>}
        onBack={() => undefined}
        onOpenSession={() => undefined}
      />,
    );

    expect(screen.getByText('link me')).toBeTruthy();

    rerender(
      <ProjectDetail
        project={{ ...claudeProject(), vaultProject: 'kundenportal-relaunch' }}
        sessions={[fullSession()]}
        link={<span>link me</span>}
        onBack={() => undefined}
        onOpenSession={() => undefined}
      />,
    );

    /* Linked: the fact is stated, the offer to link it again is gone. */
    expect(screen.getByText('linked to kundenportal-relaunch')).toBeTruthy();
    expect(screen.queryByText('link me')).toBeNull();
  });

  it('says so honestly instead of showing an empty list when a project has no sessions', () => {
    render(
      <ProjectDetail
        project={claudeProject()}
        sessions={[]}
        link={null}
        onBack={() => undefined}
        onOpenSession={() => undefined}
      />,
    );

    expect(screen.getByText('No sessions recorded for this project (yet).')).toBeTruthy();
  });
});

/* ── End to end through AllSessionsScreen ─────────────────────────────────── */

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

function installMock(handlers: Handlers): void {
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

/** A vault project to link to — only the fields the picker and the undo read. */
function vaultProject(): Project {
  return {
    path: 'projects/work/kundenportal-relaunch/project.md',
    slug: 'kundenportal-relaunch',
    title: 'Kundenportal relaunch',
    scope: 'work',
    status: 'active',
    priority: 2,
    favorite: false,
    deadline: null,
    nextStep: null,
    nextStepStale: false,
    waitingOn: [],
    tags: [],
    modules: [],
    repos: [],
    lastTouch: NOW,
    lastTouchSource: 'file',
    ageDays: 0,
    stale: false,
    todoCount: 0,
    openTodoCount: 0,
    excerpt: '',
  };
}

function mount(options: { overview?: Partial<OverviewSettings>; extra?: Handlers } = {}): {
  links: IpcRequest<'agents:link'>[];
} {
  const links: IpcRequest<'agents:link'>[] = [];
  installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 12,
      indexedAt: NOW,
      indexing: false,
      indexRefreshFailedAt: null,
    }),
    'settings:get': () => ({
      app: {
        version: 1,
        lastVault: 'C:/vaults/demo',
        recentVaults: [],
        theme: 'dark' as const,
        customization: { background: 'none' as const, appIcon: 'knowledge-garden' as const },
        uiLanguage: 'en' as const,
        newVaultLanguages: { documents: 'de', conversation: 'de', translateSources: true },
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
      vault: overviewOf(options.overview),
    }),
    'agents:projects': ({ agent }: { agent: AgentKind }) =>
      agent === 'claude' ? [claudeProject()] : [codexProject()],
    'agents:sessions': ({ agent }: { agent: AgentKind; projectKey: string }) =>
      agent === 'claude' ? [fullSession()] : [unknownFactsSession()],
    'projects:list': () => [vaultProject()],
    'agents:link': (request: IpcRequest<'agents:link'>) => {
      links.push(request);
    },
    ...options.extra,
  });
  return { links };
}

function renderScreen(at = '/projects/sessions') {
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

afterEach(() => {
  delete window.sb;
});

describe('AllSessionsScreen: into the project detail and back', () => {
  it('opens the project detail on click, with the project key in the URL', async () => {
    mount();
    renderScreen();
    await screen.findByText('second-brain');

    await userEvent.click(screen.getByRole('button', { name: 'Open project second-brain' }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('p='));
    await screen.findByRole('button', { name: /Open session/ });
  });

  it('returns to the project list with the agent switch unchanged', async () => {
    mount();
    renderScreen();
    await screen.findByText('second-brain');

    await userEvent.click(screen.getByRole('tab', { name: 'Codex' }));
    await screen.findByText('godot-rag');

    await userEvent.click(screen.getByRole('button', { name: 'Open project godot-rag' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('a=codex'));
    await screen.findByRole('button', { name: /Open session/ });

    await userEvent.click(screen.getByRole('button', { name: 'All projects' }));

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/projects/sessions?a=codex'),
    );
    expect(screen.getByRole('tab', { name: 'Codex' }).getAttribute('aria-selected')).toBe('true');
    await screen.findByText('godot-rag');
    expect(screen.queryByText('second-brain')).toBeNull();
  });

  it('says a stale project key is not found instead of crashing', async () => {
    mount();
    renderScreen('/projects/sessions?p=c%3A%2Frepos%2Fghost');

    expect(await screen.findByText('Project not found')).toBeTruthy();
    expect(screen.queryByText('second-brain')).toBeNull();
  });
});

/* ── AC8: linking a project to a vault project ────────────────────────────── */

describe('AllSessionsScreen: linking a project', () => {
  it('links the open project with its own key and agent', async () => {
    const harness = mount();
    renderScreen('/projects/sessions?p=c%3A%2Frepos%2Fsecond-brain');

    await userEvent.click(await screen.findByRole('button', { name: 'Link a vault project' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Link project “second-brain” to a vault project' }),
      'kundenportal-relaunch',
    );

    await waitFor(() => expect(harness.links).toHaveLength(1));
    expect(harness.links[0]).toEqual({
      agent: 'claude',
      projectKey: 'c:/repos/second-brain',
      project: 'kundenportal-relaunch',
    });
  });

  it('carries the agent of the switched-to CLI, not always Claude', async () => {
    const harness = mount();
    renderScreen('/projects/sessions?a=codex&p=c%3A%2Frepos%2Fgodot-rag');

    await userEvent.click(await screen.findByRole('button', { name: 'Link a vault project' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Link project “godot-rag” to a vault project' }),
      'kundenportal-relaunch',
    );

    await waitFor(() => expect(harness.links).toHaveLength(1));
    expect(harness.links[0]?.agent).toBe('codex');
    expect(harness.links[0]?.projectKey).toBe('c:/repos/godot-rag');
  });

  it('states the link instead of offering it again once the project is linked', async () => {
    mount({
      extra: {
        'agents:projects': () => [{ ...claudeProject(), vaultProject: 'kundenportal-relaunch' }],
      },
    });
    renderScreen('/projects/sessions?p=c%3A%2Frepos%2Fsecond-brain');

    expect(await screen.findByText('linked to kundenportal-relaunch')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Link a vault project' })).toBeNull();
  });
});
