// @vitest-environment jsdom
/* Der Projekt-Screen: die Antwort auf „wo war ich stehengeblieben?".
 *
 * Geprüft wird, was der Screen behauptet — und dass er nur behauptet, was
 * wirklich passiert: der Statuswechsel schreibt, der Vorschlag schreibt nicht,
 * das Häkchen geht an genau ein Todo. Dazu die Trennung von Arbeit und Privat,
 * die Gruppierung nach Fälligkeit, die beiden Leerzustände und die Tastatur.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type {
  AgentKind,
  AgentProject,
  AgentSessionSummary,
  OverviewSettings,
  Project,
  SettingsSnapshot,
  Todo,
  VaultDoc,
} from '@shared/types';
import { ProjectsScreen } from '@renderer/screens/projects/ProjectsScreen';
import { ToastHost } from '@renderer/components/ToastHost';
import { setLanguage } from '@renderer/i18n';
import { clearToasts } from '@renderer/lib/toast';
import type { SbBridge } from '@renderer/lib/bridge';

/* Dieselben Zeitkonstanten wie `tests/helpers/time.ts`. Hier noch einmal, weil
   `tsconfig.web.json` nur `tests/renderer/**` kennt — ein Import von dort waere
   ein Typfehler, kein Gewinn. */
const NOW = '2026-08-10T14:32:00+02:00';
const TODAY = '2026-08-10';

type SbHandlers = {
  [K in IpcChannel]?: (payload: IpcRequest<K>) => IpcResponse<K> | unknown;
};

interface SbMock {
  calls: { channel: IpcChannel; payload: unknown }[];
}

/** `window.sb` als Attrappe. Was fehlt, wird zum IpcError — nie zu Stille. */
function installSbMock(handlers: SbHandlers): SbMock {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) {
      throw Object.assign(new Error(`kein Handler fuer ${channel}`), { code: 'invalid' });
    }
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return { calls };
}

/** Die Adresse als Text — der einzige Weg zu sehen, was `go` wirklich baut. */
function Location() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

/** Die Abfrage der Adresse als Objekt: der Inhalt zaehlt, nicht die Reihenfolge. */
function query(): Record<string, string> {
  const search = screen.getByTestId('location').textContent?.split('?')[1] ?? '';
  return Object.fromEntries(new URLSearchParams(search));
}

async function expectNoA11yViolations(container: Element): Promise<void> {
  const result = await axe.run(container, { resultTypes: ['violations'] });
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

/** Nur `Date` faelschen: Timer bleiben echt, sonst haengt Testing-Library. */
function freezeTime(): void {
  vi.useFakeTimers({ now: Date.parse(NOW), toFake: ['Date'] });
}

// ── Bestand ──────────────────────────────────────────────────────────────────

function project(patch: Partial<Project> & { slug: string; title: string }): Project {
  return {
    path: `projects/work/${patch.slug}/project.md`,
    scope: 'work',
    status: 'active',
    priority: 2,
    favorite: false,
    deadline: null,
    nextStep: null,
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
    nextStepStale: false,
    ...patch,
  };
}

const portal = project({
  slug: 'kundenportal-relaunch',
  title: 'Kundenportal Relaunch',
  status: 'active',
  priority: 1,
  deadline: '2026-08-13',
  nextStep: 'Abnahmeprotokoll mit Miriam durchgehen',
  waitingOn: [
    { who: 'Jonas', what: 'Fallback für Sitzungen', since: '2026-08-06', due: '2026-08-08' },
    { who: 'Miriam', what: 'Abnahmetermin', since: '2026-08-07' },
  ],
  repos: ['C:/development/demo/kundenportal-web'],
  todoCount: 3,
  openTodoCount: 2,
  excerpt: 'Die neue Angebotsliste liegt auf dem Testsystem.',
});

const legacy = project({
  slug: 'datenmigration-legacy-crm',
  title: 'Datenmigration Legacy-CRM',
  lastTouch: '2026-07-01T11:05:00+02:00',
  ageDays: 40,
  stale: true,
});

const hochbeet = project({
  slug: 'hochbeet-bauen',
  title: 'Hochbeet für den Balkon',
  scope: 'private',
  path: 'projects/private/hochbeet-bauen/project.md',
  nextStep: 'Bretter auf Länge sägen',
  /* Älter als das Kundenportal: die Sortierung nach jüngster Spur ist die
     eigentliche Aussage der Liste. */
  lastTouch: '2026-08-08T19:10:00+02:00',
  ageDays: 2,
  todoCount: 3,
  openTodoCount: 3,
});

const PROJECTS: Project[] = [portal, legacy, hochbeet];

/* Die Agent-Projekte: Arbeitsverzeichnisse, wie sie die CLIs melden. Das
   Kundenportal hat zwei davon (`repos` darf mehrere nennen) — genau darum
   fuehrt der Sitzungen-Tab zusammen, statt eines davon zu zeigen. */
function agentProject(
  patch: Partial<AgentProject> & { key: string; name: string; agent: AgentKind },
): AgentProject {
  return {
    path: patch.key,
    sessionCount: 1,
    firstActivity: '2026-08-01T09:00:00+02:00',
    lastActivity: NOW,
    vaultProject: null,
    ...patch,
  };
}

function agentSession(
  patch: Partial<AgentSessionSummary> & { id: string; title: string; projectKey: string } & {
    agent: AgentKind;
  },
): AgentSessionSummary {
  return {
    startedAt: '2026-08-10T09:00:00+02:00',
    lastActivity: NOW,
    durationMs: 1_800_000,
    messageCount: 12,
    gitBranch: 'main',
    model: 'claude-sonnet-4',
    subagents: [],
    contextTokens: 42_000,
    vaultProject: portal.slug,
    ...patch,
  };
}

const WEB_KEY = 'c:/development/demo/kundenportal-web';
const API_KEY = 'c:/development/demo/kundenportal-api';
const FOREIGN_KEY = 'c:/development/demo/fremdes-verzeichnis';

const AGENT_PROJECTS: Record<AgentKind, AgentProject[]> = {
  claude: [
    agentProject({
      key: WEB_KEY,
      name: 'kundenportal-web',
      agent: 'claude',
      vaultProject: portal.slug,
    }),
    agentProject({
      key: API_KEY,
      name: 'kundenportal-api',
      agent: 'claude',
      vaultProject: portal.slug,
    }),
    agentProject({ key: FOREIGN_KEY, name: 'fremdes-verzeichnis', agent: 'claude' }),
  ],
  codex: [
    agentProject({
      key: WEB_KEY,
      name: 'kundenportal-web',
      agent: 'codex',
      vaultProject: portal.slug,
    }),
  ],
};

const AGENT_SESSIONS: Record<string, AgentSessionSummary[]> = {
  [`claude:${WEB_KEY}`]: [
    agentSession({
      id: 's-web',
      title: 'Sitzung im Web-Repo',
      projectKey: WEB_KEY,
      agent: 'claude',
      lastActivity: '2026-08-10T12:00:00+02:00',
    }),
  ],
  [`claude:${API_KEY}`]: [
    agentSession({
      id: 's-api',
      title: 'Sitzung im API-Repo',
      projectKey: API_KEY,
      agent: 'claude',
      lastActivity: '2026-08-10T13:00:00+02:00',
    }),
  ],
  [`claude:${FOREIGN_KEY}`]: [
    agentSession({
      id: 's-fremd',
      title: 'Sitzung in fremdem Verzeichnis',
      projectKey: FOREIGN_KEY,
      agent: 'claude',
      vaultProject: null,
    }),
  ],
  [`codex:${WEB_KEY}`]: [
    agentSession({
      id: 's-codex',
      title: 'Sitzung mit Codex',
      projectKey: WEB_KEY,
      agent: 'codex',
    }),
  ],
};

function todo(patch: Partial<Todo> & { id: string; text: string }): Todo {
  return {
    state: 'open',
    scope: 'work',
    path: portal.path,
    line: 20,
    project: portal.slug,
    projectTitle: portal.title,
    area: null,
    due: null,
    waitingFor: null,
    neededBy: null,
    priority: 0,
    tags: [],
    createdAt: null,
    doneAt: null,
    dueInDays: null,
    ...patch,
  };
}

const overdue = todo({
  id: 'todo-overdue',
  text: 'Ladezeiten der Angebotsliste senken',
  due: '2026-08-08',
  dueInDays: -2,
  priority: 2,
});
const today = todo({
  id: 'todo-today',
  text: 'Abnahmeprotokoll mit Miriam durchgehen',
  due: TODAY,
  dueInDays: 0,
  priority: 3,
});
const someday = todo({
  id: 'todo-someday',
  text: 'Testmandant aufsetzen',
});
const privateTodo = todo({
  id: 'todo-private',
  text: 'Erde und Kompost holen',
  scope: 'private',
  path: hochbeet.path,
  project: hochbeet.slug,
  projectTitle: hochbeet.title,
  due: '2026-08-20',
  dueInDays: 10,
});
const doneTodo = todo({
  id: 'todo-done',
  text: 'Bilder auf WebP umgestellt',
  state: 'done',
  doneAt: '2026-08-06',
});

const TODOS: Todo[] = [overdue, today, someday, doneTodo, privateTodo];

const BODY = [
  '## Stand',
  '',
  'Die neue Angebotsliste liegt auf dem Testsystem.',
  '',
  '## Todos',
  '',
  '- [ ] Ladezeiten der Angebotsliste senken @due:2026-08-08 !!',
  '',
  '## Notizen',
  '',
  '### 2026-08-09',
  '',
  'Testlauf mit Miriam lief durch.',
  '',
].join('\n');

/* Veränderlich, weil genau das der Fall ist, der schiefgeht: der Watcher liest
   die Datei neu, während der Screen offen ist. */
let docHash = 'hash-portal';

/* Ebenfalls veränderlich: die Notiz-Tests lassen `projects:createNote` und
   `projects:removeNote` den Textkörper wirklich verändern, damit der Refetch
   nach dem Schreiben zeigt, was der Hauptprozess laut Mock jetzt hätte. */
let body = BODY;

/* `waiting_on`, wie es in der Datei steht — samt eines Feldes, das die App nicht
   deutet (`ticket`). Genau das muss ein Rückgängig zurückbringen. */
const RAW_WAITING = [
  {
    who: 'Jonas',
    what: 'Fallback für Sitzungen',
    since: '2026-08-06',
    due: '2026-08-08',
    ticket: 'OPS-411',
  },
  { who: 'Miriam', what: 'Abnahmetermin', since: '2026-08-07' },
];

function doc(path: string): VaultDoc {
  return {
    path,
    frontmatter: {
      type: 'project',
      title: 'Kundenportal Relaunch',
      created: '2026-06-19',
      waiting_on: RAW_WAITING,
    },
    body,
    hash: docHash,
    modified: NOW,
    size: 800,
  };
}

// ── Attrappe ─────────────────────────────────────────────────────────────────

/* Die Einstellungen, wie sie `settings:get` liefert. Der Screen liest daraus
   `overview.showEmptySessionsTab` — den Schalter, der den Sitzungen-Tab auch
   ohne zugeordnetes Verzeichnis zeigt. */
function snapshot(overview: Partial<OverviewSettings> = {}): SettingsSnapshot {
  return {
    app: {
      version: 1,
      lastVault: 'C:/vaults/demo',
      recentVaults: [],
      theme: 'dark',
      customization: { background: 'none', appIcon: 'knowledge-garden' },
      uiLanguage: 'de',
      newVaultLanguages: { documents: 'de', conversation: 'de', translateSources: true },
      window: { width: 1440, height: 900 },
      startMinimized: false,
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
    },
  };
}

interface Options {
  projects?: Project[];
  todos?: Todo[];
  extra?: SbHandlers;
  /** Was in den Vault-Einstellungen steht — sonst die Vorgaben. */
  overview?: Partial<OverviewSettings>;
  /** Die Startadresse — fuer die Tieflinks in den Sitzungen-Tab. */
  at?: string;
}

interface Mounted {
  sb: SbMock;
  /** Der Ausschnitt für axe — mit dem `main`, das in der App die Hülle stellt. */
  container: HTMLElement;
}

function mount(options: Options = {}): Mounted {
  const projects = options.projects ?? PROJECTS;
  const todos = options.todos ?? TODOS;
  const handlers: SbHandlers = {
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 12,
      indexedAt: NOW,
      indexing: false,
    }),
    'projects:list': () => projects,
    'projects:get': ({ slug }) => {
      const found = projects.find((entry) => entry.slug === slug);
      return found === undefined ? null : { project: found, doc: doc(found.path) };
    },
    'todos:list': (request) =>
      todos.filter((entry) => request.project === undefined || entry.project === request.project),
    'llm:routing': () => ({ tasks: {}, defaults: {} }),
    'llm:tasks': () => [],
    'settings:get': () => snapshot(options.overview),
    'agents:projects': ({ agent }) => AGENT_PROJECTS[agent],
    'agents:sessions': ({ agent, projectKey }) => AGENT_SESSIONS[`${agent}:${projectKey}`] ?? [],
    'shell:openPath': () => undefined,
    ...options.extra,
  };
  const sb = installSbMock(handlers);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  /* `main` wie in der Hülle (`AppShell`): ohne Landmarke wäre jeder axe-Lauf ein
     Verstoß, der im echten Screen nicht existiert. */
  const rendered = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[options.at ?? '/projects']}>
        <main>
          <ProjectsScreen />
        </main>
        <Location />
        {/* Wie in der Hülle: Meldungen mit Rückgängig gehören zum Screen, nicht
            in ein eigenes Testgerüst. Ohne Meldung rendert er nichts. */}
        <ToastHost />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { sb, container: rendered.container };
}

/** Wartet, bis das Detail steht — die Liste ist vorher da. */
async function detailReady(): Promise<void> {
  await screen.findByLabelText('Projektdetail');
  await waitFor(() => expect(screen.getByLabelText('Status')).toBeTruthy());
}

function callsTo(sb: SbMock, channel: IpcChannel): unknown[] {
  return sb.calls.filter((call) => call.channel === channel).map((call) => call.payload);
}

beforeEach(() => {
  docHash = 'hash-portal';
  body = BODY;
  /* Der Meldungsspeicher lebt außerhalb von React: ohne Leeren trüge der nächste
     Test die Meldung des vorigen. */
  clearToasts();
  freezeTime();
  setLanguage('de');
  document.documentElement.lang = 'de';
  /* jsdom kennt `scrollIntoView` nicht. Ohne Attrappe stirbt die Fehlerkarte an
     der Stelle, an der sie sich in den Sichtbereich holt. */
  Element.prototype.scrollIntoView = () => undefined;
});

// ── Liste ────────────────────────────────────────────────────────────────────

describe('Projektliste', () => {
  it('zeigt die jüngste Spur zuerst und stellt Stagnierendes hinten ab', async () => {
    mount();
    const list = await screen.findByRole('list', { name: 'Projekte' });
    const titles = within(list)
      .getAllByRole('button')
      .map((button) => button.textContent ?? '');

    expect(titles[0]).toContain('Kundenportal Relaunch');
    /* Das stagnierende Projekt steht nicht in der Liste, sondern im Abschnitt
       darunter — und der ist eingeklappt. */
    expect(titles.join(' ')).not.toContain('Datenmigration');
    expect(screen.getByRole('button', { name: /Lange nicht angefasst — 1/ })).toBeTruthy();
  });

  it('klappt die stagnierenden Projekte auf', async () => {
    mount();
    await screen.findByRole('list', { name: 'Projekte' });

    await userEvent.click(screen.getByRole('button', { name: /Lange nicht angefasst — 1/ }));

    expect(screen.getByText('Datenmigration Legacy-CRM')).toBeTruthy();
  });

  it('trennt Arbeit und Privat über das Segment', async () => {
    mount();
    await screen.findByRole('list', { name: 'Projekte' });

    await userEvent.click(screen.getByRole('button', { name: 'Privat' }));

    const list = screen.getByRole('list', { name: 'Projekte' });
    expect(within(list).getByText('Hochbeet für den Balkon')).toBeTruthy();
    expect(within(list).queryByText('Kundenportal Relaunch')).toBeNull();
  });

  it('sucht im Titel und sagt, wenn nichts passt', async () => {
    mount();
    await screen.findByRole('list', { name: 'Projekte' });

    await userEvent.type(screen.getByLabelText('Projekt suchen'), 'hochbeet');
    expect(
      within(screen.getByRole('list', { name: 'Projekte' })).getByText('Hochbeet für den Balkon'),
    ).toBeTruthy();

    await userEvent.clear(screen.getByLabelText('Projekt suchen'));
    await userEvent.type(screen.getByLabelText('Projekt suchen'), 'zebra');
    expect(await screen.findByText(/Kein Projekt passt zu „zebra“/)).toBeTruthy();
  });

  it('zeigt offene Todos, Frist und Alter in der Zeile', async () => {
    mount();
    const list = await screen.findByRole('list', { name: 'Projekte' });
    const row = within(list).getAllByRole('button')[0];

    expect(row?.textContent).toContain('2 offen');
    expect(row?.textContent).toContain('Aug');
  });

  it('markiert per Stern, ohne die Auswahl zu verändern', async () => {
    const { sb } = mount({
      extra: {
        'projects:patch': ({ patch }) => ({ ...portal, favorite: Boolean(patch.favorite) }),
      },
    });
    const list = await screen.findByRole('list', { name: 'Projekte' });
    const star = within(list).getByRole('button', {
      name: new RegExp(`${portal.title}.*Stern markieren`),
    });

    await userEvent.click(star);

    expect(callsTo(sb, 'projects:patch')).toEqual([
      { slug: portal.slug, patch: { favorite: true } },
    ]);
    /* Der Sternklick darf die Zeile nicht auswählen: `go` würde dafür `p` in
       die Adresse schreiben — das darf nicht passieren. */
    expect(query().p).toBeUndefined();
  });

  it('kennt keine Bereichsüberschriften mehr, wenn der Filter auf „Alle" steht', async () => {
    mount();
    const list = await screen.findByRole('list', { name: 'Projekte' });

    expect(within(list).queryByRole('heading', { name: 'Arbeit' })).toBeNull();
    expect(within(list).queryByRole('heading', { name: 'Privat' })).toBeNull();
  });

  it('markiert die oberste Zeile als zuletzt bearbeitet und verliert das bei anderer Sortierung', async () => {
    mount();
    const list = await screen.findByRole('list', { name: 'Projekte' });
    const portalRow = within(list).getByText('Kundenportal Relaunch').closest('li');

    expect(portalRow?.textContent).toContain('Zuletzt bearbeitet');

    await userEvent.selectOptions(screen.getByLabelText('Sortierung'), 'name');

    const portalRowAfter = within(list).getByText('Kundenportal Relaunch').closest('li');
    expect(portalRowAfter?.textContent).not.toContain('Zuletzt bearbeitet');
  });
});

// ── Detail: Status und nächster Schritt ──────────────────────────────────────

describe('Projektdetail', () => {
  it('speichert den nächsten Schritt per Enter und bestätigt es', async () => {
    const { sb } = mount({
      extra: {
        'projects:patch': ({ patch }) => ({ ...portal, nextStep: String(patch.next_step) }),
      },
    });
    await detailReady();

    await userEvent.click(screen.getByRole('button', { name: 'Nächsten Schritt bearbeiten' }));
    const field = screen.getByLabelText('Nächster Schritt');
    await userEvent.clear(field);
    await userEvent.type(field, 'Rollenkonzept mit Stefan klären{Enter}');

    await waitFor(() =>
      expect(callsTo(sb, 'projects:patch')).toEqual([
        {
          slug: portal.slug,
          patch: { next_step: 'Rollenkonzept mit Stefan klären' },
          expectedHash: 'hash-portal',
        },
      ]),
    );
    expect(await screen.findByText('Gespeichert.')).toBeTruthy();
  });

  it('schreibt keinen leeren nächsten Schritt', async () => {
    const { sb } = mount();
    await detailReady();

    await userEvent.click(screen.getByRole('button', { name: 'Nächsten Schritt bearbeiten' }));
    const field = screen.getByLabelText('Nächster Schritt');
    await userEvent.clear(field);
    await userEvent.type(field, '{Enter}');

    expect(callsTo(sb, 'projects:patch')).toEqual([]);
  });

  it('schreibt den Status und sagt, was jetzt in der Datei steht', async () => {
    const { sb } = mount({
      extra: {
        'projects:patch': ({ patch }) => ({ ...portal, status: patch.status ?? portal.status }),
      },
    });
    await detailReady();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'paused');

    await waitFor(() =>
      expect(callsTo(sb, 'projects:patch')).toEqual([
        { slug: portal.slug, patch: { status: 'paused' }, expectedHash: 'hash-portal' },
      ]),
    );
    expect(await screen.findByText('Status steht jetzt auf „Pausiert“.')).toBeTruthy();
  });

  /* Der Prüfstein: eine Bestätigung darf nie behaupten, was nicht passiert ist. */
  it('bestätigt nichts, wenn die Datei zwischenzeitlich geändert wurde', async () => {
    mount({
      extra: {
        'projects:patch': () => {
          throw Object.assign(new Error('Konflikt'), { code: 'conflict' });
        },
      },
    });
    await detailReady();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'paused');

    expect(await screen.findByText(/wurde zwischenzeitlich geändert/)).toBeTruthy();
    expect(screen.queryByText(/Status steht jetzt auf/)).toBeNull();
    /* Das Feld zeigt weiter, was in der Datei steht. */
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('active');
  });

  /* Anders als der Stern in der Liste (kein `expectedHash`, siehe oben) schreibt
     der Stern im Kopf mit dem Hash der geöffneten Datei — das ist der Pfad, der
     das Konflikt-Kriterium der Story deckt. */
  it('markiert das Projekt per Stern im Kopf, mit dem Hash der Datei', async () => {
    const { sb } = mount({
      extra: {
        'projects:patch': ({ patch }) => ({ ...portal, favorite: Boolean(patch.favorite) }),
      },
    });
    await detailReady();
    const detail = screen.getByLabelText('Projektdetail');

    await userEvent.click(
      within(detail).getByRole('button', {
        name: new RegExp(`${portal.title}.*Stern markieren`),
      }),
    );

    expect(callsTo(sb, 'projects:patch')).toEqual([
      { slug: portal.slug, patch: { favorite: true }, expectedHash: 'hash-portal' },
    ]);
  });

  it('bestätigt den Stern nicht still, wenn die Datei zwischenzeitlich geändert wurde', async () => {
    mount({
      extra: {
        'projects:patch': () => {
          throw Object.assign(new Error('Konflikt'), { code: 'conflict' });
        },
      },
    });
    await detailReady();
    const detail = screen.getByLabelText('Projektdetail');

    await userEvent.click(
      within(detail).getByRole('button', {
        name: new RegExp(`${portal.title}.*Stern markieren`),
      }),
    );

    expect(await screen.findByText(/wurde zwischenzeitlich geändert/)).toBeTruthy();
  });

  it('zeigt den Vorschlag mit Begründung und schreibt erst nach der Bestätigung', async () => {
    const withoutStep = { ...portal, nextStep: null };
    const { sb } = mount({
      projects: [withoutStep, legacy, hochbeet],
      extra: {
        'projects:suggestStatus': () => ({
          status: 'waiting',
          nextStep: 'Bei Jonas nachfassen: Fallback für Sitzungen',
          reason: '2 von 3 Todos sind offen. Offen bei Jonas seit 2026-08-06.',
        }),
        'projects:patch': () => withoutStep,
      },
    });
    await detailReady();

    await userEvent.click(screen.getByRole('button', { name: 'Vorschlag holen' }));

    expect(await screen.findByText(/Bei Jonas nachfassen/)).toBeTruthy();
    expect(screen.getByText(/Offen bei Jonas seit 2026-08-06/)).toBeTruthy();
    expect(screen.getByText(/Geschrieben wird erst, wenn du ihn übernimmst/)).toBeTruthy();
    /* Bis hierher wurde nichts geschrieben. */
    expect(callsTo(sb, 'projects:patch')).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Beides übernehmen' }));

    await waitFor(() =>
      expect(callsTo(sb, 'projects:patch')).toEqual([
        {
          slug: portal.slug,
          patch: {
            status: 'waiting',
            next_step: 'Bei Jonas nachfassen: Fallback für Sitzungen',
          },
          expectedHash: 'hash-portal',
          origin: 'suggestion',
        },
      ]),
    );
  });

  /* Derselbe Fallstrick wie in der Wiki-Seite: der Vorschlag ist aus einer
     Fassung gerechnet, die es beim Klick nicht mehr gibt. Gelesen wird deshalb
     der Hash von damals, nicht der von jetzt — sonst nähme der Hauptprozess den
     veralteten Vorschlag an und überschriebe die fremde Änderung still. */
  it('übernimmt einen Vorschlag mit dem Hash von damals, nicht dem von jetzt', async () => {
    const withoutStep = { ...portal, nextStep: null };
    const { sb } = mount({
      projects: [withoutStep, legacy, hochbeet],
      extra: {
        'projects:suggestStatus': () => ({
          status: 'waiting',
          nextStep: 'Bei Jonas nachfassen: Fallback für Sitzungen',
          reason: '2 von 3 Todos sind offen.',
        }),
        'projects:patch': () => withoutStep,
        'todos:toggle': () => ({ ...someday, state: 'done' }),
      },
    });
    await detailReady();

    await userEvent.click(screen.getByRole('button', { name: 'Vorschlag holen' }));
    expect(await screen.findByText(/Bei Jonas nachfassen/)).toBeTruthy();

    /* Ein Haken im selben Projekt schreibt die Datei — der Screen zieht nach. */
    docHash = 'hash-portal-2';
    await userEvent.click(
      screen.getByRole('checkbox', { name: '„Testmandant aufsetzen“ abhaken' }),
    );
    await waitFor(() => expect(callsTo(sb, 'todos:toggle')).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: 'Beides übernehmen' }));

    await waitFor(() => expect(callsTo(sb, 'projects:patch')).toHaveLength(1));
    expect(callsTo(sb, 'projects:patch')[0]).toMatchObject({ expectedHash: 'hash-portal' });
  });

  it('sagt ehrlich, wenn sich kein nächster Schritt ableiten lässt', async () => {
    mount({
      projects: [{ ...portal, nextStep: null }, legacy, hochbeet],
      extra: { 'projects:suggestStatus': () => null },
    });
    await detailReady();

    await userEvent.click(screen.getByRole('button', { name: 'Vorschlag holen' }));

    expect(await screen.findByText(/lässt sich kein nächster Schritt ableiten/)).toBeTruthy();
  });

  it('hakt den richtigen Warte-auf-Eintrag ab', async () => {
    const { sb } = mount({ extra: { 'projects:resolveWaiting': () => portal } });
    await detailReady();

    /* Überfälliges steht oben: Jonas hat Index 0, Miriam Index 1. */
    await userEvent.click(
      screen.getByRole('button', { name: 'Warten auf Miriam als erledigt markieren' }),
    );

    await waitFor(() =>
      expect(callsTo(sb, 'projects:resolveWaiting')).toEqual([{ slug: portal.slug, index: 1 }]),
    );
  });

  /* Der Eintrag verschwindet nach dem Klick aus der Liste. Ohne ein Wort dazu
     sieht das aus wie Löschen — und ohne Rückweg wäre ein Fehlgriff nur in der
     Markdown-Datei zu heilen. */
  it('bestätigt das Abhaken und nimmt es auf Wunsch zurück', async () => {
    const { sb } = mount({
      extra: {
        'projects:resolveWaiting': () => portal,
        'projects:patch': () => portal,
      },
    });
    await detailReady();

    await userEvent.click(
      screen.getByRole('button', { name: 'Warten auf Miriam als erledigt markieren' }),
    );

    expect(await screen.findByText('Warten auf Miriam steht jetzt auf erledigt.')).toBeTruthy();
    /* Die Meldung sagt auch, wo der Eintrag jetzt steht — er ist nicht weg. */
    expect(screen.getByText(/bleibt mit „resolved: true“ in der Projektdatei/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));

    await waitFor(() => expect(callsTo(sb, 'projects:patch')).toHaveLength(1));
    /* Genau die Liste von vor dem Klick, wortwörtlich aus der Datei — samt
       `ticket`, das die App nicht deutet. */
    expect(callsTo(sb, 'projects:patch')[0]).toEqual({
      slug: portal.slug,
      patch: { waiting_on: RAW_WAITING },
    });
  });

  /* D5: die Pflichtangabe ist nur „wer" — „seit" landet trotzdem als heutiges
     Datum in der Datei, weil `asWaiting` es im Hauptprozess verlangt. */
  it('trägt einen Warte-auf-Eintrag mit nur „wer" ein und zeigt ihn sofort in der Liste', async () => {
    let waitingOn = portal.waitingOn;
    const { sb } = mount({
      extra: {
        'projects:get': ({ slug }) => {
          const found = PROJECTS.find((entry) => entry.slug === slug);
          if (found === undefined) return null;
          const project = found.slug === portal.slug ? { ...found, waitingOn } : found;
          return { project, doc: doc(found.path) };
        },
        'projects:patch': () => {
          waitingOn = [...portal.waitingOn, { who: 'Elke', what: '', since: TODAY }];
          return { ...portal, waitingOn };
        },
      },
    });
    await detailReady();

    await userEvent.click(screen.getByRole('button', { name: 'Warten auf hinzufügen' }));
    await userEvent.type(screen.getByLabelText('Auf wen wird gewartet'), 'Elke');
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));

    /* Weder „what" noch „due" stehen im Patch: leer mitgeschickt scheitert
       `asWaiting`s `asText` an jedem Feld, das sie prüft — auch an „what". */
    await waitFor(() =>
      expect(callsTo(sb, 'projects:patch')).toEqual([
        {
          slug: portal.slug,
          patch: { waiting_on: [...RAW_WAITING, { who: 'Elke', since: TODAY }] },
          expectedHash: 'hash-portal',
        },
      ]),
    );
    expect(await screen.findByText('Elke')).toBeTruthy();
  });

  it('bestätigt keinen Warte-auf-Eintrag, wenn die Datei zwischenzeitlich geändert wurde', async () => {
    mount({
      extra: {
        'projects:patch': () => {
          throw Object.assign(new Error('Konflikt'), { code: 'conflict' });
        },
      },
    });
    await detailReady();

    await userEvent.click(screen.getByRole('button', { name: 'Warten auf hinzufügen' }));
    await userEvent.type(screen.getByLabelText('Auf wen wird gewartet'), 'Elke');
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));

    expect(await screen.findByText(/wurde zwischenzeitlich geändert/)).toBeTruthy();
    expect(screen.queryByText('Elke')).toBeNull();
  });

  /* Dasselbe Rückgängig-Muster wie beim Abhaken: die volle Liste von vorher,
     wortwörtlich — samt `ticket`, das die App nicht deutet. */
  it('trägt einen Warte-auf-Eintrag ein und nimmt ihn auf Wunsch zurück, samt uninterpretierter Felder', async () => {
    const { sb } = mount({ extra: { 'projects:patch': () => portal } });
    await detailReady();

    await userEvent.click(screen.getByRole('button', { name: 'Warten auf hinzufügen' }));
    await userEvent.type(screen.getByLabelText('Auf wen wird gewartet'), 'Elke');
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));

    expect(await screen.findByText('Warten auf Elke eingetragen.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));

    await waitFor(() => expect(callsTo(sb, 'projects:patch')).toHaveLength(2));
    expect(callsTo(sb, 'projects:patch')[1]).toEqual({
      slug: portal.slug,
      patch: { waiting_on: RAW_WAITING },
    });
  });

  /* Guardrail 1, leichtgewichtig: der Composer selbst ruft kein Modell. Das
     Detail fragt beim Öffnen bereits `llm:routing`/`llm:tasks` ab (für den
     Vorschlags-Knopf) — genau dieser Aufruf darf durch das Eintragen nicht
     ein zweites Mal passieren. */
  it('trägt einen Warte-auf-Eintrag ohne weiteren Modellaufruf ein', async () => {
    const { sb } = mount({ extra: { 'projects:patch': () => portal } });
    await detailReady();
    const llmCallsBefore = sb.calls.filter((call) => call.channel.startsWith('llm:')).length;

    await userEvent.click(screen.getByRole('button', { name: 'Warten auf hinzufügen' }));
    await userEvent.type(screen.getByLabelText('Auf wen wird gewartet'), 'Elke');
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));

    await waitFor(() => expect(callsTo(sb, 'projects:patch')).toHaveLength(1));
    expect(sb.calls.filter((call) => call.channel.startsWith('llm:'))).toHaveLength(llmCallsBefore);
  });

  it('zeigt Warte-auf mit Person, Sache und Überfälligkeit', async () => {
    mount();
    await detailReady();

    expect(screen.getByText('Jonas')).toBeTruthy();
    expect(screen.getByText('Fallback für Sitzungen')).toBeTruthy();
    expect(screen.getByText('überfällig')).toBeTruthy();
  });

  /* D4: der Umschalter ist weg — Notizen und der Composer stehen von Anfang
     an da, ohne einen Klick, der sie erst hervorholt. */
  it('rendert den Stand als Prosa und zeigt die Notizen sofort, ohne Aufklappen', async () => {
    mount();
    await detailReady();

    expect(screen.getByText('Die neue Angebotsliste liegt auf dem Testsystem.')).toBeTruthy();
    expect(screen.getByText('Testlauf mit Miriam lief durch.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Notizen zeigen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Notizen verbergen' })).toBeNull();
    expect(screen.getByLabelText('Notiz eintragen')).toBeTruthy();
  });

  /* Der Parser lernt beide Schreibweisen der Überschrift: ein Dokument in
     englischer Dokumentsprache trägt „## Notes", nicht „## Notizen" — und
     seine Notizen müssen trotzdem erscheinen. */
  it('zeigt Notizen auch unter der Überschrift „## Notes"', async () => {
    const englishBody = BODY.replace('## Notizen', '## Notes');
    mount({
      extra: {
        'projects:get': ({ slug }) => {
          const found = PROJECTS.find((entry) => entry.slug === slug);
          if (found === undefined) return null;
          return { project: found, doc: { ...doc(found.path), body: englishBody } };
        },
      },
    });
    await detailReady();

    expect(screen.getByText('Testlauf mit Miriam lief durch.')).toBeTruthy();
  });

  /* Trägt eine Datei beide Überschriften, muss die Anzeige dieselbe gewinnen
     lassen, die auch der Schreibweg wählt (`headingFor` in
     `src/core/vault/sections.ts`): die zuerst im Dokument stehende. Sonst
     könnte eine Notiz unter der einen Überschrift landen, während das Panel
     die andere zeigt — beides ein Verstoß gegen „ohne Neuladen sichtbar". */
  it('zeigt bei beiden Überschriften die zuerst im Dokument stehende, wie der Schreibweg', async () => {
    const bothHeadings = BODY.replace(
      '## Notizen\n\n### 2026-08-09\n\nTestlauf mit Miriam lief durch.',
      [
        '## Notes',
        '',
        '### 2026-08-01',
        '',
        'Zuerst im Dokument — muss gewinnen.',
        '',
        '## Notizen',
        '',
        '### 2026-08-09',
        '',
        'Steht später im Dokument — darf nicht gewinnen.',
      ].join('\n'),
    );
    mount({
      extra: {
        'projects:get': ({ slug }) => {
          const found = PROJECTS.find((entry) => entry.slug === slug);
          if (found === undefined) return null;
          return { project: found, doc: { ...doc(found.path), body: bothHeadings } };
        },
      },
    });
    await detailReady();

    expect(screen.getByText('Zuerst im Dokument — muss gewinnen.')).toBeTruthy();
    expect(screen.queryByText('Steht später im Dokument — darf nicht gewinnen.')).toBeNull();
  });

  /* 024: the same widening `sectionKindOf`/`sectionHeadingIn` gave the core
     read side must hold in the renderer's own parser — a project written
     under `en` carries „## Status", not „## Stand", and this panel is the
     only place that shows it. */
  it('zeigt den Stand auch unter der Überschrift „## Status"', async () => {
    const englishBody = BODY.replace('## Stand', '## Status');
    mount({
      extra: {
        'projects:get': ({ slug }) => {
          const found = PROJECTS.find((entry) => entry.slug === slug);
          if (found === undefined) return null;
          return { project: found, doc: { ...doc(found.path), body: englishBody } };
        },
      },
    });
    await detailReady();

    expect(screen.getByText('Die neue Angebotsliste liegt auf dem Testsystem.')).toBeTruthy();
  });

  /* Eine neu eingetragene Notiz steht ohne Neuladen im Panel — der Composer
     ist Teil des Panels, kein separater Weg dorthin. */
  it('zeigt eine neu eingetragene Notiz sofort im Panel und bestätigt es', async () => {
    const { sb } = mount({
      extra: {
        'projects:createNote': ({ slug, text, expectedHash }) => {
          expect(slug).toBe(portal.slug);
          expect(expectedHash).toBe('hash-portal');
          const block = `### 2026-08-10\n\n${String(text)}`;
          docHash = 'hash-portal-2';
          body = `${body}\n${block}\n`;
          return { path: portal.path, hash: docHash, created: false, block };
        },
      },
    });
    await detailReady();

    await userEvent.type(screen.getByLabelText('Notiz eintragen'), 'Neue Notiz zum Testen');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Neue Notiz zum Testen')).toBeTruthy();
    expect(await screen.findByText('Notiz eingetragen.')).toBeTruthy();
    await waitFor(() =>
      expect(callsTo(sb, 'projects:createNote')).toEqual([
        { slug: portal.slug, text: 'Neue Notiz zum Testen', expectedHash: 'hash-portal' },
      ]),
    );
  });

  /* Rückgängig nimmt genau den geschriebenen Block wieder heraus — nicht die
     ganze Notizen-Sektion, nicht Text, den die App nicht gesetzt hat. */
  it('nimmt eine neu eingetragene Notiz auf Wunsch zurück', async () => {
    let writtenBlock = '';
    const { sb } = mount({
      extra: {
        'projects:createNote': ({ text }) => {
          const block = `### 2026-08-10\n\n${String(text)}`;
          writtenBlock = block;
          docHash = 'hash-portal-2';
          body = `${body}\n${block}\n`;
          return { path: portal.path, hash: docHash, created: false, block };
        },
        'projects:removeNote': ({ block }) => {
          expect(block).toBe(writtenBlock);
          docHash = 'hash-portal-3';
          body = body.replace(`\n${block}\n`, '\n');
          return { path: portal.path, hash: docHash, created: false };
        },
      },
    });
    await detailReady();

    await userEvent.type(screen.getByLabelText('Notiz eintragen'), 'Neue Notiz zum Testen');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Notiz eingetragen.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));

    await waitFor(() =>
      expect(callsTo(sb, 'projects:removeNote')).toEqual([
        { slug: portal.slug, block: writtenBlock },
      ]),
    );
    /* Und die Notiz ist wieder weg — nicht nur der Aufruf ist raus, das Panel
       zeigt es auch. */
    await waitFor(() => expect(screen.queryByText('Neue Notiz zum Testen')).toBeNull());
    /* Der Stand von vorher bleibt unberührt. */
    expect(screen.getByText('Testlauf mit Miriam lief durch.')).toBeTruthy();
  });

  it('zeigt Ueberblick und Sitzungen und laesst den Ueberblick ohne Sitzungsdaten', async () => {
    mount();
    await detailReady();

    expect(screen.getByRole('tab', { name: 'Überblick' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Sitzungen' })).toBeTruthy();

    /* Die Arbeitsspur ist mit Story 008 in den Tab gezogen: im Ueberblick
       steht keine Sitzung mehr — weder die Spur noch eine Liste. */
    expect(screen.queryByText('Arbeitsspur')).toBeNull();
    expect(screen.queryByText(/Letzte Spur/)).toBeNull();
    expect(screen.queryByText('Sitzung im Web-Repo')).toBeNull();
  });
});

// ── Herkunft des Status ──────────────────────────────────────────────────────

/* D5: die ruhige Zeile unter dem Statusfeld — wer den Status gesetzt hat, und
   wann. Vier Zustaende: die drei bekannten `by`-Werte aus `status_set` (D4),
   plus der ehrliche Fallback, wenn die Datei nie Provenienz geschrieben hat —
   der greift auf `lastTouch` zurueck statt einen Autor zu raten. */
describe('Herkunft des Status', () => {
  it('zeigt „Von dir gesetzt" mit dem Datum aus der Datei', async () => {
    const withProvenance = { ...portal, statusSet: { at: '2026-08-05', by: 'user' as const } };
    mount({ projects: [withProvenance, legacy, hochbeet] });
    await detailReady();

    expect(await screen.findByText('Von dir gesetzt · 5. Aug. 2026')).toBeTruthy();
  });

  it('zeigt „Aus einem Vorschlag übernommen", wenn ein Vorschlag angenommen wurde', async () => {
    const withProvenance = {
      ...portal,
      statusSet: { at: '2026-08-05', by: 'suggestion' as const },
    };
    mount({ projects: [withProvenance, legacy, hochbeet] });
    await detailReady();

    expect(await screen.findByText('Aus einem Vorschlag übernommen · 5. Aug. 2026')).toBeTruthy();
  });

  it('zeigt „Durch Ablage eingetragen", wenn die Ablage den Status geschrieben hat', async () => {
    const withProvenance = { ...portal, statusSet: { at: '2026-08-05', by: 'filing' as const } };
    mount({ projects: [withProvenance, legacy, hochbeet] });
    await detailReady();

    expect(await screen.findByText('Durch Ablage eingetragen · 5. Aug. 2026')).toBeTruthy();
  });

  it('faellt ehrlich auf die letzte Beruehrung zurueck, wenn keine Herkunft erfasst ist', async () => {
    /* `portal` traegt von Haus aus kein `statusSet` — der Normalfall fuer eine
       Datei, die die Provenienz nie geschrieben hat (altes Format oder von
       Hand editiert). Ein Autor wird dann nicht geraten.

       Seit D6 zeigt `NextStepEditor` denselben Fallbacktext fuer `portal`
       (das ebenfalls kein `nextStepSet` traegt) — deshalb wird hier gezielt
       in `ProjectHead`s eigener Zeile gesucht statt ueber den Text allein. */
    const { container } = mount();
    await detailReady();

    const provenance = container.querySelector('.sb-phead-provenance');
    expect(provenance?.textContent).toBe('Herkunft nicht erfasst · zuletzt berührt heute');
  });
});

// ── Herkunft des nächsten Schritts ────────────────────────────────────────────

/* D6: dieselbe ruhige Zeile wie bei „Herkunft des Status" (D5), jetzt unter dem
   nächsten Schritt — dieselben `project.provenance.*`-Schlüssel, kein eigener
   Satz dafür. Dazu neu: die Warnung, wenn seit dem Eintragen am Projekt
   gearbeitet wurde (`nextStepStale`, D4 hat sie schon korrekt auf `false`
   gesetzt, sobald kein `nextStepSet` vorliegt — daher genügt es, allein auf
   `stale` zu prüfen). Die Vorschlag-Annahme selbst ist oben in „schreibt erst
   nach der Bestätigung" mitgeprüft: der `projects:patch`-Aufruf trägt dort
   jetzt `origin: 'suggestion'`. */
describe('Herkunft des nächsten Schritts', () => {
  it('zeigt „Von dir gesetzt" mit dem Datum aus der Datei', async () => {
    const withProvenance = {
      ...portal,
      nextStepSet: { at: '2026-08-05', by: 'user' as const },
    };
    mount({ projects: [withProvenance, legacy, hochbeet] });
    await detailReady();

    expect(await screen.findByText('Von dir gesetzt · 5. Aug. 2026')).toBeTruthy();
  });

  it('zeigt die Warnung „Möglicherweise veraltet", wenn seither am Projekt gearbeitet wurde', async () => {
    const stale = {
      ...portal,
      nextStepSet: { at: '2026-08-05', by: 'user' as const },
      nextStepStale: true,
    };
    mount({ projects: [stale, legacy, hochbeet] });
    await detailReady();

    expect(await screen.findByText('Möglicherweise veraltet')).toBeTruthy();
    expect(screen.getByText('Seit dem Eintragen hat sich etwas im Projekt getan.')).toBeTruthy();
  });

  it('zeigt die Warnung nicht, wenn der Schritt frisch ist', async () => {
    const fresh = {
      ...portal,
      nextStepSet: { at: '2026-08-05', by: 'user' as const },
      nextStepStale: false,
    };
    mount({ projects: [fresh, legacy, hochbeet] });
    await detailReady();

    expect(screen.queryByText('Möglicherweise veraltet')).toBeNull();
  });

  /* `portal` traegt von Haus aus kein `nextStepSet` — derselbe Normalfall wie
     beim Status. `ProjectHead`s eigene Herkunftszeile faellt fuer denselben
     Bestand auf denselben Text zurueck, deshalb wird hier gezielt in der
     Zeile unter dem naechsten Schritt gesucht statt ueber den Text allein. */
  it('faellt ohne next_step_set auf die letzte Beruehrung zurueck und zeigt keine Veraltung', async () => {
    const { container } = mount();
    await detailReady();

    const provenance = container.querySelector('.sb-nextstep-provenance');
    expect(provenance?.textContent).toBe('Herkunft nicht erfasst · zuletzt berührt heute');
    expect(container.querySelector('.sb-nextstep-stale')).toBeNull();
  });

  /* Ein `next_step_set` kann `next_step` ueberleben: eine Hand-Bearbeitung
     kann den Text loeschen, ohne den Stempel mitzunehmen, oder ein Patch setzt
     `next_step: null` ausdruecklich und stempelt trotzdem, wann das geschah
     (`checkProjectPatch`). Ohne Wert gibt es aber nichts, das „von dir gesetzt"
     oder „veraltet" sein koennte — sonst widerspricht die Zeile der leeren
     Anzeige direkt darueber. */
  it('zeigt weder Herkunft noch Veraltung, wenn next_step leer ist, auch mit next_step_set', async () => {
    const clearedButStamped = {
      ...portal,
      nextStep: null,
      nextStepSet: { at: '2026-08-05', by: 'user' as const },
      nextStepStale: true,
    };
    const { container } = mount({ projects: [clearedButStamped, legacy, hochbeet] });
    await detailReady();

    expect(screen.getByText('Kein nächster Schritt festgelegt')).toBeTruthy();
    expect(container.querySelector('.sb-nextstep-provenance')).toBeNull();
    expect(container.querySelector('.sb-nextstep-stale')).toBeNull();
  });
});

// ── Sitzungen im Projekt ─────────────────────────────────────────────────────

/** Oeffnet das Detail und darin den Sitzungen-Tab. */
async function sessionsTab(): Promise<void> {
  await detailReady();
  await userEvent.click(screen.getByRole('tab', { name: 'Sitzungen' }));
}

describe('Sitzungen im Projekt', () => {
  it('zeigt Spur, Repos und die Sitzungen aller zugeordneten Verzeichnisse', async () => {
    mount();
    await sessionsTab();

    /* Die Dateispur kennt der Index — sie steht ueber allem anderen. */
    expect(await screen.findByText(/Letzte Spur/)).toBeTruthy();
    expect(screen.getByText('C:/development/demo/kundenportal-web')).toBeTruthy();

    /* Beide Arbeitsverzeichnisse des Projekts, in einer Liste, juengste zuerst. */
    const api = await screen.findByText('Sitzung im API-Repo');
    const web = screen.getByText('Sitzung im Web-Repo');
    expect(api.compareDocumentPosition(web) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    /* Und nur die: ein fremdes Verzeichnis gehoert nicht zu diesem Projekt. */
    expect(screen.queryByText('Sitzung in fremdem Verzeichnis')).toBeNull();
  });

  it('zeigt nach dem Umschalten die Codex-Sitzungen', async () => {
    mount();
    await sessionsTab();
    await screen.findByText('Sitzung im Web-Repo');

    await userEvent.click(screen.getByRole('tab', { name: 'Codex' }));

    expect(await screen.findByText('Sitzung mit Codex')).toBeTruthy();
    expect(screen.queryByText('Sitzung im Web-Repo')).toBeNull();
    await waitFor(() => expect(query()['a']).toBe('codex'));
  });

  /* Der Pruefstein fuer `go`: die Adresse dieses Screens kannte bisher nur
     `p` und `tab`. Faellt `s` (oder `a`) beim Bauen unter den Tisch, oeffnet
     kein Klick mehr ein Transkript — still, mit gruener Liste. */
  it('nimmt a und s in die Adresse auf und oeffnet das Transkript', async () => {
    mount({
      at: '/projects?p=kundenportal-relaunch&tab=sessions&a=codex',
      extra: {
        'agents:transcript': () => ({
          entries: [
            {
              id: 'e1',
              kind: 'assistant' as const,
              at: NOW,
              text: 'Der Verlauf dieser Sitzung',
              toolName: null,
              toolTarget: null,
              raw: null,
            },
          ],
          nextCursor: null,
          totalKnown: true,
        }),
      },
    });
    await detailReady();

    await userEvent.click(await screen.findByRole('button', { name: /Sitzung mit Codex öffnen/ }));

    await waitFor(() =>
      expect(query()).toEqual({
        p: portal.slug,
        tab: 'sessions',
        a: 'codex',
        s: 's-codex',
      }),
    );
    expect(await screen.findByText('Der Verlauf dieser Sitzung')).toBeTruthy();

    /* Und zurueck: `s` faellt weg, die Wahl der CLI bleibt. */
    await userEvent.click(screen.getByRole('button', { name: 'Zurück zu den Sitzungen' }));
    await waitFor(() => expect(query()).toEqual({ p: portal.slug, tab: 'sessions', a: 'codex' }));
    expect(await screen.findByText('Sitzung mit Codex')).toBeTruthy();
  });

  /* Eine offene Sitzung gehoert zu genau einem Projekt. Beim Wechsel muss sie
     aus der Adresse fallen — sonst zeigte das neue Projekt ein Transkript,
     das gar nicht zu ihm gehoert. Der Tab bleibt, die Sitzung geht. */
  it('laesst die offene Sitzung beim Projektwechsel fallen', async () => {
    mount({ at: '/projects?p=kundenportal-relaunch&tab=sessions&s=s-web' });
    await detailReady();

    /* Anker am Anfang: der Stern trägt denselben Titel im Label, aber
       eingeleitet von „ statt vom Titel selbst. */
    await userEvent.click(await screen.findByRole('button', { name: /^Hochbeet für den Balkon/ }));

    await waitFor(() => expect(query()).toEqual({ p: hochbeet.slug, tab: 'sessions' }));
  });

  it('sagt ehrlich, wenn die Sitzung aus der Adresse nicht in der Liste steht', async () => {
    mount({ at: '/projects?p=kundenportal-relaunch&tab=sessions&s=gibt-es-nicht' });
    await detailReady();

    expect(await screen.findByText('Sitzung nicht gefunden')).toBeTruthy();
  });

  it('zeigt einen Ladezustand, solange die Verzeichnisse fehlen', async () => {
    const { container } = mount({
      at: '/projects?p=kundenportal-relaunch&tab=sessions',
      /* Nie beantwortet: der Tab muss warten, nicht „nichts gefunden" sagen. */
      extra: { 'agents:projects': () => new Promise(() => undefined) },
    });
    await detailReady();

    expect(await screen.findByText(/Letzte Spur/)).toBeTruthy();
    await waitFor(() => expect(container.querySelector('.sb-skeleton')).toBeTruthy());
    expect(screen.queryByText(/Kein Arbeitsverzeichnis/)).toBeNull();
  });

  it('bietet nach einem Fehler einen neuen Versuch an', async () => {
    let calls = 0;
    mount({
      at: '/projects?p=kundenportal-relaunch&tab=sessions',
      extra: {
        'agents:projects': ({ agent }) => {
          calls += 1;
          if (calls === 1) throw Object.assign(new Error('kaputt'), { code: 'io' });
          return AGENT_PROJECTS[agent];
        },
      },
    });
    await detailReady();

    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByText('Sitzung im Web-Repo')).toBeTruthy();
  });

  /* Ein eingestelltes Verzeichnis, das es nicht gibt, ist etwas anderes als
     „nichts gefunden": nur der Nutzer kann es richten, also steht der Pfad da
     — und der Weg dorthin. */
  it('nennt das fehlende Verzeichnis und den Weg in die Einstellungen', async () => {
    mount({
      at: '/projects?p=kundenportal-relaunch&tab=sessions',
      extra: {
        'agents:projects': () => {
          throw Object.assign(new Error('gibt es nicht: C:/falsch/pfad'), {
            code: 'not-found',
            detail: { missingDir: 'C:/falsch/pfad' },
          });
        },
      },
    });
    await detailReady();

    expect(await screen.findByText('Verzeichnis nicht gefunden')).toBeTruthy();
    expect(screen.getByText(/C:\/falsch\/pfad/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Einstellungen öffnen' }));
    expect(screen.getByTestId('location').textContent).toBe('/settings?tab=behavior');
  });

  it('unterscheidet „kein Verzeichnis zugeordnet" von „keine Sitzung"', async () => {
    mount({
      at: '/projects?p=kundenportal-relaunch&tab=sessions',
      /* Ohne zugeordnetes Verzeichnis bietet das Detail den Tab gar nicht erst
         an — der Schalter holt ihn hervor, und darin steht dieser Zustand. */
      overview: { showEmptySessionsTab: true },
      extra: { 'agents:projects': () => [] },
    });
    await detailReady();

    expect(
      await screen.findByText(/Kein Arbeitsverzeichnis von Claude Code gehört zu diesem Projekt/),
    ).toBeTruthy();
    expect(screen.queryByText(/Keine Sitzung von/)).toBeNull();
  });

  it('sagt, wenn ein zugeordnetes Verzeichnis keine Sitzung hat', async () => {
    mount({
      at: '/projects?p=kundenportal-relaunch&tab=sessions',
      extra: { 'agents:sessions': () => [] },
    });
    await detailReady();

    expect(
      await screen.findByText('Keine Sitzung von Claude Code in diesem Projekt aufgezeichnet.'),
    ).toBeTruthy();
  });

  /* Guardrail 1: der Tab liest Dateien, mehr nicht. Ohne Modell ist er
     vollstaendig — und er fragt gar nicht erst nach einem. */
  it('kommt ohne eingerichtetes Modell aus', async () => {
    const { sb } = mount({
      at: '/projects?p=kundenportal-relaunch&tab=sessions',
      extra: {
        'llm:routing': () => {
          throw Object.assign(new Error('kein Modell'), { code: 'llm-unavailable' });
        },
        'llm:tasks': () => {
          throw Object.assign(new Error('kein Modell'), { code: 'llm-unavailable' });
        },
      },
    });
    await detailReady();

    expect(await screen.findByText('Sitzung im Web-Repo')).toBeTruthy();
    expect(sb.calls.filter((call) => call.channel.startsWith('llm:'))).toEqual([]);
  });
});

// ── Sitzungen-Tab: verbergen und hervorholen ─────────────────────────────────

/* Ein Tab, in dem nichts steht, ist kein Angebot: ohne zugeordnetes
   Arbeitsverzeichnis bietet das Detail ihn gar nicht erst an. Wer ihn trotzdem
   sehen will, schaltet ihn in der Filterleiste ein — einmal fuer alle Projekte
   und ueber `settings:setVault`, also auch nach einem Neustart noch. Das
   Hochbeet ist der Fall ohne Zuordnung: kein repo, kein Arbeitsverzeichnis
   einer CLI. */
describe('Sitzungen-Tab: verbergen und hervorholen', () => {
  const HOCHBEET = '/projects?p=hochbeet-bauen';

  it('bietet den Tab nicht an, wenn kein Verzeichnis zugeordnet ist', async () => {
    const { sb } = mount({ at: HOCHBEET });
    await detailReady();

    expect(screen.queryByRole('tab', { name: 'Sitzungen' })).toBeNull();

    /* Auch nicht, nachdem beide CLIs geantwortet haben: der Tab darf nicht
       aufblitzen — weder auftauchen noch wieder verschwinden. */
    await waitFor(() => expect(callsTo(sb, 'agents:projects')).toHaveLength(2));
    expect(await screen.findByRole('tab', { name: 'Überblick' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Sitzungen' })).toBeNull();
  });

  it('bietet den Tab nicht an, wenn weder repo noch CLI das Projekt kennt', async () => {
    const { sb } = mount({
      /* Ohne `repos` erklaert das Projekt selbst keine Zuordnung — und die
         CLIs melden keine, die auf es zeigt. Das ist der Fall, in dem der Tab
         wirklich leer bliebe. */
      projects: [{ ...portal, repos: [] }, legacy, hochbeet],
      extra: { 'agents:projects': () => [] },
    });
    await detailReady();

    await waitFor(() => expect(callsTo(sb, 'agents:projects')).toHaveLength(2));
    expect(screen.queryByRole('tab', { name: 'Sitzungen' })).toBeNull();
  });

  it('bietet den Tab bei zugeordnetem Verzeichnis auch ohne Schalter an', async () => {
    mount({ overview: { showEmptySessionsTab: false } });
    await detailReady();

    expect(screen.getByRole('tab', { name: 'Sitzungen' })).toBeTruthy();
  });

  /* Guardrail 1: ausgeschaltetes Mitlesen laesst `agents:projects` ehrlich
     leer zurueckkommen. Wuerde das Detail daraus „nicht zugeordnet" lesen,
     verschwaende der Tab genau dann, wenn der Nutzer den Zustand braucht, der
     die abgeschaltete Einstellung benennt — still, ohne ein Wort. */
  it('behaelt den Tab bei ausgeschaltetem Mitlesen und sagt darin, warum', async () => {
    const { sb } = mount({
      at: '/projects?p=kundenportal-relaunch&tab=sessions',
      overview: { useClaudeSessions: false, useCodexSessions: false },
      /* So antwortet der Hauptprozess bei ausgeschaltetem Mitlesen. */
      extra: { 'agents:projects': () => [] },
    });
    await detailReady();

    /* Erst wenn beide CLIs geantwortet haben, ist die Aussage geprueft: bis
       dahin stuende der Tab auch dann noch da, wenn er gleich verschwaende. */
    await waitFor(() => expect(callsTo(sb, 'agents:projects')).toHaveLength(2));
    expect(await screen.findByText('Mitlesen ist ausgeschaltet')).toBeTruthy();

    /* Das Kundenportal nennt ein repo — die Zuordnung steht in der Datei,
       unabhaengig davon, ob eine CLI gelesen werden darf. */
    expect(screen.getByRole('tab', { name: 'Sitzungen' })).toBeTruthy();
    /* Und keine der beiden Luegen: weder „nichts gefunden" noch „nichts
       zugeordnet". */
    expect(screen.queryByText(/Keine Sitzung von/)).toBeNull();
    expect(screen.queryByText('Kein Arbeitsverzeichnis zugeordnet')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Einschalten' }));
    expect(screen.getByTestId('location').textContent).toBe('/settings?tab=behavior');
  });

  it('holt den leeren Tab per Schalter hervor und fuehrt zum Zuordnen', async () => {
    mount({ at: HOCHBEET, overview: { showEmptySessionsTab: true } });
    await detailReady();

    await userEvent.click(await screen.findByRole('tab', { name: 'Sitzungen' }));

    /* Der Tab sagt, was fehlt — und wo es behoben wird. */
    expect(await screen.findByText('Kein Arbeitsverzeichnis zugeordnet')).toBeTruthy();
    expect(screen.getByText(/Unter „Alle Sitzungen“ ordnest du diesem Projekt/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Verzeichnis zuordnen' }));
    expect(screen.getByTestId('location').textContent).toBe('/projects/sessions');
  });

  it('schreibt den Schalter in die Vault-Einstellungen und wirkt sofort', async () => {
    const { sb } = mount({
      at: HOCHBEET,
      extra: {
        'settings:setVault': ({ patch }) =>
          snapshot({ showEmptySessionsTab: patch.overview?.showEmptySessionsTab === true }),
      },
    });
    await detailReady();

    const toggle = screen.getByLabelText('Sitzungen-Tab immer zeigen');
    await waitFor(() => expect((toggle as HTMLInputElement).disabled).toBe(false));
    await userEvent.click(toggle);

    /* Genau dieser Nutzinhalt macht „ueberlebt den Neustart" wahr: die
       Einstellung geht in die Vault-Datei, ueber den vorhandenen Kanal. */
    await waitFor(() =>
      expect(callsTo(sb, 'settings:setVault')).toEqual([
        { patch: { overview: { showEmptySessionsTab: true } } },
      ]),
    );
    expect(await screen.findByRole('tab', { name: 'Sitzungen' })).toBeTruthy();
  });

  it('zeigt den gespeicherten Schalter schon beim ersten Rendern', async () => {
    mount({ at: HOCHBEET, overview: { showEmptySessionsTab: true } });
    await detailReady();

    await waitFor(() =>
      expect(
        (screen.getByLabelText('Sitzungen-Tab immer zeigen') as HTMLInputElement).checked,
      ).toBe(true),
    );
    expect(screen.getByRole('tab', { name: 'Sitzungen' })).toBeTruthy();
  });

  it('faellt bei tab=sessions ohne angebotenen Tab auf den Ueberblick zurueck', async () => {
    mount({ at: '/projects?p=hochbeet-bauen&tab=sessions' });
    await detailReady();

    expect(screen.getByRole('tab', { name: 'Überblick' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.queryByRole('tab', { name: 'Sitzungen' })).toBeNull();
    expect(screen.queryByText('Arbeitsspur')).toBeNull();
    /* Die Adresse bleibt, wie sie ist — sie gehoert dem Screen, und mit dem
       Schalter fuehrt derselbe Link wieder in den Tab. */
    expect(query()).toEqual({ p: hochbeet.slug, tab: 'sessions' });
  });
});

// ── Todos ────────────────────────────────────────────────────────────────────

describe('Todos im Projekt', () => {
  it('blendet erledigte Todos standardmäßig aus und zeigt sie über die Kopfzeile', async () => {
    mount();
    await detailReady();

    const toggle = screen.getByLabelText('Erledigte zeigen') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.queryByText(doneTodo.text)).toBeNull();

    await userEvent.click(toggle);
    expect(screen.getByText(doneTodo.text)).toBeTruthy();
  });

  it('zeigt Todo hinzufügen vor den bestehenden Einträgen', async () => {
    mount();
    await detailReady();

    const add = screen.getByRole('button', { name: 'Todo hinzufügen' });
    const firstTodo = screen.getByText(overdue.text);
    expect(add.compareDocumentPosition(firstTodo) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('hakt ein Todo ab', async () => {
    const { sb } = mount({ extra: { 'todos:toggle': () => ({ ...someday, state: 'done' }) } });
    await detailReady();

    await userEvent.click(
      await screen.findByRole('checkbox', { name: '„Testmandant aufsetzen“ abhaken' }),
    );

    await waitFor(() => expect(callsTo(sb, 'todos:toggle')).toEqual([{ id: someday.id }]));
  });

  it('legt ein Todo mit Frist heute an', async () => {
    const { sb } = mount({ extra: { 'todos:create': ({ text }) => todo({ id: 'neu', text }) } });
    await detailReady();

    await userEvent.click(screen.getByRole('button', { name: 'Todo hinzufügen' }));
    await userEvent.type(screen.getByLabelText('Neues Todo'), 'Sitzungs-Fallback testen');
    const priority = screen.getByRole('group', { name: 'Priorität des neuen Todos' });
    expect(
      within(priority).getByRole('button', { name: 'Medium' }).getAttribute('aria-pressed'),
    ).toBe('true');
    await userEvent.click(screen.getAllByRole('button', { name: 'heute' })[0] as HTMLElement);
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() =>
      expect(callsTo(sb, 'todos:create')).toEqual([
        {
          text: 'Sitzungs-Fallback testen',
          scope: 'work',
          project: portal.slug,
          due: '2026-08-10',
          priority: 2,
        },
      ]),
    );
  });

  /* Ein Feld, das sich beim Fehlschlag leert, hätte den Text verschluckt. */
  it('behält den Text, wenn das Anlegen scheitert', async () => {
    mount({
      extra: {
        'todos:create': () => {
          throw Object.assign(new Error('Konflikt'), { code: 'conflict' });
        },
      },
    });
    await detailReady();

    await userEvent.click(screen.getByRole('button', { name: 'Todo hinzufügen' }));
    await userEvent.type(screen.getByLabelText('Neues Todo'), 'Sitzungs-Fallback testen{Enter}');

    expect(await screen.findByText(/wurde zwischenzeitlich geändert/)).toBeTruthy();
    expect((screen.getByLabelText('Neues Todo') as HTMLInputElement).value).toBe(
      'Sitzungs-Fallback testen',
    );
  });

  it('bearbeitet Text, Frist und Priorität nachträglich', async () => {
    const { sb } = mount({
      extra: {
        'todos:update': () => ({
          ...someday,
          text: 'Testmandant vorbereiten',
          due: TODAY,
          priority: 3,
        }),
      },
    });
    await detailReady();

    await userEvent.click(
      screen.getByRole('button', { name: '„Testmandant aufsetzen“ bearbeiten' }),
    );
    await userEvent.clear(screen.getByLabelText('Todo-Text'));
    await userEvent.type(screen.getByLabelText('Todo-Text'), 'Testmandant vorbereiten');
    await userEvent.click(screen.getAllByRole('button', { name: 'heute' })[0] as HTMLElement);
    const priority = screen.getByRole('group', {
      name: 'Priorität von „Testmandant aufsetzen“ ändern',
    });
    expect(
      within(priority).getByRole('button', { name: 'Medium' }).getAttribute('aria-pressed'),
    ).toBe('true');
    await userEvent.click(within(priority).getByRole('button', { name: 'High' }));
    /* Gescoped auf die Todo-Zeile: der Notiz-Composer trägt seit D4 dieselbe
       Beschriftung auf seinem eigenen Speichern-Knopf. */
    const editRow = screen.getByLabelText('Todo-Text').closest('li') as HTMLElement;
    await userEvent.click(within(editRow).getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(callsTo(sb, 'todos:update')).toEqual([
        {
          id: someday.id,
          text: 'Testmandant vorbereiten',
          due: '2026-08-10',
          priority: 3,
        },
      ]),
    );
  });

  it('behält die bearbeitete Fassung bei einem Schreibkonflikt', async () => {
    mount({
      extra: {
        'todos:update': () => {
          throw Object.assign(new Error('Konflikt'), { code: 'conflict' });
        },
      },
    });
    await detailReady();

    await userEvent.click(
      screen.getByRole('button', { name: '„Testmandant aufsetzen“ bearbeiten' }),
    );
    await userEvent.clear(screen.getByLabelText('Todo-Text'));
    await userEvent.type(screen.getByLabelText('Todo-Text'), 'Meine überarbeitete Fassung');
    /* Gescoped auf die Todo-Zeile: der Notiz-Composer trägt seit D4 dieselbe
       Beschriftung auf seinem eigenen Speichern-Knopf. */
    const editRow = screen.getByLabelText('Todo-Text').closest('li') as HTMLElement;
    await userEvent.click(within(editRow).getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText(/wurde zwischenzeitlich geändert/)).toBeTruthy();
    expect((screen.getByLabelText('Todo-Text') as HTMLInputElement).value).toBe(
      'Meine überarbeitete Fassung',
    );
  });

  it('sortiert Projekt-Todos per Drag-and-drop um', async () => {
    const { sb } = mount({ extra: { 'todos:reorder': () => TODOS } });
    await detailReady();

    const handle = screen.getByRole('button', { name: '„Testmandant aufsetzen“ umsortieren' });
    const target = screen
      .getByRole('button', { name: '„Ladezeiten der Angebotsliste senken“ umsortieren' })
      .closest('li');
    const transfer = {
      effectAllowed: 'none',
      setData: vi.fn(),
      getData: vi.fn(() => someday.id),
    };
    fireEvent.dragStart(handle, { dataTransfer: transfer });
    fireEvent.dragOver(target as HTMLElement, { dataTransfer: transfer, clientY: 0 });
    expect(target?.classList.contains('sb-todorow--drop-before')).toBe(true);
    fireEvent.drop(target as HTMLElement, { dataTransfer: transfer, clientY: 0 });
    expect(target?.classList.contains('sb-todorow--drop-before')).toBe(false);

    await waitFor(() =>
      expect(callsTo(sb, 'todos:reorder')).toEqual([
        { ids: [someday.id, overdue.id, today.id, doneTodo.id] },
      ]),
    );
  });

  it('scrollt das Projektdetail beim Ziehen eines Todos am oberen Rand', async () => {
    mount();
    await detailReady();

    const detail = screen.getByLabelText('Projektdetail');
    detail.style.overflowY = 'auto';
    Object.defineProperties(detail, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    detail.scrollTop = 300;
    detail.getBoundingClientRect = () => ({ top: 100, bottom: 500, height: 400 }) as DOMRect;

    let nextFrame: FrameRequestCallback | null = null;
    const requestFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        nextFrame = callback;
        return 17;
      });
    const cancelFrame = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);

    try {
      const handle = screen.getByRole('button', { name: '„Testmandant aufsetzen“ umsortieren' });
      const target = screen
        .getByRole('button', { name: '„Ladezeiten der Angebotsliste senken“ umsortieren' })
        .closest('li');
      const transfer = {
        effectAllowed: 'none',
        setData: vi.fn(),
        getData: vi.fn(() => someday.id),
      };

      fireEvent.dragStart(handle, { dataTransfer: transfer });
      fireEvent.dragOver(target as HTMLElement, { dataTransfer: transfer, clientY: 110 });
      window.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 110 }));
      expect(nextFrame).not.toBeNull();
      (nextFrame as unknown as FrameRequestCallback)(0);

      expect(detail.scrollTop).toBeLessThan(300);
      fireEvent.dragEnd(handle, { dataTransfer: transfer });
      expect(cancelFrame).toHaveBeenCalledWith(17);
    } finally {
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
    }
  });

  it('erklärt im Leerzustand die Inline-Marker', async () => {
    mount({ todos: [] });
    await detailReady();

    expect(await screen.findByText(/@due:2026-08-20 für die Frist/)).toBeTruthy();
  });
});

// ── Alle Todos ───────────────────────────────────────────────────────────────

describe('Alle Todos', () => {
  async function openTab(options: Options = {}): Promise<SbMock> {
    const { sb } = mount(options);
    await screen.findByRole('list', { name: 'Projekte' });
    await userEvent.click(screen.getByRole('tab', { name: 'Alle Todos' }));
    return sb;
  }

  it('trennt Bereiche und gruppiert nach Fälligkeit', async () => {
    await openTab();

    const work = await screen.findByRole('heading', { name: 'Arbeit' });
    const workPanel = work.closest('.sb-panel') as HTMLElement;
    const privatePanel = screen
      .getByRole('heading', { name: 'Privat' })
      .closest('.sb-panel') as HTMLElement;

    expect(within(workPanel).getByText('Überfällig')).toBeTruthy();
    expect(within(workPanel).getByText('Heute')).toBeTruthy();
    expect(within(workPanel).getByText('Ohne Frist')).toBeTruthy();
    expect(within(workPanel).getByText('Ladezeiten der Angebotsliste senken')).toBeTruthy();
    /* Privates gehört nicht in die Arbeit. */
    expect(within(workPanel).queryByText('Erde und Kompost holen')).toBeNull();
    expect(within(privatePanel).getByText('Erde und Kompost holen')).toBeTruthy();
    expect(within(privatePanel).getByText('Später')).toBeTruthy();
  });

  it('sortiert innerhalb einer Fälligkeitsgruppe High vor Medium vor Low', async () => {
    const low = todo({
      id: 'todo-low',
      text: 'Low zuerst fällig',
      due: '2026-08-11',
      dueInDays: 1,
      priority: 1,
    });
    const medium = todo({
      id: 'todo-medium',
      text: 'Medium mittig fällig',
      due: '2026-08-13',
      dueInDays: 3,
      priority: 2,
    });
    const high = todo({
      id: 'todo-high',
      text: 'High zuletzt fällig',
      due: '2026-08-16',
      dueInDays: 6,
      priority: 3,
    });

    await openTab({ todos: [low, medium, high] });

    const workPanel = (await screen.findByRole('heading', { name: 'Arbeit' })).closest(
      '.sb-panel',
    ) as HTMLElement;
    const highText = within(workPanel).getByText(high.text);
    const mediumText = within(workPanel).getByText(medium.text);
    const lowText = within(workPanel).getByText(low.text);

    expect(
      highText.compareDocumentPosition(mediumText) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(mediumText.compareDocumentPosition(lowText) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0,
    );
  });

  it('zeigt Erledigte erst auf Wunsch', async () => {
    await openTab();
    await screen.findByRole('heading', { name: 'Arbeit' });

    expect(screen.queryByText('Bilder auf WebP umgestellt')).toBeNull();
    await userEvent.click(screen.getByLabelText('Erledigte zeigen'));
    expect(screen.getByText('Bilder auf WebP umgestellt')).toBeTruthy();
  });

  it('legt ein Todo ohne Projekt im gewählten Bereich an', async () => {
    const sb = await openTab({
      extra: { 'todos:create': ({ text }) => todo({ id: 'neu', text }) },
    });
    await screen.findByRole('heading', { name: 'Privat' });
    const privatePanel = screen
      .getByRole('heading', { name: 'Privat' })
      .closest('.sb-panel') as HTMLElement;

    const add = within(privatePanel).getByRole('button', { name: 'Todo hinzufügen' });
    const firstTodo = within(privatePanel).getByText(privateTodo.text);
    expect(add.compareDocumentPosition(firstTodo) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    await userEvent.click(add);
    await userEvent.type(within(privatePanel).getByLabelText('Neues Todo'), 'Balkon kehren{Enter}');

    await waitFor(() =>
      expect(callsTo(sb, 'todos:create')).toEqual([
        { text: 'Balkon kehren', scope: 'private', project: null, due: null, priority: 2 },
      ]),
    );
  });

  it('erklärt den Leerzustand mit den Markern', async () => {
    await openTab({ todos: [] });

    expect(await screen.findByText('Kein Todo im Vault')).toBeTruthy();
    expect(screen.getByText(/@wait:Name für „warte auf“/)).toBeTruthy();
  });
});

// ── Leerzustand, Anlegen, Tastatur ───────────────────────────────────────────

describe('Ohne Projekt', () => {
  it('erklärt, was ein Projekt hier ist, und legt eines an', async () => {
    const { sb } = mount({
      projects: [],
      extra: { 'projects:create': ({ title, scope }) => project({ slug: 'neu', title, scope }) },
    });

    expect(await screen.findByText('Noch kein Projekt im Vault')).toBeTruthy();
    expect(screen.getByText(/Wiedereinstieg nach einer Pause/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Projekt anlegen' }));
    await userEvent.type(screen.getByLabelText('Titel'), 'Küche renovieren');
    expect(screen.getByText(/projects\/work\/kueche-renovieren\/project.md/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() =>
      expect(callsTo(sb, 'projects:create')).toEqual([
        { title: 'Küche renovieren', scope: 'work', status: 'idea' },
      ]),
    );
  });
});

describe('Tastatur', () => {
  it('bewegt die Auswahl mit j und öffnet den Dialog mit n', async () => {
    mount();
    await detailReady();

    await userEvent.keyboard('j');
    await waitFor(() =>
      expect(screen.getAllByText('Hochbeet für den Balkon').length).toBeGreaterThan(0),
    );

    await userEvent.keyboard('n');
    expect(await screen.findByRole('dialog', { name: 'Neues Projekt' })).toBeTruthy();
  });

  it('hakt mit x das fokussierte Todo ab', async () => {
    const { sb } = mount({ extra: { 'todos:toggle': () => ({ ...someday, state: 'done' }) } });
    await detailReady();

    const box = await screen.findByRole('checkbox', { name: '„Testmandant aufsetzen“ abhaken' });
    box.focus();
    await userEvent.keyboard('x');

    await waitFor(() => expect(callsTo(sb, 'todos:toggle')).toEqual([{ id: someday.id }]));
  });

  it('fokussiert mit m das Notizfeld', async () => {
    mount();
    await detailReady();

    const noteField = await screen.findByLabelText('Notiz eintragen');
    expect(document.activeElement).not.toBe(noteField);

    await userEvent.keyboard('m');

    expect(document.activeElement).toBe(noteField);
  });

  it('öffnet mit w den Warte-auf-Composer und fokussiert das Feld', async () => {
    mount();
    await detailReady();

    expect(screen.getByRole('button', { name: 'Warten auf hinzufügen' })).toBeTruthy();

    await userEvent.keyboard('w');

    const whoField = await screen.findByLabelText('Auf wen wird gewartet');
    expect(document.activeElement).toBe(whoField);
    expect(screen.queryByRole('button', { name: 'Warten auf hinzufügen' })).toBeNull();
  });

  it('lässt m und w beim Tippen in einem Feld unberührt', async () => {
    mount();
    await detailReady();

    await userEvent.keyboard('t');
    const todoField = await screen.findByLabelText('Neues Todo');
    await userEvent.type(todoField, 'x');

    await userEvent.keyboard('m');
    await userEvent.keyboard('w');

    /* m/w landen als gewöhnliche Zeichen im fokussierten Feld statt als
       Kürzel zu wirken — sonst hätte der Fokus das Feld verlassen oder der
       Warte-auf-Composer wäre aufgegangen. */
    expect((todoField as HTMLInputElement).value).toBe('xmw');
    expect(document.activeElement).toBe(todoField);
    expect(screen.getByRole('button', { name: 'Warten auf hinzufügen' })).toBeTruthy();
  });
});

// ── A11y ─────────────────────────────────────────────────────────────────────

describe('A11y', () => {
  it('hat keinen Verstoß in Liste und Detail', async () => {
    const { container } = mount();
    await detailReady();
    await expectNoA11yViolations(container);
  });

  it('hat keinen Verstoß in der Todo-Ansicht', async () => {
    const { container } = mount();
    await screen.findByRole('list', { name: 'Projekte' });
    await userEvent.click(screen.getByRole('tab', { name: 'Alle Todos' }));
    await screen.findByRole('heading', { name: 'Arbeit' });
    await expectNoA11yViolations(container);
  });

  it('hat keinen Verstoß im Sitzungen-Tab', async () => {
    const { container } = mount();
    await sessionsTab();
    await screen.findByText('Sitzung im Web-Repo');
    await expectNoA11yViolations(container);
  });

  it('hat keinen Verstoß im Dialog', async () => {
    mount();
    await screen.findByRole('list', { name: 'Projekte' });
    await userEvent.click(screen.getByRole('button', { name: 'Neues Projekt' }));
    /* Der Dialog liegt als Overlay ausserhalb des Screens — deshalb der Body. */
    await expectNoA11yViolations(await screen.findByRole('dialog', { name: 'Neues Projekt' }));
  });
});
