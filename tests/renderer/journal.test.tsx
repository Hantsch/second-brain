// @vitest-environment jsdom
/* Das Tagebuch als Arbeitsfläche: Tage wählen, den Tag schreiben, reden,
 * abschließen.
 *
 * Die Prüfsteine dieses Screens sind nicht „lässt sich klicken", sondern:
 *
 * - Der Haltungswechsel steht im **nächsten** Aufruf — sonst spricht man mit
 *   jemand anderem als angezeigt.
 * - Die Vertraulichkeitszeile nennt den Provider bei einer fremden Route und
 *   stellt bei einer lokalen fest, dass es der eigene Rechner ist.
 * - Ohne Modell wird der Eintrag geschrieben und **keine Antwort erfunden**; im
 *   Modus „analysieren" stehen die gefundenen früheren Stellen da.
 * - Der Tagestext friert Wert **und** Hash beim Öffnen ein; eine fremde Änderung
 *   wird sichtbar gemeldet, statt still überschrieben zu werden.
 * - Der Tagesabschluss schreibt erst nach „Übernehmen" — und ist rücknehmbar.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IpcChannel,
  IpcEventName,
  IpcEvents,
  IpcRequest,
  IpcResponse,
  JournalCloseSuggestion,
  JournalDayView,
} from '@shared/ipc';
import type {
  JournalDay,
  Project,
  ProviderConfig,
  Routing,
  SettingsSnapshot,
  TaskDefinition,
  VaultDoc,
} from '@shared/types';
import { JournalScreen } from '@renderer/screens/journal/JournalScreen';
import type { SbBridge } from '@renderer/lib/bridge';
import { wireEvents } from '@renderer/lib/events';
import { clearStream } from '@renderer/lib/llm-stream';
import { setLanguage } from '@renderer/i18n';

/* Die IPC-Attrappe steht hier und nicht in `tests/setup.ts`: die Renderer-Tests
   liegen in einer eigenen tsconfig, die den gemeinsamen Aufbau nicht kennt. */
type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

interface Mock {
  calls: { channel: IpcChannel; payload: unknown }[];
  emit<E extends IpcEventName>(event: E, payload: IpcEvents[E]): void;
  payloadOf(channel: IpcChannel): unknown;
  payloadsOf(channel: IpcChannel): unknown[];
}

function installMock(handlers: Handlers): Mock {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const listeners = new Map<string, Set<(payload: never) => void>>();
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler)
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    return handler(payload);
  });
  window.sb = {
    invoke,
    on: (event: string, callback: (payload: never) => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(callback);
      listeners.set(event, set);
      return () => void set.delete(callback);
    },
    off: () => undefined,
  } as unknown as SbBridge;

  return {
    calls,
    emit: (event, payload) => {
      act(() => {
        for (const callback of listeners.get(event) ?? []) {
          (callback as (value: unknown) => void)(payload);
        }
      });
    },
    payloadOf: (channel) => calls.find((entry) => entry.channel === channel)?.payload,
    payloadsOf: (channel) =>
      calls.filter((entry) => entry.channel === channel).map((entry) => entry.payload),
  };
}

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container);
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

/* Feste Uhr: „Heute" ist der 10. August 2026, und die Lücken darunter sind
   nachrechenbar. */
const NOW = new Date('2026-08-10T18:40:00+02:00');
const TODAY = '2026-08-10';
const DAY_PATH = 'journal/2026/08/2026-08-10.md';
const EARLIER = '2026-08-06';
const DAY_TEXT = 'Vormittag im Testsystem, nachmittags das Abnahmeprotokoll vorbereitet.';

const project: Project = {
  path: 'projects/work/kundenportal-relaunch/project.md',
  slug: 'kundenportal-relaunch',
  title: 'Kundenportal Relaunch',
  scope: 'work',
  status: 'active',
  priority: 1,
  favorite: false,
  deadline: null,
  nextStep: 'Abnahmeprotokoll durchgehen',
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
  excerpt: 'Die neue Angebotsliste liegt auf dem Testsystem.',
};

function day(patch: Partial<JournalDay> = {}): JournalDay {
  return {
    path: DAY_PATH,
    date: TODAY,
    title: 'Montag, 10. August 2026',
    mood: 3,
    energy: 2,
    people: ['Miriam'],
    projects: [project.slug],
    tags: [],
    excerpt: DAY_TEXT,
    wordCount: 42,
    turns: 2,
    ...patch,
  };
}

const earlierDay: JournalDay = day({
  path: `journal/2026/08/${EARLIER}.md`,
  date: EARLIER,
  title: 'Donnerstag, 6. August 2026',
  mood: 2,
  energy: 2,
  people: [],
  projects: [],
  excerpt: 'Zäher Tag, drei Baustellen gleichzeitig.',
  wordCount: 30,
  turns: 0,
});

function doc(patch: Partial<VaultDoc> = {}): VaultDoc {
  return {
    path: DAY_PATH,
    frontmatter: { type: 'journal', title: 'Montag, 10. August 2026', created: NOW.toISOString() },
    body: `## Tag\n\n${DAY_TEXT}\n`,
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
    turns: [
      { role: 'user', text: 'Der Sprint fühlt sich unmöglich an.', at: '18:40' },
      { role: 'assistant', text: 'Zwei der drei Punkte warten auf andere.', at: '18:41' },
    ],
    facts: '- [ ] Interceptor zusammenlegen @due:2026-08-17',
    ...patch,
  };
}

const suggestion: JournalCloseSuggestion = {
  date: TODAY,
  path: DAY_PATH,
  proposal: {
    dumpPath: DAY_PATH,
    title: 'Montag, 10. August 2026',
    scope: 'work',
    tags: ['kundenportal'],
    primary: { target: 'journal', path: DAY_PATH, section: 'Fakten', content: '' },
    extras: [],
    alternatives: [],
    confidence: 1,
    reason: 'Ohne Modell im Tageseintrag erkannt: 2 Todos, 1 Person und Stimmung.',
    todos: [
      {
        text: 'Ladezeiten der Angebotsliste messen',
        scope: 'work',
        due: '2026-08-11',
        waitingFor: null,
        priority: 0,
        project: project.slug,
      },
      {
        text: 'Belege 2025 sortieren',
        scope: 'private',
        due: null,
        waitingFor: null,
        priority: 0,
        project: null,
      },
    ],
    waitingOn: [{ who: 'Tobias', what: 'Freigabe des Rollenkonzepts', since: TODAY }],
    entities: ['Miriam'],
    heuristic: true,
    createdAt: NOW.toISOString(),
  },
  frontmatter: { people: ['Miriam'], projects: [project.slug], mood: 2, energy: null, tags: [] },
  heuristic: true,
};

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

const CLOUD_PROVIDER: ProviderConfig = {
  ...LOCAL_PROVIDER,
  id: 'cloud-1',
  label: 'Anthropic',
  kind: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  hasKey: true,
  local: false,
  models: ['claude-sonnet-4'],
};

const TASKS: TaskDefinition[] = [
  {
    kind: 'journal-chat',
    labelKey: 'task.journal-chat.label',
    hintKey: 'task.journal-chat.hint',
    suggested: 'cheap',
    sensitive: true,
    streams: true,
    structured: false,
  },
];

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
    uiLanguage: 'de',
    window: { width: 1440, height: 900 },
    startMinimized: false,
    onboarded: true,
  },
  vault: {
    version: 1,
    languages: { ui: 'de', documents: 'de', conversation: 'de', translateSources: false },
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

interface Rendered {
  sb: Mock;
  container: HTMLElement;
  unwire: () => void;
}

function renderJournal(extra: Handlers = {}): Rendered {
  const sb = installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 12,
      indexedAt: NOW.toISOString(),
      indexing: false,
    }),
    'settings:get': () => settings,
    'journal:list': () => [day(), earlierDay],
    'journal:get': () => view(),
    'projects:list': () => [project],
    'llm:routing': () => routing(LOCAL_PROVIDER.id),
    'llm:tasks': () => TASKS,
    'llm:providers': () => [LOCAL_PROVIDER],
    'journal:coach': () => ({ threadId: `journal-${TODAY}`, messageId: 'm-1' }),
    'journal:abort': () => undefined,
    'journal:setMood': () => day({ mood: 5 }),
    'journal:setDay': () => ({ path: DAY_PATH, hash: 'hash-2', created: false }),
    'journal:append': () => ({ path: DAY_PATH, hash: 'hash-2', created: true }),
    'journal:close': () => suggestion,
    'journal:applyClose': () => ({
      written: [DAY_PATH, project.path],
      undo: [{ path: DAY_PATH, body: doc().body, expectedHash: 'hash-3' }],
    }),
    'vault:write': () => ({ path: DAY_PATH, hash: 'hash-4', created: false }),
    'shell:openPath': () => undefined,
    ...extra,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const unwire = wireEvents(client);
  const { container } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <JournalScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { sb, container, unwire };
}

let cleanup: (() => void) | null = null;

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup?.();
  cleanup = null;
  clearStream('m-1');
  clearStream('m-2');
  delete window.sb;
});

function open(extra: Handlers = {}): Rendered {
  const rendered = renderJournal(extra);
  cleanup = rendered.unwire;
  return rendered;
}

/** Etwas ins Gesprächsfeld schreiben und abschicken. */
async function say(text: string): Promise<void> {
  const field = await screen.findByLabelText('Was beschäftigt dich?');
  await userEvent.type(field, text);
  await userEvent.click(screen.getByRole('button', { name: 'Sagen' }));
}

describe('Tagebuch: Tage und Tag', () => {
  it('zeigt Heute, die Lücke dazwischen und den Tag mit Stimmung, Personen und Projekt', async () => {
    open();

    /* „Heute" ist der Einstieg, auch wenn es der jüngste Eintrag ist. */
    const list = await screen.findByRole('list', { name: 'Tage' });
    expect(within(list).getByRole('button', { name: `Eintrag vom ${TODAY} öffnen` })).toBeTruthy();
    expect(within(list).getByText('Heute')).toBeTruthy();
    /* Zwischen dem 10. und dem 6. fehlen drei Tage — und die stehen als Zeile da,
       nicht als drei erfundene Einträge. */
    expect(screen.getByText('3 Tage ohne Eintrag')).toBeTruthy();
    expect(screen.getAllByText('42 Wörter').length).toBeGreaterThan(0);

    expect(screen.getByRole('heading', { name: 'Montag, 10. August 2026' })).toBeTruthy();
    /* Der Tagestext steht rechts als Prosa — und links als erste Worte der Zeile. */
    expect(screen.getAllByText(DAY_TEXT).length).toBe(2);
    expect(screen.getByRole('button', { name: 'Geht so eintragen' })).toBeTruthy();
    expect(screen.getByText('Miriam')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Projekt Kundenportal Relaunch öffnen' }),
    ).toBeTruthy();
    /* Die Fakten stehen gerendert da, wie in der Datei. */
    expect(screen.getByText(/Interceptor zusammenlegen/)).toBeTruthy();
  });

  it('erklärt in zwei Sätzen, was hier entsteht, wenn noch kein Eintrag da ist', async () => {
    open({ 'journal:list': () => [], 'journal:get': () => null });

    expect(await screen.findByText('Noch kein Tageseintrag im Vault')).toBeTruthy();
    /* Und darunter kein weggeklicktes Angebot, sondern das Feld selbst. */
    expect(screen.getByLabelText('Wie war der Tag?')).toBeTruthy();
  });

  it('fragt bei einem Tag ohne Eintrag sofort im Feld, statt eine Karte zu zeigen', async () => {
    const { sb } = open({ 'journal:get': () => null });

    const field = await screen.findByLabelText('Wie war der Tag?');
    expect(field).toBe(document.activeElement);
    await userEvent.type(field, 'Ein ruhiger Abend in der Werkstatt.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(sb.payloadOf('journal:setDay')).toEqual({
        date: TODAY,
        text: 'Ein ruhiger Abend in der Werkstatt.',
      }),
    );
  });

  it('speichert eine Stimmung mit einem Klick', async () => {
    const { sb } = open();

    await userEvent.click(await screen.findByRole('button', { name: 'Sehr gut eintragen' }));

    await waitFor(() => expect(sb.payloadOf('journal:setMood')).toEqual({ date: TODAY, mood: 5 }));
    expect(await screen.findAllByText('Gespeichert')).toBeTruthy();
  });

  it('ist frei von A11y-Verstößen', async () => {
    const { container } = open();
    await screen.findByRole('heading', { name: 'Montag, 10. August 2026' });
    await expectNoViolations(container);
  });
});

describe('Tagebuch: der Tagestext', () => {
  it('friert Wert und Hash beim Öffnen ein und schickt genau diesen Hash mit', async () => {
    const { sb } = open();

    await userEvent.click(await screen.findByRole('button', { name: 'Tagestext bearbeiten' }));
    const field = screen.getByLabelText('Tagestext');
    await userEvent.clear(field);
    await userEvent.type(field, 'Neu geschrieben.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(sb.payloadOf('journal:setDay')).toEqual({
        date: TODAY,
        text: 'Neu geschrieben.',
        expectedHash: 'hash-1',
      }),
    );
  });

  it('meldet eine fremde Änderung sichtbar, statt sie stillschweigend zu überschreiben', async () => {
    const state = { view: view() };
    const { sb } = open({ 'journal:get': () => state.view });

    await userEvent.click(await screen.findByRole('button', { name: 'Tagestext bearbeiten' }));
    await userEvent.type(screen.getByLabelText('Tagestext'), ' Und noch ein Satz.');

    /* Jemand editiert die Datei von außen — der Watcher meldet es. */
    state.view = view({
      text: 'Von außen umgeschrieben.',
      doc: doc({ hash: 'hash-extern', body: '## Tag\n\nVon außen umgeschrieben.\n' }),
    });
    sb.emit('event:vault-changed', { paths: [DAY_PATH], external: true });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Dieser Abschnitt hat sich außerhalb geändert');
    /* Der eigene Entwurf steht noch da. */
    expect((screen.getByLabelText('Tagestext') as HTMLTextAreaElement).value).toContain(
      'Und noch ein Satz.',
    );

    /* Wer seinen Text behält, schreibt weiter mit dem eingefrorenen Hash — der
       Hauptprozess lehnt dann ab, statt zu überschreiben. */
    await userEvent.click(within(alert).getByRole('button', { name: 'Meinen Text behalten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(sb.payloadOf('journal:setDay')).toMatchObject({ expectedHash: 'hash-1' }),
    );
  });

  it('bietet nach einem Konflikt den ausdrücklichen Weg zum Überschreiben', async () => {
    const { sb } = open({
      'journal:setDay': () => {
        throw Object.assign(new Error('Konflikt'), { code: 'conflict' });
      },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Tagestext bearbeiten' }));
    await userEvent.type(screen.getByLabelText('Tagestext'), ' Zusatz.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Die Datei wurde zwischenzeitlich geändert');
    expect(screen.getByText('Nicht gespeichert.')).toBeTruthy();

    await userEvent.click(within(alert).getByRole('button', { name: 'Trotzdem speichern' }));
    /* Ausdrücklich heißt: ohne Hash — und nur, weil jemand es entschieden hat. */
    await waitFor(() => {
      const last = sb.payloadsOf('journal:setDay').at(-1) as { expectedHash?: string };
      expect(last.expectedHash).toBeUndefined();
    });
  });
});

describe('Tagebuch: das Gespräch', () => {
  it('zeigt die eigene Runde sofort und lässt die Antwort sichtbar entstehen', async () => {
    const { sb } = open();

    await say('Heute war zu viel.');

    await waitFor(() =>
      expect(sb.payloadOf('journal:coach')).toEqual({
        mode: 'listen',
        date: TODAY,
        message: 'Heute war zu viel.',
        useHistory: true,
      }),
    );
    /* Die eigene Runde steht da, bevor eine Antwort existiert. */
    expect(await screen.findByText('Heute war zu viel.')).toBeTruthy();
    expect(screen.getByText('Denkt nach')).toBeTruthy();

    sb.emit('event:llm-stream', {
      messageId: 'm-1',
      threadId: `journal-${TODAY}`,
      delta: 'Das klingt nach einem Tag, ',
      done: false,
    });
    expect(await screen.findByText(/Das klingt nach einem Tag,/)).toBeTruthy();
    sb.emit('event:llm-stream', {
      messageId: 'm-1',
      threadId: `journal-${TODAY}`,
      delta: 'der mehr wollte als hineinpasst.',
      done: true,
    });
    expect(
      await screen.findByText(/Das klingt nach einem Tag, der mehr wollte als hineinpasst\./),
    ).toBeTruthy();
  });

  it('schickt die gewechselte Haltung im nächsten Aufruf mit', async () => {
    const { sb } = open();

    /* Die Grundhaltung kommt aus den Einstellungen. */
    const listen = await screen.findByRole('button', { name: 'Haltung Zuhören wählen' });
    expect(listen.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Zuhören: ich spiegle und frage nach, ohne Ratschläge.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Haltung Analysieren wählen' }));
    expect(
      screen.getByText(
        'Analysieren: ich vergleiche mit früheren Tagen und zeige Muster, mit Datum.',
      ),
    ).toBeTruthy();
    await say('Und wieder derselbe Sprint.');

    await waitFor(() => expect(sb.payloadOf('journal:coach')).toMatchObject({ mode: 'analyze' }));
  });

  it('wechselt die Haltung auch aus dem Schreibfeld heraus — mit Ctrl und Ziffer', async () => {
    open();

    const field = await screen.findByLabelText('Was beschäftigt dich?');
    await userEvent.click(field);
    await userEvent.keyboard('{Control>}2{/Control}');

    expect(
      screen.getByRole('button', { name: 'Haltung Tipps wählen' }).getAttribute('aria-pressed'),
    ).toBe('true');
    /* Und die Ziffer allein bleibt ein Zeichen im Feld. */
    await userEvent.type(field, '2 Sachen sind offen.');
    expect((field as HTMLTextAreaElement).value).toBe('2 Sachen sind offen.');
  });

  it('nennt den Provider, wenn das Gespräch den Rechner verlässt', async () => {
    open({
      'llm:routing': () => routing(CLOUD_PROVIDER.id),
      'llm:providers': () => [CLOUD_PROVIDER],
    });

    expect(
      await screen.findByText(
        'Dieses Gespräch geht an Anthropic — ein lokales Modell bleibt auf diesem Rechner.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Modell ändern' })).toBeTruthy();
  });

  it('stellt bei einem lokalen Modell fest, dass es hier bleibt', async () => {
    open();

    expect(await screen.findByText('Läuft lokal auf diesem Rechner.')).toBeTruthy();
    expect(screen.queryByText(/geht an/)).toBeNull();
  });

  it('schreibt ohne Modell den Eintrag und erfindet keine Antwort', async () => {
    const state = { view: view({ turns: [] }) };
    const { sb } = open({
      'journal:get': () => state.view,
      'llm:routing': () => ({ tasks: {}, defaults: {} }),
    });

    expect(
      await screen.findByText(
        'Für das Gespräch ist kein Modell zugeordnet — schreiben lässt sich der Eintrag trotzdem.',
      ),
    ).toBeTruthy();

    await say('Niemand da, der antwortet?');
    /* Der Hauptprozess hat die Runde geschrieben und meldet den Grund. */
    state.view = view({
      turns: [{ role: 'user', text: 'Niemand da, der antwortet?', at: '18:40' }],
    });
    sb.emit('event:llm-stream', {
      messageId: 'm-1',
      threadId: `journal-${TODAY}`,
      delta: '',
      done: true,
      error: 'no-route',
    });

    expect(
      await screen.findByText('Aufgeschrieben. Für eine Antwort ist kein Modell zugeordnet.'),
    ).toBeTruthy();
    /* Keine gespielte Empathie: es gibt keine Antwortrunde. */
    expect(screen.queryByRole('article', { name: 'Second Brain' })).toBeNull();
    expect(screen.getByText('Niemand da, der antwortet?')).toBeTruthy();
  });

  it('zeigt ohne Modell die gefundenen früheren Stellen und springt dorthin', async () => {
    const { sb } = open({ 'llm:routing': () => ({ tasks: {}, defaults: {} }) });

    await say('Der Sprint fühlt sich wieder unmöglich an.');
    sb.emit('event:llm-stream', {
      messageId: 'm-1',
      threadId: `journal-${TODAY}`,
      delta: '',
      done: true,
      error: 'no-route',
      citations: [
        {
          path: `journal/2026/08/${EARLIER}.md`,
          title: EARLIER,
          quote: 'Zäher Tag, drei Baustellen gleichzeitig.',
          line: null,
        },
      ],
    });

    expect(await screen.findByText('Ähnlich klang es an diesen Tagen')).toBeTruthy();
    const jump = screen.getByRole('button', { name: /Zäher Tag/ });
    await userEvent.click(jump);
    /* Der Sprung öffnet den früheren Tag — dieselbe Ansicht, anderes Datum. */
    await waitFor(() => expect(sb.payloadsOf('journal:get')).toContainEqual({ date: EARLIER }));
  });

  it('bietet während der Antwort einen Abbruch, der wirklich abbricht', async () => {
    const { sb } = open();

    await say('Ich rede lieber nicht weiter.');
    const cancel = await screen.findByRole('button', { name: 'Abbrechen' });
    await userEvent.click(cancel);

    await waitFor(() => expect(sb.payloadOf('journal:abort')).toEqual({ messageId: 'm-1' }));
  });

  it('schickt während einer laufenden Antwort keine zweite Runde', async () => {
    const { sb } = open();

    await say('Erste Runde.');
    await screen.findByRole('button', { name: 'Abbrechen' });
    /* Enter im Feld: zwei Runden gleichzeitig würden sich beim Schreiben in
       dieselbe Datei überholen. */
    await userEvent.type(
      await screen.findByLabelText('Was beschäftigt dich?'),
      'Zweite Runde{Enter}',
    );

    expect(sb.payloadsOf('journal:coach')).toHaveLength(1);
  });
});

describe('Tagebuch: die Reiter im engen Fenster', () => {
  it('startet auf „Tag", wenn der Tag schon Text hat', async () => {
    open();

    const dayTab = await screen.findByRole('tab', { name: 'Tag' });
    expect(dayTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Gespräch/ }).getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  it('startet auf „Gespräch", wenn der Tag noch keinen Text hat', async () => {
    open({ 'journal:get': () => view({ text: '' }) });

    expect(
      (await screen.findByRole('tab', { name: /Gespräch/ })).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('zeigt beim Wechsel auf „Gespräch" das Feld — fokussiert, ohne dass man rollen muss', async () => {
    open();

    await screen.findByRole('tab', { name: 'Tag' });
    const field = screen.getByLabelText('Was beschäftigt dich?');
    expect(field).not.toBe(document.activeElement);

    await userEvent.click(screen.getByRole('tab', { name: /Gespräch/ }));

    expect(screen.getByRole('tab', { name: /Gespräch/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(field).toBe(document.activeElement);
  });

  it('wechselt die Reiter mit den Pfeiltasten', async () => {
    open();

    const dayTab = await screen.findByRole('tab', { name: 'Tag' });
    dayTab.focus();
    await userEvent.keyboard('{ArrowRight}');

    const talkTab = screen.getByRole('tab', { name: /Gespräch/ });
    expect(talkTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('Was beschäftigt dich?')).toBe(document.activeElement);

    /* Zurück auf „Tag": der Fokus liegt nach dem Wechsel im Feld, nicht mehr
       am Reiter — die Pfeiltaste dort gehört dem Text, nicht der Navigation
       (dieselbe Abgrenzung wie bei den Ziffern). */
    talkTab.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(dayTab.getAttribute('aria-selected')).toBe('true');
  });

  it('lässt Ziffern im Feld ein Zeichen bleiben, ohne den Reiter zu wechseln', async () => {
    open();

    await userEvent.click(await screen.findByRole('tab', { name: /Gespräch/ }));
    const field = screen.getByLabelText('Was beschäftigt dich?');
    await userEvent.type(field, '2 Punkte sind offen.');

    expect((field as HTMLTextAreaElement).value).toBe('2 Punkte sind offen.');
    /* Die Ziffer hat den Reiter nicht zurück auf „Tag" gestellt. */
    expect(screen.getByRole('tab', { name: /Gespräch/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});

describe('Tagebuch: Tagesabschluss', () => {
  /** Öffnet den Vorschlag über den Knopf bei den Fakten. */
  async function openClose(extra: Handlers = {}): Promise<Mock> {
    const { sb } = open(extra);
    await userEvent.click(await screen.findByRole('button', { name: 'Tag abschließen' }));
    await screen.findByRole('dialog', { name: 'Tagesabschluss' });
    return sb;
  }

  it('zeigt den Vorschlag mit Ziel, Grund und Fristen — und schreibt noch nichts', async () => {
    const sb = await openClose();

    expect(sb.payloadOf('journal:close')).toEqual({ date: TODAY });
    const dialog = screen.getByRole('dialog', { name: 'Tagesabschluss' });
    expect(dialog.textContent).toContain('Ohne Modell im Tageseintrag erkannt');
    expect(within(dialog).getByLabelText('Ladezeiten der Angebotsliste messen')).toBeTruthy();
    /* Das Ziel steht dabei: ein Todo mit Projekt geht in dessen Datei. */
    expect(dialog.textContent).toContain('in Projekt Kundenportal Relaunch');
    expect(dialog.textContent).toContain('in Tageseintrag, Abschnitt Fakten');
    /* Das Warte-auf sagt, in welcher Form es notiert wird. */
    expect(within(dialog).getByLabelText('Freigabe des Rollenkonzepts')).toBeTruthy();
    expect(dialog.textContent).toContain('als Todo mit @wait im Tageseintrag');
    expect(dialog.textContent).toContain('Stimmung Gedrückt');
    /* Und bis hierher ist nichts geschrieben. */
    expect(sb.payloadsOf('journal:applyClose')).toEqual([]);
  });

  it('übernimmt nur das Ausgewählte und bietet danach den Rückweg', async () => {
    const sb = await openClose();
    const dialog = screen.getByRole('dialog', { name: 'Tagesabschluss' });

    await userEvent.click(within(dialog).getByLabelText('Belege 2025 sortieren'));
    await userEvent.click(within(dialog).getByLabelText('Personen'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Übernehmen' }));

    await waitFor(() => {
      const payload = sb.payloadOf('journal:applyClose') as IpcRequest<'journal:applyClose'>;
      expect(payload.todos.map((todo) => todo.text)).toEqual([
        'Ladezeiten der Angebotsliste messen',
        'Freigabe des Rollenkonzepts',
      ]);
      /* Abgewählt heißt: wird nicht geschrieben. */
      expect(payload.frontmatter.people).toEqual([]);
      expect(payload.frontmatter.mood).toBe(2);
      expect(payload.expectedHash).toBe('hash-1');
    });

    /* Danach steht da, was passiert ist — mit Rückgängig. */
    expect(await screen.findByText('Übernommen in')).toBeTruthy();
    /* Der Pfad steht in der Leiste — und oben am Kopf des Tages. */
    expect(screen.getAllByText(DAY_PATH).length).toBeGreaterThan(1);
    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    await waitFor(() =>
      expect(sb.payloadOf('vault:write')).toEqual({
        path: DAY_PATH,
        body: doc().body,
        expectedHash: 'hash-3',
      }),
    );
    await waitFor(() => expect(screen.queryByText('Übernommen in')).toBeNull());
  });

  it('sagt vorher, wenn nichts übernommen würde, statt einen Schreibvorgang zu behaupten', async () => {
    await openClose({
      'journal:close': () => ({
        ...suggestion,
        proposal: { ...suggestion.proposal, todos: [], waitingOn: [] },
        frontmatter: { people: [], projects: [], mood: null, energy: null, tags: [] },
      }),
    });

    const dialog = screen.getByRole('dialog', { name: 'Tagesabschluss' });
    expect(dialog.textContent).toContain('Im Tagestext war nichts zu holen');
    expect(
      within(dialog).getByRole('button', { name: 'Übernehmen' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('ist im Vorschlag frei von A11y-Verstößen', async () => {
    const { container } = open();
    await userEvent.click(await screen.findByRole('button', { name: 'Tag abschließen' }));
    await screen.findByRole('dialog', { name: 'Tagesabschluss' });
    await expectNoViolations(container);
  });
});
