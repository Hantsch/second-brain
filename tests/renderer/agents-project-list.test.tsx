// @vitest-environment jsdom
/* `ProjectList` (story 001, D12): the cards `AllSessionsScreen` shows once
 * projects for the chosen CLI have loaded. Covers the six facts the
 * story's acceptance criteria calls for (name, path, session count, last
 * and first activity, linked vault project), that a project without a
 * link never gets a fabricated one, that the given order survives
 * untouched (the core does the sorting, not this component), and that a
 * click opens the right project. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { AgentProject, AppSettings, OverviewSettings, VaultSettings } from '@shared/types';
import { ProjectList } from '@renderer/screens/agents/ProjectList';
import { AllSessionsScreen } from '@renderer/screens/projects/AllSessionsScreen';
import { setLanguage } from '@renderer/i18n';
import type { SbBridge } from '@renderer/lib/bridge';

const NOW = '2026-08-12T09:00:00+02:00';

/* Same constant as `tests/helpers/time.ts`, restated here: `tsconfig.web.json`
   only knows `tests/renderer/**` — an import from there would be a type
   error, not a gain (see `tests/renderer/projects.test.tsx`). */
function freezeTime(): void {
  vi.useFakeTimers({ now: Date.parse(NOW), toFake: ['Date'] });
}

function apple(): AgentProject {
  return {
    key: 'c:/repos/apple',
    path: 'C:/repos/apple',
    name: 'apple',
    agent: 'claude',
    sessionCount: 4,
    firstActivity: '2026-07-01T09:00:00+02:00',
    lastActivity: NOW,
    vaultProject: 'website-redesign',
  };
}

function banana(): AgentProject {
  return {
    key: 'c:/repos/banana',
    path: 'C:/repos/banana',
    name: 'banana',
    agent: 'claude',
    sessionCount: 1,
    firstActivity: '2026-08-01T09:00:00+02:00',
    lastActivity: '2026-08-09T09:00:00+02:00',
    vaultProject: null,
  };
}

/* Story 008: a host that hands the list its dismissed keys and takes the
   two callbacks — the same contract `AllSessionsScreen` implements, minus
   the settings write, so the view's own behaviour can be checked on its
   own. */
function Host({ projects, initial = [] }: { projects: AgentProject[]; initial?: string[] }) {
  const [dismissed, setDismissed] = useState<string[]>(initial);
  return (
    <ProjectList
      projects={projects}
      onOpen={() => undefined}
      dismissed={dismissed}
      onDismiss={(key) => setDismissed((keys) => [...keys, key])}
      onUndismiss={(key) => setDismissed((keys) => keys.filter((entry) => entry !== key))}
    />
  );
}

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

function vaultSettings(overview: Partial<OverviewSettings> = {}): VaultSettings {
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

const APP_SETTINGS: AppSettings = {
  version: 1,
  lastVault: 'C:/vaults/demo',
  recentVaults: [],
  theme: 'dark',
  customization: { background: 'none', appIcon: 'knowledge-garden' },
  uiLanguage: 'en',
  window: { width: 1440, height: 900 },
  startMinimized: false,
  onboarded: true,
  machine: { vramOverrideMb: null, resourceBudgetPercent: 80 },
};

/** The whole screen on a mocked bridge — the only way to see what is written. */
function renderScreen(overview: Partial<OverviewSettings> = {}) {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  let vault = vaultSettings(overview);
  const handlers: Handlers = {
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 12,
      indexedAt: NOW,
      indexing: false,
    }),
    'settings:get': () => ({ app: APP_SETTINGS, vault }),
    /* Stands in for the main process's merge: the returned snapshot is what
       the screen reads back, so the list reflects what was written. */
    'settings:setVault': ({ patch }) => {
      const next = patch.overview?.dismissedAgentProjects;
      if (next !== undefined) {
        vault = vaultSettings({ ...vault.overview, dismissedAgentProjects: next });
      }
      return { app: APP_SETTINGS, vault };
    },
    'agents:projects': () => [apple(), banana()],
  };
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) throw Object.assign(new Error(`no handler for ${channel}`), { code: 'invalid' });
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/projects/sessions']}>
        <AllSessionsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, calls };
}

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container, { resultTypes: ['violations'] });
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

beforeEach(() => {
  setLanguage('en');
  document.documentElement.lang = 'en';
});

afterEach(() => {
  vi.useRealTimers();
  delete window.sb;
});

describe('ProjectList', () => {
  it('shows name, path, session count, last and first activity, and the linked vault project', () => {
    freezeTime();
    render(<ProjectList projects={[apple()]} onOpen={() => undefined} />);

    const card = within(screen.getByRole('button', { name: 'Open project apple' }));
    expect(card.getByText('apple')).toBeTruthy();
    expect(card.getByText('C:/repos/apple')).toBeTruthy();
    expect(card.getByText('4 sessions · last active today')).toBeTruthy();
    expect(card.getByText('since 1 Jul 2026')).toBeTruthy();
    expect(card.getByText('linked to website-redesign')).toBeTruthy();
  });

  it('does not invent a vault project when none is linked', () => {
    freezeTime();
    render(<ProjectList projects={[banana()]} onOpen={() => undefined} />);

    const card = within(screen.getByRole('button', { name: 'Open project banana' }));
    expect(card.getByText('one session · last active 3 days ago')).toBeTruthy();
    expect(screen.queryByText(/linked to/)).toBeNull();
  });

  it('keeps the order it was given instead of re-sorting', () => {
    freezeTime();
    render(<ProjectList projects={[banana(), apple()]} onOpen={() => undefined} />);

    const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual(['Open project banana', 'Open project apple']);
  });

  it('opens the clicked project by key', async () => {
    freezeTime();
    const onOpen = vi.fn();
    render(<ProjectList projects={[apple(), banana()]} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole('button', { name: 'Open project banana' }));
    expect(onOpen).toHaveBeenCalledWith('c:/repos/banana');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

/* Story 008, D4: a working directory the vault knows nothing about can be
   dismissed. Nothing disappears silently — the list keeps saying how many
   it holds back and offers the way to look at them. */
describe('ProjectList, dismissing an unmapped project', () => {
  it('removes the dismissed card and states how many are hidden', async () => {
    freezeTime();
    render(<Host projects={[apple(), banana()]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss project banana' }));

    expect(screen.queryByRole('button', { name: 'Open project banana' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open project apple' })).toBeTruthy();
    expect(screen.getByText('one project hidden')).toBeTruthy();
  });

  it('brings a dismissed project back with “show all”, and undismiss restores it', async () => {
    freezeTime();
    render(<Host projects={[apple(), banana()]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss project banana' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));

    /* Back on screen, but marked as what it is — and with the way back. */
    expect(screen.getByRole('button', { name: 'Open project banana' })).toBeTruthy();
    expect(screen.getByText('dismissed')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Show project banana again' }));

    expect(screen.getByRole('button', { name: 'Open project banana' })).toBeTruthy();
    expect(screen.queryByText('one project hidden')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  });

  it('hides a project whose key is already in the setting, from the first render', () => {
    freezeTime();
    render(<Host projects={[apple(), banana()]} initial={['claude:c:/repos/banana']} />);

    expect(screen.queryByRole('button', { name: 'Open project banana' })).toBeNull();
    expect(screen.getByText('one project hidden')).toBeTruthy();
  });

  it('says the list is empty because it is hidden, not because there is nothing', () => {
    freezeTime();
    render(<Host projects={[banana()]} initial={['claude:c:/repos/banana']} />);

    expect(screen.getByText('one project hidden')).toBeTruthy();
    expect(screen.getByText('Every project of this agent is dismissed.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show all' })).toBeTruthy();
  });

  /* A linked project belongs to a vault project; letting it vanish from the
     list would take that project's work trail with it. */
  it('gives a project with a linked vault project no dismiss control', () => {
    freezeTime();
    render(<Host projects={[apple(), banana()]} />);

    expect(screen.queryByRole('button', { name: 'Dismiss project apple' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss project banana' })).toBeTruthy();
  });

  /* Without the props the list is exactly what D12 built — the project-scoped
     host of a later deliverable simply leaves them out. */
  it('shows no dismiss control at all when the host offers no dismissal', () => {
    freezeTime();
    render(<ProjectList projects={[banana()]} onOpen={() => undefined} />);

    expect(screen.queryByRole('button', { name: /Dismiss project/ })).toBeNull();
    expect(screen.queryByText(/hidden/)).toBeNull();
  });

  it('has no accessibility violation with the dismiss controls present', async () => {
    freezeTime();
    const { container } = render(<Host projects={[apple(), banana()]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss project banana' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));

    await expectNoViolations(container);
  });
});

/* The dismissal only survives a restart if it goes into the vault settings —
   so the payload of the write is the thing worth asserting, not just the
   card that disappeared. */
describe('AllSessionsScreen, storing the dismissal', () => {
  it('writes the complete next list through settings:setVault', async () => {
    const { calls } = renderScreen();

    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss project banana' }));

    await waitFor(() => {
      expect(calls.some((call) => call.channel === 'settings:setVault')).toBe(true);
    });
    const write = calls.find((call) => call.channel === 'settings:setVault');
    expect(write?.payload).toEqual({
      patch: { overview: { dismissedAgentProjects: ['claude:c:/repos/banana'] } },
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Open project banana' })).toBeNull();
    });
    expect(screen.getByText('one project hidden')).toBeTruthy();
  });

  it('starts with a stored dismissal already applied', async () => {
    renderScreen({ dismissedAgentProjects: ['claude:c:/repos/banana'] });

    expect(await screen.findByText('one project hidden')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open project banana' })).toBeNull();
  });

  it('drops the key again on undismiss', async () => {
    const { calls } = renderScreen({ dismissedAgentProjects: ['claude:c:/repos/banana'] });

    await userEvent.click(await screen.findByRole('button', { name: 'Show all' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show project banana again' }));

    await waitFor(() => {
      const write = calls.find((call) => call.channel === 'settings:setVault');
      expect(write?.payload).toEqual({ patch: { overview: { dismissedAgentProjects: [] } } });
    });
  });
});
