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
  JournalInterviewPlan,
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
import { setOpenOnly } from '@renderer/lib/journal-filter';
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
    closed: null,
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
    /* Mirrors `turns`/`text` above as the new-format stream would parse them:
       the day's own prose first (the whole-day text plus the one paragraph
       from the existing conversation), then the app's answer as a block —
       same content, so the assertions below that look for these exact texts
       keep working against `EntryStream` instead of the old `CoachPanel`. */
    stream: [
      { kind: 'entry', text: DAY_TEXT, at: null },
      { kind: 'entry', text: 'Der Sprint fühlt sich unmöglich an.', at: null },
      { kind: 'answer', text: 'Zwei der drei Punkte warten auf andere.', at: '18:41' },
    ],
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

/* 012, D6: a minimal plan so opening the interview overlay from the day's own
   button doesn't hit an unhandled channel — none of these tests answer a
   question, they only check that the entry point opens/closes correctly. */
const INTERVIEW_PLAN: JournalInterviewPlan = {
  steps: [{ topic: 'work', question: 'Was hast du heute gearbeitet?' }],
  mode: 'fixed',
  finished: false,
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
    'journal:setClosed': ({ closed }) => day({ closed: closed ? NOW.toISOString() : null }),
    'journal:setDay': () => ({ path: DAY_PATH, hash: 'hash-2', created: false }),
    'journal:append': () => ({ path: DAY_PATH, hash: 'hash-2', created: true }),
    'journal:close': () => suggestion,
    'journal:applyClose': () => ({
      written: [DAY_PATH, project.path],
      undo: [{ path: DAY_PATH, body: doc().body, expectedHash: 'hash-3' }],
    }),
    'vault:write': () => ({ path: DAY_PATH, hash: 'hash-4', created: false }),
    'journal:foldDay': () => ({ path: DAY_PATH, hash: 'hash-5', created: false }),
    'shell:openPath': () => undefined,
    'journal:interviewPlan': () => INTERVIEW_PLAN,
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
  /* Der Filter (009, D5) lebt modulweit und überlebt deshalb einen Test —
     ohne Rücksetzen würde ein Test den nächsten filtern. */
  setOpenOnly(false);
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  /* jsdom kennt `scrollIntoView` nicht. Ohne Attrappe stirbt `ErrorState` an
     der Stelle, an der sie sich in den Sichtbereich holt (009, D6 ist der
     erste Test hier, der die generische Fehlerkarte statt `DayText`s eigener
     Konflikt-UI auslöst). */
  Element.prototype.scrollIntoView = () => undefined;
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

/** Etwas ins Gesprächsfeld schreiben und abschicken.
 *
 * Der Knopf heißt „Sagen" bei Zuhören und „Speichern und fragen" bei
 * Tipps/Analysieren (011, D8) — der Helfer sucht beide, statt die Haltung zu
 * kennen, damit er in jedem Modus funktioniert. */
async function say(text: string): Promise<void> {
  const field = await screen.findByLabelText('Was beschäftigt dich?');
  await userEvent.type(field, text);
  const button =
    screen.queryByRole('button', { name: 'Sagen' }) ??
    screen.getByRole('button', { name: 'Speichern und fragen' });
  await userEvent.click(button);
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
    /* Der Tagestext steht links als erste Worte der Zeile (Tagesliste) und im
       Strom (`EntryStream`), weil der Strom denselben Absatz als `entry`-Block
       enthält — D8 hat die zusätzliche, komplette Prosa-Ansicht in `DayText`
       aufgelöst (siehe deren Kommentar): dort steht jetzt nur noch der kleine
       Bearbeiten-Knopf, kein dritter Abdruck des Texts mehr. */
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
    /* Und darunter kein weggeklicktes Angebot, sondern das Feld selbst — seit
       D8 der eine Composer, nicht mehr die alte Einladung von `DayText`. */
    expect(screen.getByLabelText('Was beschäftigt dich?')).toBeTruthy();
  });

  it('fragt bei einem Tag ohne Eintrag sofort im Feld, statt eine Karte zu zeigen', async () => {
    /* Der alte Eintrittspunkt war `DayText`s Einlade-Feld mit `journal:setDay`
       (vor 011/D8) — der neue, echte Eintrittspunkt für den ersten Satz eines
       frischen Tages ist der eine Composer, über `journal:append`, exakt wie
       jeder andere Zuhören-Absatz auch. */
    const { sb } = open({ 'journal:get': () => null });

    const field = await screen.findByLabelText('Was beschäftigt dich?');
    await waitFor(() => expect(field).toBe(document.activeElement));
    await userEvent.type(field, 'Ein ruhiger Abend in der Werkstatt.');
    await userEvent.click(screen.getByRole('button', { name: 'Sagen' }));

    await waitFor(() =>
      expect(sb.payloadOf('journal:append')).toEqual({
        date: TODAY,
        text: 'Ein ruhiger Abend in der Werkstatt.',
      }),
    );
    expect(sb.payloadsOf('journal:setDay')).toEqual([]);
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
    /* The acceptance criterion for 011/D7 is literally "no tablist any
       more" — the day used to carry a "Day"/"Talk" tab switch here. */
    expect(screen.queryByRole('tablist')).toBeNull();
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
  it('schreibt in der Haltung Zuhören nur auf und ruft nie journal:coach', async () => {
    /* 011/D8: Zuhören geht ausschließlich über journal:append — verifizierbar
       an der IPC-Grenze, nicht nur im Prompt. Das gilt auch, wenn (wie hier,
       über die Standard-Fixtur) ein Modell für das Gespräch geroutet ist: die
       Haltung entscheidet, nicht die Verfügbarkeit eines Modells. */
    const state = { view: view() };
    const { sb } = open({
      'journal:get': () => state.view,
      'journal:append': (request) => {
        state.view = view({
          stream: [...state.view.stream, { kind: 'entry', text: request.text, at: null }],
        });
        return { path: DAY_PATH, hash: 'hash-2', created: false };
      },
    });

    await say('Heute war zu viel.');

    await waitFor(() =>
      expect(sb.payloadOf('journal:append')).toEqual({ date: TODAY, text: 'Heute war zu viel.' }),
    );
    expect(sb.payloadsOf('journal:coach')).toEqual([]);
    /* Der Absatz steht im Strom, sobald der Tag neu geladen ist — und es gibt
       weder ein „Denkt nach" noch eine erfundene Antwort, denn kein Modell
       wurde je gefragt. */
    expect(await screen.findByText('Heute war zu viel.')).toBeTruthy();
    expect(screen.queryByText('Denkt nach')).toBeNull();
    /* Das Feld ist geleert — der Absatz ist unterwegs zur Datei. */
    const field = (await screen.findByLabelText('Was beschäftigt dich?')) as HTMLTextAreaElement;
    expect(field.value).toBe('');
  });

  it('zeigt in Tipps/Analysieren die eigene Runde sofort und lässt die Antwort sichtbar entstehen', async () => {
    const { sb } = open();
    /* Zuhören streamt nie (siehe oben) — das hier ist Tipps/Analysierens Job. */
    const tips = await screen.findByRole('button', { name: 'Haltung Tipps wählen' });
    await userEvent.click(tips);
    await waitFor(() => expect(tips.getAttribute('aria-pressed')).toBe('true'));

    await say('Heute war zu viel.');

    await waitFor(() =>
      expect(sb.payloadOf('journal:coach')).toEqual({
        mode: 'tips',
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

  it('zeigt die eigene Runde nur einmal, auch wenn sie im Strom mit vorheriger Prosa verschmilzt', async () => {
    /* `appendEntry` schreibt reine Prosa — landet die eigene Runde direkt hinter
       schon vorhandener Prosa desselben Tages, verschmilzt `parseStream` beides
       zu einem einzigen `entry`-Block (kein Absatz-Schnitt innerhalb eines
       Laufs). Ein Abgleich auf exakte Gleichheit der eigenen Nachricht gegen
       den ganzen Block träfe dann nie — die Nachricht muss als Ende des Blocks
       erkannt werden, sonst steht sie doppelt da, sobald der Tag nach dem
       Schreiben neu geladen wird. */
    const state = {
      view: view({
        stream: [{ kind: 'entry', text: DAY_TEXT, at: null }],
        turns: [],
      }),
    };
    const { sb } = open({ 'journal:get': () => state.view });

    const tips = await screen.findByRole('button', { name: 'Haltung Tipps wählen' });
    await userEvent.click(tips);
    await say('Und noch ein Satz.');

    /* Der Hauptprozess hat geschrieben: die eigene Prosa ist jetzt EIN Block,
       der mit dem vorhandenen Tagestext verschmolzen ist — exakt wie
       `appendEntry`/`parseStream` es wirklich tun. */
    state.view = view({
      stream: [{ kind: 'entry', text: `${DAY_TEXT}\n\nUnd noch ein Satz.`, at: null }],
      turns: [],
    });
    sb.emit('event:vault-changed', { paths: [DAY_PATH], external: false });

    await waitFor(() => expect(screen.getAllByText(/Und noch ein Satz\./).length).toBe(1));
  });

  it('schickt die gewechselte Haltung im nächsten Aufruf mit und beschriftet den Knopf entsprechend', async () => {
    const { sb } = open();

    /* Die Grundhaltung kommt aus den Einstellungen. */
    const listen = await screen.findByRole('button', { name: 'Haltung Zuhören wählen' });
    expect(listen.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByText('Zuhören: wird abgelegt, ohne Antwort und ohne Rückfrage.'),
    ).toBeTruthy();
    /* Zuhören sagt "Sagen" — die Haltung *ist* die Anfrage, aber Zuhören
       fragt nichts. */
    expect(screen.getByRole('button', { name: 'Sagen' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Haltung Analysieren wählen' }));
    expect(
      screen.getByText(
        'Analysieren: ich helfe verstehen und stütze dich, anhand echter früherer Einträge.',
      ),
    ).toBeTruthy();
    /* Sobald ein Modell gefragt wird, sagt der Knopf es geradeheraus. */
    expect(screen.getByRole('button', { name: 'Speichern und fragen' })).toBeTruthy();
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

  it('schreibt in Zuhören auch ohne Modell den Eintrag — journal:coach bleibt ungerufen', async () => {
    /* `stream: []` (not just `turns: []`): the default fixture's stream
       already contains one answer block, which would otherwise satisfy the
       "no answer round" check below for the wrong reason. */
    const state = { view: view({ turns: [], stream: [] }) };
    const { sb } = open({
      'journal:get': () => state.view,
      'llm:routing': () => ({ tasks: {}, defaults: {} }),
      'journal:append': (request) => {
        state.view = view({ turns: [], stream: [{ kind: 'entry', text: request.text, at: null }] });
        return { path: DAY_PATH, hash: 'hash-2', created: true };
      },
    });

    expect(
      await screen.findByText(
        'Für das Gespräch ist kein Modell zugeordnet — schreiben lässt sich der Eintrag trotzdem.',
      ),
    ).toBeTruthy();

    await say('Niemand da, der antwortet?');

    await waitFor(() =>
      expect(sb.payloadOf('journal:append')).toEqual({
        date: TODAY,
        text: 'Niemand da, der antwortet?',
      }),
    );
    /* Zuhören ruft journal:coach nie — mit oder ohne Modell macht das keinen
       Unterschied, denn die Haltung entscheidet, nicht das Routing. */
    expect(sb.payloadsOf('journal:coach')).toEqual([]);
    expect(await screen.findByText('Niemand da, der antwortet?')).toBeTruthy();
    /* Keine gespielte Empathie: es gibt keine Antwortrunde — und auch keinen
       Ausfall-Hinweis, weil nie ein Modell gefragt wurde. */
    expect(screen.queryByRole('article', { name: 'Second Brain' })).toBeNull();
    expect(
      screen.queryByText('Aufgeschrieben. Für eine Antwort ist kein Modell zugeordnet.'),
    ).toBeNull();
  });

  it('zeigt ohne Modell die gefundenen früheren Stellen und springt dorthin', async () => {
    const { sb } = open({ 'llm:routing': () => ({ tasks: {}, defaults: {} }) });

    /* Frühere Stellen sind Analysierens Job — Zuhören ruft journal:coach nie. */
    await userEvent.click(
      await screen.findByRole('button', { name: 'Haltung Analysieren wählen' }),
    );
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
    /* Nur Tipps/Analysieren rufen ein Modell — nur dort gibt es etwas
       abzubrechen. */
    await userEvent.click(await screen.findByRole('button', { name: 'Haltung Tipps wählen' }));

    await say('Ich rede lieber nicht weiter.');
    const cancel = await screen.findByRole('button', { name: 'Abbrechen' });
    await userEvent.click(cancel);

    await waitFor(() => expect(sb.payloadOf('journal:abort')).toEqual({ messageId: 'm-1' }));
  });

  it('schickt während einer laufenden Antwort keine zweite Runde', async () => {
    const { sb } = open();
    await userEvent.click(await screen.findByRole('button', { name: 'Haltung Tipps wählen' }));

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

/* The "Day"/"Talk" tab system this block tested is gone (011, D7): the
   screen renders one chronological column now, so there is no subject left
   to test tab-switching behaviour against — this is a deletion of a test for
   a removed feature, not a weakened assertion. */

describe('Tagebuch: altes Gespräch (011, D9)', () => {
  /* The default fixture's `turns` was never cleared by D7/D8 (see the
     comment on `view()`), so it is already legacy-shaped out of the box —
     no separate fixture needed for "there is a legacy conversation". A
     folded/new-format day is the one that needs its own fixture: `turns: []`. */

  it('zeigt Strom und altes Gespräch nebeneinander, und der Eintrag bleibt bearbeitbar', async () => {
    open();

    const legacy = await screen.findByRole('region', { name: 'Altes Gespräch' });
    expect(within(legacy).getByText('Der Sprint fühlt sich unmöglich an.')).toBeTruthy();
    expect(within(legacy).getByText('Zwei der drei Punkte warten auf andere.')).toBeTruthy();

    const stream = screen.getByRole('region', { name: 'Verlauf' });
    expect(within(stream).getByText('Der Sprint fühlt sich unmöglich an.')).toBeTruthy();

    /* Editing-in-place is untouched by the legacy block — it operates on
       `view.text`/`view.doc.hash` alone (D8), regardless of `view.turns`. */
    expect(screen.getByRole('button', { name: 'Tagestext bearbeiten' })).toBeTruthy();
  });

  it('zeigt keinen Legacy-Block mehr, sobald ein Tag keine Konversation mehr hat', async () => {
    open({ 'journal:get': () => view({ turns: [] }) });

    await screen.findByRole('heading', { name: 'Montag, 10. August 2026' });
    expect(screen.queryByRole('region', { name: 'Altes Gespräch' })).toBeNull();
  });

  it('fragt nach, bevor journal:foldDay etwas schreibt', async () => {
    const { sb } = open();

    await userEvent.click(await screen.findByRole('button', { name: 'In den Eintrag übernehmen' }));
    await screen.findByRole('dialog', { name: 'Gespräch in den Eintrag übernehmen' });

    expect(sb.payloadsOf('journal:foldDay')).toEqual([]);
  });

  it('übernimmt erst nach Bestätigung, mit dem eingefrorenen Hash — danach ist der Legacy-Block weg', async () => {
    const state = { view: view() };
    const { sb } = open({
      'journal:get': () => state.view,
      'journal:foldDay': () => {
        state.view = view({
          turns: [],
          stream: [
            ...state.view.stream,
            { kind: 'entry', text: 'Nachgetragen aus dem Gespräch.', at: null },
          ],
        });
        return { path: DAY_PATH, hash: 'hash-5', created: false };
      },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'In den Eintrag übernehmen' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Gespräch in den Eintrag übernehmen',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Übernehmen' }));

    await waitFor(() =>
      expect(sb.payloadOf('journal:foldDay')).toEqual({ date: TODAY, expectedHash: 'hash-1' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Altes Gespräch' })).toBeNull(),
    );
    expect(await screen.findByText('Nachgetragen aus dem Gespräch.')).toBeTruthy();
  });

  it('schreibt beim Abbrechen nichts — das alte Gespräch bleibt stehen', async () => {
    const { sb } = open();

    await userEvent.click(await screen.findByRole('button', { name: 'In den Eintrag übernehmen' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Gespräch in den Eintrag übernehmen',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sb.payloadsOf('journal:foldDay')).toEqual([]);
    expect(screen.getByRole('region', { name: 'Altes Gespräch' })).toBeTruthy();
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

describe('Tagebuch: Interview-Einstieg (012, D6)', () => {
  /* The button is the entry point for the interview overlay (D5) — a real
     `<button>`, reachable via role, on every day the screen renders. */
  it('zeigt den Interview-Knopf als echten Button, an einem leeren wie an einem beschriebenen Tag', async () => {
    open();
    const withProse = await screen.findByRole('button', { name: 'Interview starten' });
    expect(withProse.tagName).toBe('BUTTON');
  });

  it('ist primary, solange der Tag weder Text noch einen Entwurf hat — das ist der Moment, in dem es gebraucht wird', async () => {
    open({ 'journal:get': () => null });

    const button = await screen.findByRole('button', { name: 'Interview starten' });
    expect(button.className).toContain('gs-btn--primary');
  });

  it('ist secondary, sobald der Tag schon Text hat', async () => {
    open();

    const button = await screen.findByRole('button', { name: 'Interview starten' });
    expect(button.className).toContain('gs-btn--secondary');
  });

  it('weicht auch bei einem leeren Tag auf secondary aus, sobald selbst schon ein Entwurf im Feld steht — sonst stünden zwei Teal-Knöpfe gleichzeitig da', async () => {
    open({ 'journal:get': () => null });

    const button = await screen.findByRole('button', { name: 'Interview starten' });
    expect(button.className).toContain('gs-btn--primary');

    const field = await screen.findByLabelText('Was beschäftigt dich?');
    await userEvent.type(field, 'Ein erster eigener Satz.');

    await waitFor(() => expect(button.className).toContain('gs-btn--secondary'));
  });

  it('öffnet beim Klick das Interview-Overlay', async () => {
    open();

    await userEvent.click(await screen.findByRole('button', { name: 'Interview starten' }));

    expect(await screen.findByRole('dialog', { name: 'Interview' })).toBeTruthy();
  });

  it('lässt beim Schließen das eigene Schreibfeld bearbeitbar zurück', async () => {
    open();

    await userEvent.click(await screen.findByRole('button', { name: 'Interview starten' }));
    const dialog = await screen.findByRole('dialog', { name: 'Interview' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Verlassen und selbst schreiben' }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const field = screen.getByLabelText('Was beschäftigt dich?') as HTMLTextAreaElement;
    expect(field.disabled).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(field));
  });
});

describe('Tagebuch: Filter „nur offene Tage" (009, D5)', () => {
  /* Eine Woche mit allen drei Sorten Tag: heute (nie „offen", immer Einstieg),
     ein abgeschlossener Tag, zwei offene. Jeweils ein Kalendertag Abstand —
     ungefiltert also drei Lückenzeilen, die nachrechenbar sind. */
  const CLOSED = '2026-08-08';
  const OLDER = '2026-08-04';
  const closedDay: JournalDay = day({
    path: `journal/2026/08/${CLOSED}.md`,
    date: CLOSED,
    title: 'Samstag, 8. August 2026',
    closed: `${CLOSED}T22:10:00+02:00`,
    people: [],
    projects: [],
    excerpt: 'Abgeschlossen und abgehakt.',
    wordCount: 20,
    turns: 0,
  });
  const olderOpenDay: JournalDay = day({
    path: `journal/2026/08/${OLDER}.md`,
    date: OLDER,
    title: 'Dienstag, 4. August 2026',
    people: [],
    projects: [],
    excerpt: 'Angefangen, nie beendet.',
    wordCount: 18,
    turns: 0,
  });
  const MIXED = [day(), closedDay, earlierDay, olderOpenDay];

  /** Die Tage, die wirklich in der Liste stehen — in ihrer Reihenfolge. */
  function shown(): string[] {
    return within(screen.getByRole('list', { name: 'Tage' }))
      .getAllByRole('button')
      .map((button) =>
        (button.getAttribute('aria-label') ?? '').replace(/^Eintrag vom | öffnen$/g, ''),
      );
  }

  async function ready(): Promise<void> {
    await screen.findByRole('list', { name: 'Tage' });
  }

  it('steht standardmäßig auf aus — sichtbar am Kästchen, und die Zeitleiste bleibt vollständig', async () => {
    open({ 'journal:list': () => MIXED });
    await ready();

    const box = screen.getByLabelText('Nur offene Tage') as HTMLInputElement;
    expect(box.checked).toBe(false);
    /* Ungefiltert: alles da, in der Zeitachse, mit den echten Lücken. */
    expect(shown()).toEqual([TODAY, CLOSED, EARLIER, OLDER]);
    expect(screen.getAllByText('Ein Tag ohne Eintrag').length).toBe(3);
    expect(screen.getByText('4 Tage mit Eintrag')).toBeTruthy();
  });

  it('zeigt eingeschaltet nur die offenen Tage — Heute zuerst, ohne selbst zu zählen', async () => {
    open({ 'journal:list': () => MIXED });
    await ready();

    await userEvent.click(screen.getByLabelText('Nur offene Tage'));

    expect((screen.getByLabelText('Nur offene Tage') as HTMLInputElement).checked).toBe(true);
    /* Der abgeschlossene Tag ist weg, Heute bleibt der Einstieg — obwohl es
       selbst nie als offen gilt und deshalb auch nicht mitgezählt wird. */
    expect(shown()).toEqual([TODAY, EARLIER, OLDER]);
    expect(screen.getByText('2 Tage offen')).toBeTruthy();
  });

  it('nennt keine Lücke, solange gefiltert wird — die käme vom Filter, nicht vom Vault', async () => {
    open({ 'journal:list': () => MIXED });
    await ready();

    await userEvent.click(screen.getByLabelText('Nur offene Tage'));

    expect(screen.queryAllByText(/ohne Eintrag/)).toEqual([]);
  });

  it('nennt einen einzelnen offenen Tag im Singular', async () => {
    open({ 'journal:list': () => [day(), earlierDay] });
    await ready();

    await userEvent.click(screen.getByLabelText('Nur offene Tage'));

    expect(screen.getByText('Ein Tag offen')).toBeTruthy();
  });

  it('sagt „Nichts offen", wenn jeder vergangene Tag abgeschlossen ist', async () => {
    open({ 'journal:list': () => [day(), closedDay] });
    await ready();

    await userEvent.click(screen.getByLabelText('Nur offene Tage'));

    expect(screen.getByText('Nichts offen. Jeder vergangene Tag ist abgeschlossen.')).toBeTruthy();
    expect(screen.getByText('0 Tage offen')).toBeTruthy();
    /* Und trotzdem keine leere Liste: der Einstieg in heute bleibt stehen. */
    expect(shown()).toEqual([TODAY]);
  });

  it('nennt „Nichts offen" nur im gefilterten Zustand', async () => {
    open({ 'journal:list': () => [day(), closedDay] });
    await ready();

    expect(screen.queryByText(/Nichts offen/)).toBeNull();
  });

  it('lässt die Pfeiltasten genau die gezeigten Tage abgehen', async () => {
    const { sb } = open({ 'journal:list': () => MIXED });
    await ready();
    await userEvent.click(screen.getByLabelText('Nur offene Tage'));

    /* Erster Schritt: der abgeschlossene 8. steht nicht in der Liste, also
       auch nicht in der Tastaturfolge — der nächste Tag ist der 6. */
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(sb.payloadsOf('journal:get')).toContainEqual({ date: EARLIER }));
    /* Der Schritt läuft über `?d=…` — die Zeile ist danach die aktuelle. */
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: `Eintrag vom ${EARLIER} öffnen` })
          .getAttribute('aria-current'),
      ).toBe('true'),
    );

    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(sb.payloadsOf('journal:get')).toContainEqual({ date: OLDER }));
    expect(sb.payloadsOf('journal:get')).not.toContainEqual({ date: CLOSED });
  });

  it('filtert auch ohne zugeordnetes Modell — die Liste kommt aus den Dateien', async () => {
    open({ 'journal:list': () => MIXED, 'llm:routing': () => ({ tasks: {}, defaults: {} }) });
    await ready();

    await userEvent.click(screen.getByLabelText('Nur offene Tage'));

    expect(shown()).toEqual([TODAY, EARLIER, OLDER]);
    expect(screen.getByText('2 Tage offen')).toBeTruthy();
  });

  it('ist auch gefiltert frei von A11y-Verstößen', async () => {
    const { container } = open({ 'journal:list': () => [day(), closedDay] });
    await ready();

    await userEvent.click(screen.getByLabelText('Nur offene Tage'));

    await expectNoViolations(container);
  });
});

/* Zwei Tastaturflächen auf einem Bildschirm (010, D3). Der Kalender hat seinen
   eigenen `keydown`-Handler am Gitter, `use-journal-keys.ts` hört weiter am
   `window` — und genau eine der beiden darf auf denselben Tastendruck
   reagieren. Beide Fehlerarten sind unsichtbar in einem Screenshot: entweder
   reagieren beide (der Tag springt zweimal, die letzte Auswahl gewinnt), oder
   der Kalender frisst die Tasten der Liste. Deshalb steht hier für beide
   Richtungen ein Test. */
describe('Tagebuch: Kalender und Liste teilen die Tasten (010, D3)', () => {
  /** Die Gitterzelle zu einem Datum — über `data-date`, den Anker, den
      `MonthCalendar` dafür trägt. */
  function cellOf(dateIso: string): HTMLElement {
    const cell = document.querySelector<HTMLElement>(`.sb-monthcal-day[data-date="${dateIso}"]`);
    if (cell === null) throw new Error(`keine Kalenderzelle für ${dateIso}`);
    return cell;
  }

  /** Die Zeile der Tagesliste zu einem Datum. */
  function rowOf(dateIso: string): HTMLElement {
    return screen.getByRole('button', { name: `Eintrag vom ${dateIso} öffnen` });
  }

  async function ready(): Promise<void> {
    await screen.findByRole('group', { name: 'Monatskalender' });
  }

  it('lässt einen Pfeil im Gitter nur den Kalender bewegen, nicht auch die Liste', async () => {
    const { sb } = open();
    await ready();

    /* Erst in den 6. wechseln — von dort aus fallen die beiden Handler
       auseinander: das Gitter geht eine Woche zurück (30. Juli), die Liste
       ginge einen Listeneintrag hoch (heute, der 10.). */
    await userEvent.click(cellOf(EARLIER));
    await waitFor(() => expect(cellOf(EARLIER).getAttribute('aria-current')).toBe('true'));

    await userEvent.keyboard('{ArrowUp}');

    await waitFor(() =>
      expect(sb.payloadsOf('journal:get')).toContainEqual({ date: '2026-07-30' }),
    );
    expect(cellOf('2026-07-30').getAttribute('aria-current')).toBe('true');
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-07-30');
    /* Hätte der globale Handler mitgehört, stünde am Ende der 10. da — er läuft
       nach dem Kalender und würde dessen Auswahl überschreiben. */
    expect(rowOf(TODAY).getAttribute('aria-current')).toBeNull();
    expect(rowOf(EARLIER).getAttribute('aria-current')).toBeNull();
  });

  it('lässt j im Gitter die Tagesliste gar nicht anfassen', async () => {
    const { sb } = open();
    await ready();
    cellOf(TODAY).focus();

    await userEvent.keyboard('j');

    /* `j` kennt das Gitter nicht — und die Liste darf es von hier aus auch
       nicht kennen. Also passiert nichts. */
    expect(sb.payloadsOf('journal:get')).not.toContainEqual({ date: EARLIER });
    expect(rowOf(TODAY).getAttribute('aria-current')).toBe('true');
  });

  it('wechselt vom Listeneintrag aus weiter mit j — der Kalender hält sich heraus', async () => {
    const { sb } = open();
    await ready();
    rowOf(TODAY).focus();

    await userEvent.keyboard('j');

    await waitFor(() => expect(sb.payloadsOf('journal:get')).toContainEqual({ date: EARLIER }));
    /* Und der Kalender ist dem Tag gefolgt, ohne selbst eine Taste zu
       verbrauchen. */
    await waitFor(() => expect(cellOf(EARLIER).getAttribute('aria-current')).toBe('true'));
  });

  it('wechselt die Haltung auch aus dem Gitter heraus — Ctrl bleibt global', async () => {
    open();
    await ready();
    cellOf(TODAY).focus();

    await userEvent.keyboard('{Control>}2{/Control}');

    expect(
      screen.getByRole('button', { name: 'Haltung Tipps wählen' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

describe('Tagebuch: Fertig markieren / wieder öffnen (009, D6)', () => {
  /* Same timestamp `journal:setClosed`'s default handler above writes when
     `closed: true` — used here to build the "already closed" view directly,
     without going through a click first. */
  const CLOSED_AT = NOW.toISOString();

  it('bietet an einem offenen Tag „Als abgeschlossen markieren" und keine Marke', async () => {
    open();

    expect(await screen.findByRole('button', { name: 'Als abgeschlossen markieren' })).toBeTruthy();
    expect(screen.queryByText(/Abgeschlossen am/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Wieder öffnen' })).toBeNull();
  });

  it('zeigt an einem abgeschlossenen Tag die Marke mit Datum und „Wieder öffnen" statt des Markieren-Knopfs', async () => {
    open({ 'journal:get': () => view({ day: day({ closed: CLOSED_AT }) }) });

    expect(await screen.findByText('Abgeschlossen am 10. Aug. 2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wieder öffnen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Als abgeschlossen markieren' })).toBeNull();
  });

  it('markiert per Klick als abgeschlossen, mit dem eingefrorenen Hash, und zeigt danach die Marke', async () => {
    const state = { view: view() };
    const { sb } = open({
      'journal:get': () => state.view,
      'journal:setClosed': ({ closed }) => {
        const patched = day({ closed: closed ? CLOSED_AT : null });
        state.view = view({ day: patched });
        return patched;
      },
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Als abgeschlossen markieren' }),
    );

    await waitFor(() =>
      expect(sb.payloadOf('journal:setClosed')).toEqual({
        date: TODAY,
        closed: true,
        expectedHash: 'hash-1',
      }),
    );
    expect(await screen.findByText('Abgeschlossen am 10. Aug. 2026')).toBeTruthy();
    /* Ohne vollständigen Reload: die Liste links zieht dieselbe Abfrage nach. */
    expect(await screen.findByRole('button', { name: 'Wieder öffnen' })).toBeTruthy();
  });

  it('öffnet per Klick wieder, und die Marke verschwindet', async () => {
    const state = { view: view({ day: day({ closed: CLOSED_AT }) }) };
    const { sb } = open({
      'journal:get': () => state.view,
      'journal:setClosed': ({ closed }) => {
        const patched = day({ closed: closed ? CLOSED_AT : null });
        state.view = view({ day: patched });
        return patched;
      },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Wieder öffnen' }));

    await waitFor(() =>
      expect(sb.payloadOf('journal:setClosed')).toEqual({
        date: TODAY,
        closed: false,
        expectedHash: 'hash-1',
      }),
    );
    await waitFor(() => expect(screen.queryByText(/Abgeschlossen am/)).toBeNull());
    expect(await screen.findByRole('button', { name: 'Als abgeschlossen markieren' })).toBeTruthy();
  });

  it('meldet einen Konflikt sichtbar, statt still zu scheitern', async () => {
    open({
      'journal:setClosed': () => {
        throw Object.assign(new Error('Konflikt'), { code: 'conflict' });
      },
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Als abgeschlossen markieren' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('wurde zwischenzeitlich geändert');
  });
});
