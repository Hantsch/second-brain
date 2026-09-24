// @vitest-environment jsdom
/* The agent session browser's shell: the Claude/Codex switch held in the URL
 * and the four honest states — loading, error, off, empty. These tests use
 * the project's name as the signal that real data rendered; the project
 * cards themselves — all six facts, sort order, click behaviour — are
 * covered in `tests/renderer/agents-project-list.test.tsx` (D12).
 *
 * Since story 008 the view lives under Projects (`#/projects/sessions`) and
 * has no rail entry of its own. The two blocks below therefore guard what
 * replaced it: the Projects entry lights up here, and the old `#/agents`
 * address still lands — with its whole query string. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { HashRouter, MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type {
  AgentKind,
  AgentProject,
  OverviewSettings,
  TranscriptEntry,
  TranscriptPage,
  VaultSettings,
} from '@shared/types';
import { App } from '@renderer/App';
import { AllSessionsScreen } from '@renderer/screens/projects/AllSessionsScreen';
import { setLanguage } from '@renderer/i18n';
import type { SbBridge } from '@renderer/lib/bridge';

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

function installMock(handlers: Handlers): { calls: { channel: IpcChannel; payload: unknown }[] } {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) {
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    }
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return { calls };
}

function Location() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container, { resultTypes: ['violations'] });
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

const NOW = '2026-08-12T09:00:00+02:00';

function claudeProject(): AgentProject {
  return {
    key: 'c:/repos/second-brain',
    path: 'C:/repos/second-brain',
    name: 'second-brain',
    agent: 'claude',
    sessionCount: 4,
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
    sessionCount: 2,
    firstActivity: '2026-08-01T09:00:00+02:00',
    lastActivity: NOW,
    vaultProject: null,
  };
}

function transcriptEntry(id: string, text: string): TranscriptEntry {
  return { id, kind: 'assistant', at: NOW, text, toolName: null, toolTarget: null, raw: null };
}

function overviewOf(overview: Partial<OverviewSettings> = {}): VaultSettings {
  return {
    version: 1,
    languages: { ui: 'de', documents: 'de', conversation: 'de', translateSources: true },
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

function mount(options: { overview?: Partial<OverviewSettings>; extra?: Handlers } = {}) {
  const projectsRequested: AgentKind[] = [];
  const mock = installMock({
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
        uiLanguage: 'de' as const,
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
    'agents:projects': ({ agent }) => {
      projectsRequested.push(agent);
      return agent === 'claude' ? [claudeProject()] : [codexProject()];
    },
    ...options.extra,
  });
  return { ...mock, projectsRequested };
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

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
});

afterEach(() => {
  delete window.sb;
});

/** Rendert die ganze App im `HashRouter` an `hash` — der einzige Weg zu
    sehen, was eine echte Adresse tut: Rail, Routen und Umleitung sind Sache
    der Hülle, nicht eines einzelnen Screens. */
function renderApp(hash: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.location.hash = hash;
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

/** Die aktuelle Adresse, zerlegt. Die Abfrage als Objekt, damit die
    Reihenfolge der Parameter nicht mitgeprüft wird, ihr Inhalt aber schon. */
function address(): { path: string; query: Record<string, string> } {
  const [path = '', search = ''] = window.location.hash.replace(/^#/, '').split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(search)) };
}

describe('Agent-Sitzungen unter „Projekte"', () => {
  it('hat keinen eigenen Rail-Eintrag mehr', async () => {
    mount();
    renderApp('#/dashboard');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    const nav = screen.getByRole('navigation', { name: 'Hauptnavigation' });
    expect(within(nav).queryByRole('link', { name: 'Agents' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: /Sitzungen/ })).toBeNull();
  });

  /* Der Screen hängt unter „Projekte", damit genau das hier gilt: wer in den
     Sitzungen steht, sieht in der Rail, wo er ist. Sonst wäre der Umzug nur
     eine andere Adresse, und der Nutzer stünde nirgends. */
  it('lässt „Projekte" leuchten, während die Sitzungen offen sind', async () => {
    mount();
    renderApp('#/projects/sessions');
    await screen.findByRole('heading', { level: 1, name: 'Agent-Sitzungen' });

    const nav = screen.getByRole('navigation', { name: 'Hauptnavigation' });
    expect(within(nav).getByRole('link', { name: 'Projekte' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('führt über den Kopf zurück auf die Projekte', async () => {
    mount();
    renderApp('#/projects/sessions');
    await screen.findByRole('heading', { level: 1, name: 'Agent-Sitzungen' });

    await userEvent.click(screen.getByRole('button', { name: 'Zurück zu den Projekten' }));

    await waitFor(() => expect(address().path).toBe('/projects'));
  });
});

/* Die alte Adresse steht in Lesezeichen, in der Dashboard-Kachel und in jedem
   bisher weitergegebenen Link auf ein Transkript. Ein bloßes
   `<Navigate to="/projects/sessions" />` würfe ihre Abfrage weg: der Tieflink
   käme ohne a/p/s an und landete auf der leeren Projektliste statt auf dem
   benannten Transkript — still, mit grünen Tests. Deshalb wird hier nicht
   bloß der Pfad geprüft, sondern jeder einzelne Parameter. */
describe('Alte Adresse #/agents', () => {
  it('leitet ohne Abfrage auf #/projects/sessions um', async () => {
    mount();
    renderApp('#/agents');

    await screen.findByRole('heading', { level: 1, name: 'Agent-Sitzungen' });
    expect(address()).toEqual({ path: '/projects/sessions', query: {} });
    /* Nicht nur die Adresse: die Projektliste steht auch wirklich da. */
    expect(await screen.findByText('second-brain')).toBeTruthy();
  });

  it('nimmt a, p und s vollständig mit und landet auf demselben Transkript', async () => {
    const key = 'c:/repos/godot-rag';
    mount({
      extra: {
        'agents:sessions': () => [],
        'agents:transcript': (): TranscriptPage => ({
          entries: [transcriptEntry('e1', 'Der Verlauf dieser Sitzung')],
          nextCursor: null,
          totalKnown: true,
        }),
      },
    });
    renderApp(`#/agents?a=codex&p=${encodeURIComponent(key)}&s=sitzung-7`);

    await screen.findByRole('heading', { level: 1, name: 'Agent-Sitzungen' });
    await waitFor(() => expect(address().path).toBe('/projects/sessions'));
    expect(address().query).toEqual({ a: 'codex', p: key, s: 'sitzung-7' });

    /* Und zwar wirklich auf dem Transkript, nicht auf der Liste dahinter. */
    expect(await screen.findByText('Der Verlauf dieser Sitzung')).toBeTruthy();
    expect(screen.getByText('Sitzung sitzung-7')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Codex' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('Agents-Screen: Umschalter und Zustände', () => {
  it('öffnet auf Claude und zeigt dessen Projekte, ohne einen zweiten Kanal zu rufen', async () => {
    const harness = mount();
    renderScreen();

    await waitFor(() => expect(screen.getByText('second-brain')).toBeTruthy());
    expect(harness.projectsRequested).toEqual(['claude']);
  });

  it('wechselt über den Umschalter zu Codex, aktualisiert Adresse und Liste', async () => {
    const harness = mount();
    renderScreen();
    await screen.findByText('second-brain');

    await userEvent.click(screen.getByRole('tab', { name: 'Codex' }));

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/projects/sessions?a=codex'),
    );
    await waitFor(() => expect(harness.projectsRequested).toContain('codex'));
    expect(screen.getByRole('tab', { name: 'Codex' }).getAttribute('aria-selected')).toBe('true');
    await screen.findByText('godot-rag');
  });

  it('wechselt zu Codex und zurück zu Claude ohne die Auswahl zu verlieren', async () => {
    mount();
    renderScreen();
    await screen.findByText('second-brain');

    await userEvent.click(screen.getByRole('tab', { name: 'Codex' }));
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/projects/sessions?a=codex'),
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Claude Code' }));
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/projects/sessions'),
    );
    expect(screen.getByRole('tab', { name: 'Claude Code' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    await screen.findByText('second-brain');
  });

  it('sagt bei abgeschaltetem Mitlesen, dass es aus ist — nicht „keine Projekte"', async () => {
    mount({ overview: { useClaudeSessions: false } });
    renderScreen();

    expect(await screen.findByText('Mitlesen ist ausgeschaltet')).toBeTruthy();
    expect(
      screen.getByText(/Das Mitlesen der Claude Code-Sitzungen ist in den Einstellungen/),
    ).toBeTruthy();
    expect(screen.queryByText(/Noch keine Sitzung/)).toBeNull();
    expect(screen.queryByText('second-brain')).toBeNull();
  });

  it('unterscheidet „aus" von „leer": Codex an, aber ohne Projekte', async () => {
    mount({
      extra: { 'agents:projects': () => [] },
    });
    renderScreen('/projects/sessions?a=codex');

    expect(await screen.findByText('Noch keine Sitzung von Codex')).toBeTruthy();
    expect(screen.queryByText('Mitlesen ist ausgeschaltet')).toBeNull();
  });

  it('bietet aus dem Aus-Zustand den Weg zu den Einstellungen', async () => {
    mount({ overview: { useCodexSessions: false } });
    renderScreen('/projects/sessions?a=codex');
    await screen.findByText('Mitlesen ist ausgeschaltet');

    await userEvent.click(screen.getByRole('button', { name: 'Einschalten' }));
    expect(screen.getByTestId('location').textContent).toBe('/settings?tab=behavior');
  });

  it('zeigt einen Fehler mit Wiederholen statt eines stillen Leerzustands', async () => {
    let calls = 0;
    mount({
      extra: {
        'agents:projects': () => {
          calls += 1;
          if (calls === 1) {
            throw Object.assign(new Error('kaputt'), { code: 'io' });
          }
          return [claudeProject()];
        },
      },
    });
    renderScreen();

    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    await waitFor(() => expect(screen.getByText('second-brain')).toBeTruthy());
  });

  /* AC10: „eingestelltes Verzeichnis gibt es nicht" ist etwas anderes als
     „nichts gefunden" und etwas anderes als ein kaputter Lesevorgang. Nur der
     Nutzer kann es richten — also steht der Pfad da, und der Weg dorthin. */
  it('nennt bei einem fehlenden eingestellten Verzeichnis den Pfad und den Weg zur Einstellung', async () => {
    mount({
      extra: {
        'agents:projects': () => {
          throw Object.assign(new Error('dieses Verzeichnis gibt es nicht: C:/falsch/pfad'), {
            code: 'not-found',
            detail: { missingDir: 'C:/falsch/pfad' },
          });
        },
      },
    });
    renderScreen();

    expect(await screen.findByText('Verzeichnis nicht gefunden')).toBeTruthy();
    expect(screen.getByText(/C:\/falsch\/pfad/)).toBeTruthy();
    /* Nicht der allgemeine Fehlerzustand: der böte nur „Erneut versuchen". */
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Noch keine Sitzung von Claude Code')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Einstellungen öffnen' }));
    expect(screen.getByTestId('location').textContent).toBe('/settings?tab=behavior');
  });

  it('hat keinen A11y-Verstoß, auch nicht im Aus-Zustand', async () => {
    mount({ overview: { useClaudeSessions: false } });
    const { container } = renderScreen();
    await screen.findByText('Mitlesen ist ausgeschaltet');
    await expectNoViolations(container);
  });
});
