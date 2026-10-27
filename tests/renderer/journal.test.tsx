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
  JournalDayView,
  JournalInterviewPlan,
} from '@shared/ipc';
import type {
  JournalCloseSuggestion,
  JournalDay,
  Project,
  ProviderConfig,
  Routing,
  SettingsSnapshot,
  TaskDefinition,
  VaultDoc,
  WorkTask,
} from '@shared/types';
import { JournalScreen } from '@renderer/screens/journal/JournalScreen';
import type { SbBridge } from '@renderer/lib/bridge';
import { clear as clearProposal } from '@renderer/lib/close-proposal';
import { wireEvents } from '@renderer/lib/events';
import { clearStream } from '@renderer/lib/llm-stream';
import { setOpenOnly } from '@renderer/lib/journal-filter';
import { setLanguage } from '@renderer/i18n';
import { getWorkTasks, resetWorkTasksStoreForTests, setWorkTasks } from '@renderer/lib/tasks-store';

/* Die IPC-Attrappe steht hier und nicht in `tests/setup.ts`: die Renderer-Tests
   liegen in einer eigenen tsconfig, die den gemeinsamen Aufbau nicht kennt. */
type Handlers = Partial<{
  /* Auch eine Zusage: ein Schreibvorgang, der absichtlich in der Luft
     gehalten wird, ist die einzige Art, das Fenster zwischen Abschicken und
     Antwort zu prüfen (wie in `condense-area.test.tsx`). `invoke` ist selbst
     async und löst sie deshalb auf. */
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
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
    areas: [],
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
    looseEnds: [],
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
  frontmatter: {
    people: ['Miriam'],
    projects: [project.slug],
    areas: [],
    mood: 2,
    energy: null,
    tags: [],
  },
  heuristic: true,
};

/* Since 073, D4 `journal:close` queues a task instead of answering with the
   suggestion directly (mirrors `condense:run`, D3); since D6 the screen reads
   that task back from the shared work queue (`useTaskForSubject`) instead of
   awaiting it inside the mutation, exactly like `CondensedUnitPanel` reads a
   condensation (D5). `closeTask` stands in for the task, and `closesTo` wires
   the channels one close-out now takes (`journal:close`, `work:list`,
   `tasks:result`) so every test below still describes one close-out and one
   suggestion.

   `work:list` feeds off the live queue store (`setWorkTasks`/`getWorkTasks`)
   rather than answering a fixed task unconditionally from the very first
   render — a static answer would mean the store already reports a *finished*
   close-day task before any test ever clicks "Tag abschließen", which since
   D6 would seed a proposal on mount and hide the trigger every test here
   clicks. `journal:close`'s own handler is what puts the task on the queue,
   the same moment the real main process's `event:work-tasks` would — see
   `condense-area.test.tsx`'s `runsTo` for the identical reasoning. */
function closeTask(id: string): WorkTask {
  return {
    id,
    kind: 'close-day',
    lane: 'free',
    subject: { label: TODAY, ref: TODAY },
    state: 'done',
    progress: 1,
    message: null,
    error: null,
    queuePosition: null,
    queuedAt: '2026-08-10T09:00:00.000Z',
    startedAt: '2026-08-10T09:00:00.000Z',
    finishedAt: '2026-08-10T09:00:01.000Z',
    hasResult: true,
    detail: null,
    retryable: true,
  };
}

function closesTo(result: JournalCloseSuggestion | null, id = 'close-task'): Handlers {
  if (result === null) return { 'journal:close': () => null };
  const task = closeTask(id);
  return {
    'journal:close': () => {
      setWorkTasks([...getWorkTasks(), task]);
      return task;
    },
    'work:list': () => getWorkTasks(),
    'tasks:result': () => ({ kind: 'journal-close', suggestion: result }),
  };
}

/* 012, D6: a minimal plan so opening the interview overlay from the day's own
   button doesn't hit an unhandled channel — none of these tests answer a
   question, they only check that the entry point opens/closes correctly. */
const INTERVIEW_PLAN: JournalInterviewPlan = {
  steps: [{ topic: 'work', question: 'Was hast du heute gearbeitet?' }],
  mode: 'fixed',
  finished: false,
  looseEnd: null,
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
    typicalTokens: { in: 2500, out: 400 },
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
  /* RTL's own unmount — kept distinct from `unwire` (the query-event
     listeners) so a test can tear down just the DOM tree and remount it,
     the same way navigating away from the journal screen and back does
     (018, D4: exercises `close-proposal.ts` surviving a real unmount). */
  unmount: () => void;
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
      indexRefreshFailedAt: null,
    }),
    'settings:get': () => settings,
    'journal:list': () => [day(), earlierDay],
    'journal:get': () => view(),
    'projects:list': () => [project],
    'areas:list': () => [],
    'llm:routing': () => routing(LOCAL_PROVIDER.id),
    'llm:tasks': () => TASKS,
    'llm:providers': () => [LOCAL_PROVIDER],
    'journal:coach': () => ({ threadId: `journal-${TODAY}`, messageId: 'm-1' }),
    'journal:abort': () => undefined,
    'journal:setMood': () => day({ mood: 5 }),
    'journal:setClosed': ({ closed }) => day({ closed: closed ? NOW.toISOString() : null }),
    'journal:setDay': () => ({ path: DAY_PATH, hash: 'hash-2', created: false }),
    'journal:append': () => ({ path: DAY_PATH, hash: 'hash-2', created: true }),
    ...closesTo(suggestion),
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
  const { container, unmount } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <JournalScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { sb, container, unwire, unmount };
}

let cleanup: (() => void) | null = null;

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
  /* Der Filter (009, D5) lebt modulweit und überlebt deshalb einen Test —
     ohne Rücksetzen würde ein Test den nächsten filtern. */
  setOpenOnly(false);
  /* The work queue (073, D6) is a module singleton too — without resetting it,
     a close-day task one test put on it would still be there for the next
     (`condense-area.test.tsx` resets it for the same reason). */
  resetWorkTasksStoreForTests();
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
  const field = await screen.findByLabelText('Mit dem Coach sprechen');
  await userEvent.type(field, text);
  const button =
    screen.queryByRole('button', { name: 'Sagen' }) ??
    screen.getByRole('button', { name: 'Speichern und fragen' });
  await userEvent.click(button);
}

/** The coach composer's own box — scoping queries to it, since `DayText`'s
 * cancel button (047, D2: always rendered now, not gated behind an edit
 * mode any more) carries the identical accessible name "Abbrechen" and would
 * otherwise make an unscoped `getByRole('button', { name: 'Abbrechen' })`
 * ambiguous. */
function composer(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.sb-composer');
  if (element === null) throw new Error('kein Composer im DOM');
  return element;
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
    /* Der Tagestext steht dreifach: als erste Worte der Zeile (Tagesliste), im
       Strom (`EntryStream`, derselbe Absatz als `entry`-Block) und im eigenen
       `<textarea>`-Feld selbst — das jsdom als Textknoten rendert und
       `getByText` deshalb mitzählt. 047/D2 macht dieses dritte Vorkommen erst
       möglich: das Feld ist jetzt immer da, mit dem Tagestext direkt drin,
       ohne eigenen Bearbeiten-Knopf davor. */
    expect(screen.getAllByText(DAY_TEXT).length).toBe(3);
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
    expect(screen.getByLabelText('Mit dem Coach sprechen')).toBeTruthy();
  });

  it('fragt bei einem Tag ohne Eintrag sofort im eigenen Feld, statt eine Karte zu zeigen', async () => {
    /* 047/D4: bei einem frischen Tag springt der Cursor jetzt in den eigenen
       Tagestext (`fieldRef`), nicht mehr in den Coach-Composer — der alte
       „sofort schreibbereit"-Anspruch von `DayText`s Einlade-Feld (vor
       011/D8) lebt wieder in genau diesem Feld, nur ohne den Bearbeiten-Knopf
       davor, den D2 entfernt hat. Geschrieben wird entsprechend über
       `journal:setDay`, nicht über den Coach-Weg `journal:append`. */
    const { sb } = open({ 'journal:get': () => null });

    const field = await screen.findByLabelText('Tagestext');
    await waitFor(() => expect(field).toBe(document.activeElement));
    await userEvent.type(field, 'Ein ruhiger Abend in der Werkstatt.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(sb.payloadOf('journal:setDay')).toEqual({
        date: TODAY,
        text: 'Ein ruhiger Abend in der Werkstatt.',
      }),
    );
    expect(sb.payloadsOf('journal:append')).toEqual([]);
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

describe('Tagebuch: Reihenfolge und der eine Abschluss-Knopf (047, D1-D4)', () => {
  /* The story pinned one chronological order for the whole detail column:
     head → chips → mood/energy → interview → day text → close/proposal →
     facts → legacy fold/history → coach composer, in every window width —
     there is no narrow-layout variant left to branch on. `compareDocumentPosition`
     checks the DOM order directly rather than trusting visual layout. */
  function follows(earlier: Element, later: Element): boolean {
    return Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  it('rendert Kopf, Chips, Stimmung/Energie, Interview, Tagestext, Abschluss, Fakten und Verlauf in dieser Reihenfolge', async () => {
    const { container } = open();
    await screen.findByRole('heading', { name: 'Montag, 10. August 2026' });

    const head = container.querySelector('.sb-dayentry-head');
    const chips = container.querySelector('.sb-dayentry-chips');
    const levels = container.querySelector('.sb-dayentry-levels');
    const interview = screen.getByRole('button', { name: 'Interview starten' });
    const dayText = screen.getByRole('region', { name: 'Tag' });
    const close = screen.getByRole('button', { name: 'Tag abschließen' });
    const facts = screen.getByRole('region', { name: 'Fakten' });
    const legacy = screen.getByRole('region', { name: 'Altes Gespräch' });
    const composer = screen.getByLabelText('Mit dem Coach sprechen');

    /* All present with this fixture (people/projects, no proposal open, an
       old conversation still on the day) — nothing to skip in the chain. */
    expect(head).toBeTruthy();
    expect(chips).toBeTruthy();
    expect(levels).toBeTruthy();

    const order = [
      head as Element,
      chips as Element,
      levels as Element,
      interview,
      dayText,
      close,
      facts,
      legacy,
      composer,
    ];
    for (let index = 1; index < order.length; index += 1) {
      const earlier = order[index - 1];
      const later = order[index];
      expect(earlier === undefined || later === undefined ? false : follows(earlier, later)).toBe(
        true,
      );
    }
  });

  it('macht den Tagestext ohne vorherigen Klick sofort bearbeitbar — es gibt keinen eigenen Bearbeiten-Knopf mehr', async () => {
    /* 047, D2 dropped the pencil `IconButton` edit-mode gate: the textarea is
       the day's field on every day, and needs no click first. */
    const { sb } = open();

    expect(screen.queryByRole('button', { name: 'Tagestext bearbeiten' })).toBeNull();
    const field = await screen.findByLabelText('Tagestext');
    await userEvent.clear(field);
    await userEvent.type(field, 'Ohne Klick geschrieben.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(sb.payloadOf('journal:setDay')).toEqual({
        date: TODAY,
        text: 'Ohne Klick geschrieben.',
        expectedHash: 'hash-1',
      }),
    );
  });

  it('rendert genau einen „Tag abschließen"-Knopf — kein zweiter, gleich welche Fensterbreite', async () => {
    /* `useNarrow` and the narrow-window duplicate close button in
       `CoachComposer.tsx` are both gone (047, D3): the trigger sits exactly
       once next to the facts, in every window width, so there is no layout
       prop left to vary here — the single render already is the whole
       coverage. */
    open();
    await screen.findByRole('heading', { name: 'Montag, 10. August 2026' });

    expect(screen.getAllByRole('button', { name: 'Tag abschließen' })).toHaveLength(1);
  });

  it('zeigt einen offenen Abschlussvorschlag oberhalb der Fakten, nie darunter, und lässt den Auslöser dabei verschwinden', async () => {
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Tag abschließen' }));
    const panel = (await screen.findByText(suggestion.proposal.reason)).closest(
      '.sb-close-proposal',
    ) as HTMLElement;
    const facts = screen.getByRole('region', { name: 'Fakten' });

    expect(follows(panel, facts)).toBe(true);
    /* Mutually exclusive by construction (018, decision 3; 047, D3): no
       "close the day" trigger below an open proposal. */
    expect(screen.queryByRole('button', { name: 'Tag abschließen' })).toBeNull();
  });
});

describe('Tagebuch: der Tagestext', () => {
  it('friert Wert und Hash beim Öffnen ein und schickt genau diesen Hash mit', async () => {
    const { sb } = open();

    const field = await screen.findByLabelText('Tagestext');
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

  /* 048/D3: das Tagesfeld legt auf keine Enter-Kombination mehr ab — Enter,
     Shift+Enter und Ctrl+Enter brechen nur die Zeile um, wie in jedem
     Editor. Nur „Speichern" schreibt, und Esc verlässt das Feld, ohne den
     Entwurf zu verwerfen (AC7: ein Tastendruck im Tagesfeld speichert
     nichts). */
  it('legt im Tagesfeld auf keine Enter-Kombination ab, und Esc verwirft den Entwurf nicht', async () => {
    const { sb } = open();

    const field = (await screen.findByLabelText('Tagestext')) as HTMLTextAreaElement;
    await userEvent.clear(field);

    field.focus();
    await userEvent.paste('Erste Zeile');
    await userEvent.keyboard('{Enter}');
    await userEvent.paste('zweite Zeile');
    expect(field.value).toBe('Erste Zeile\nzweite Zeile');
    expect(sb.payloadsOf('journal:setDay')).toEqual([]);

    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await userEvent.paste('dritte Zeile');
    expect(field.value).toBe('Erste Zeile\nzweite Zeile\ndritte Zeile');
    expect(sb.payloadsOf('journal:setDay')).toEqual([]);

    /* Ctrl+Enter fällt in jsdom nicht auf einen Zeilenumbruch zurück (kein
       echtes `contenteditable`-Verhalten) — entscheidend ist hier nur, dass
       kein Speichern ausgelöst wird. */
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await userEvent.paste('vierte Zeile');
    expect(sb.payloadsOf('journal:setDay')).toEqual([]);
    const draft = field.value;

    /* Esc lässt das Feld — der Entwurf bleibt stehen, keine Attrappe zum
       Verwerfen wird angerufen. */
    field.focus();
    await userEvent.keyboard('{Escape}');
    expect(field.value).toBe(draft);
    expect(field).not.toBe(document.activeElement);

    /* Erst der Knopf legt tatsächlich ab. */
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(sb.payloadOf('journal:setDay')).toMatchObject({ date: TODAY, text: draft }),
    );
  });

  /* 048, D5: same reachability requirement as the coach field, for the day's
     own field — with no Enter combination saving any more (D3), `Tab` from
     the textarea has to reach "Speichern" without a mouse. With no conflict
     and no external change open (the default fixture), the button is the
     very next stop in DOM order — see `DayText.tsx`'s `sb-daytext-foot`. */
  it('erreicht mit Tab vom Tagesfeld den Speichern-Knopf (048, D5)', async () => {
    open();
    const field = await screen.findByLabelText('Tagestext');
    const save = screen.getByRole('button', { name: 'Speichern' });

    /* Save stays disabled — and out of the tab order — until a draft exists
       (see `DayText.tsx`'s `disabled={(draft ?? '').trim().length === 0}`). */
    await userEvent.type(field, ' Noch ein Satz.');
    field.focus();
    expect(document.activeElement).toBe(field);

    await userEvent.tab();
    expect(document.activeElement).toBe(save);
  });

  it('meldet eine fremde Änderung sichtbar, statt sie stillschweigend zu überschreiben', async () => {
    const state = { view: view() };
    const { sb } = open({ 'journal:get': () => state.view });

    await userEvent.type(await screen.findByLabelText('Tagestext'), ' Und noch ein Satz.');

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

  it('schreibt nach dem Speichern auf dem gerade Geschriebenen weiter, nicht auf dem alten Stand der Abfrage', async () => {
    /* Der Refetch nach einem Speichern ist eine asynchrone IPC-Runde: für einen
       Moment meldet die Tagesabfrage noch die Datei von *vor* dem Schreiben.
       Wer in diesem Moment weitertippt (seit 047/D2 möglich — das Feld ist
       immer bearbeitbar), darf nicht auf diesen alten Text zurückfallen: der
       nächste Schreibvorgang ginge sonst mit einem Hash raus, den die Datei
       nicht mehr hat, und der angebotene Ausweg („Trotzdem speichern") würde
       genau das eben Gespeicherte wegwerfen. Die Attrappe hält den alten Stand
       hier absichtlich fest. */
    const state = { view: view() };
    const { sb } = open({
      'journal:get': () => state.view,
      'journal:setDay': () => ({ path: DAY_PATH, hash: 'hash-2', created: false }),
    });

    const field = (await screen.findByLabelText('Tagestext')) as HTMLTextAreaElement;
    await userEvent.clear(field);
    await userEvent.type(field, 'Erster Satz.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(sb.payloadOf('journal:setDay')).toMatchObject({ expectedHash: 'hash-1' }),
    );

    /* Weitertippen, während die Abfrage noch „hash-1" und den alten Text
       meldet: der eigene Stand bleibt stehen. */
    await userEvent.type(field, ' Und weiter.');
    expect(field.value).toBe('Erster Satz. Und weiter.');

    /* Jetzt kommt der eigene Schreibvorgang in der Abfrage an. Das ist keine
       fremde Änderung — es ist die eigene, und die Leiste bleibt weg. */
    state.view = view({
      text: 'Erster Satz.',
      doc: doc({ hash: 'hash-2', body: '## Tag\n\nErster Satz.\n' }),
      stream: [{ kind: 'entry', text: 'Aus der Datei angekommen.', at: null }],
    });
    sb.emit('event:vault-changed', { paths: [DAY_PATH], external: true });
    /* Am neuen Strom-Absatz ist zu erkennen, dass der Refetch angekommen ist. */
    await screen.findByText('Aus der Datei angekommen.');
    expect(field.value).toBe('Erster Satz. Und weiter.');
    expect(screen.queryByRole('alert')).toBeNull();

    /* Und das nächste Speichern geht mit dem Hash aus der eigenen Antwort raus,
       nicht mit dem eingefrorenen alten — kein Konflikt gegen sich selbst. */
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(sb.payloadsOf('journal:setDay').at(-1)).toEqual({
        date: TODAY,
        text: 'Erster Satz. Und weiter.',
        expectedHash: 'hash-2',
      }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('behält einen Tastendruck, der während des laufenden Schreibvorgangs landet', async () => {
    /* Ein Schreibvorgang ist keine Millisekunde: `journal:setDay` wartet im
       Hauptprozess auf den aufgefrischten Index, bevor es antwortet. Was in
       diesem Fenster getippt wird, gehört dem Menschen — es darf nicht
       verschwinden, sobald das Speichern zurückkommt. Genau deshalb hängt das
       Fallenlassen des Entwurfs am *Wert* („die Datei meldet genau das, was
       rausging"), nicht an einem Merker „es wurde gespeichert". */
    let land: (value: { path: string; hash: string; created: boolean }) => void = () => undefined;
    const inFlight = new Promise<{ path: string; hash: string; created: boolean }>((resolve) => {
      land = resolve;
    });
    const state = { view: view() };
    const { sb } = open({ 'journal:get': () => state.view, 'journal:setDay': () => inFlight });

    const field = (await screen.findByLabelText('Tagestext')) as HTMLTextAreaElement;
    await userEvent.clear(field);
    await userEvent.type(field, 'Erster Satz.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(sb.payloadOf('journal:setDay')).toMatchObject({ text: 'Erster Satz.' }),
    );

    /* Getippt, während der Schreibvorgang noch läuft. */
    await userEvent.type(field, ' Und im Flug.');
    expect(field.value).toBe('Erster Satz. Und im Flug.');

    /* Der Schreibvorgang kommt zurück — mit dem Text von *vorher*. */
    await act(async () => {
      land({ path: DAY_PATH, hash: 'hash-2', created: false });
    });

    expect(field.value).toBe('Erster Satz. Und im Flug.');
    /* Und es behauptet nicht, das im Feld Stehende sei gespeichert. */
    expect(screen.queryByText('Gespeichert.')).toBeNull();
    /* Der eigene Schreibvorgang ist keine fremde Änderung. */
    expect(screen.queryByRole('alert')).toBeNull();

    /* Das nächste Speichern geht mit dem Hash aus der eigenen Antwort raus:
       der Entwurf sitzt jetzt auf dem gerade Geschriebenen auf. */
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(sb.payloadsOf('journal:setDay').at(-1)).toEqual({
        date: TODAY,
        text: 'Erster Satz. Und im Flug.',
        expectedHash: 'hash-2',
      }),
    );
  });

  it('gibt den eigenen Stand frei, sobald die Abfrage einen anderen Hash meldet, statt ihn festzunageln', async () => {
    /* Zwischen einem Speichern und dem nächsten Lesen kann die Datei ein
       zweites Mal beschrieben worden sein — eine Coach-Runde, ein Klick auf
       die Stimmung, ein Editor von außen. Dann meldet die Abfrage nie den
       Hash, den die eigene Antwort zurückgegeben hat. Der eingefrorene eigene
       Stand darf sich daran nicht festhalten: sonst käme an diesem Tag keine
       fremde Fassung mehr am Feld an, und jedes weitere Speichern ginge mit
       einem Hash raus, den die Datei nicht mehr hat. */
    const state = { view: view() };
    const { sb } = open({ 'journal:get': () => state.view });

    const field = (await screen.findByLabelText('Tagestext')) as HTMLTextAreaElement;
    await userEvent.clear(field);
    await userEvent.type(field, 'Eigener Satz.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(screen.getByText('Gespeichert.')).toBeTruthy());
    /* Die Abfrage meldet noch den alten Stand, das Feld den eigenen. */
    expect(field.value).toBe('Eigener Satz.');

    /* Jetzt kommt ein Lesevorgang mit einem dritten Hash: weder der alte noch
       der aus der eigenen Antwort. */
    state.view = view({
      text: 'Von außen umgeschrieben.',
      doc: doc({ hash: 'hash-extern', body: '## Tag\n\nVon außen umgeschrieben.\n' }),
    });
    sb.emit('event:vault-changed', { paths: [DAY_PATH], external: true });

    /* Freigegeben: die fremde Fassung kommt am Feld an, statt hinter dem
       eigenen Stand für immer unsichtbar zu bleiben. */
    await waitFor(() => expect(field.value).toBe('Von außen umgeschrieben.'));

    /* Und der nächste Schreibvorgang geht mit dem Hash der Datei raus, nicht
       mit dem eingefrorenen eigenen — kein Konflikt gegen ein Gespenst. */
    await userEvent.type(field, ' Dazu.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(sb.payloadsOf('journal:setDay').at(-1)).toMatchObject({
        expectedHash: 'hash-extern',
      }),
    );
  });

  it('meldet eine fremde Änderung auch dann noch, wenn an diesem Tag schon einmal gespeichert wurde', async () => {
    /* Die Kehrseite: steht beim Eintreffen der fremden Fassung ein eigener
       Entwurf im Feld, muss die Leiste kommen — und der eingefrorene Hash ist
       der des eigenen Schreibvorgangs, auf dem der Entwurf aufsitzt. */
    const state = { view: view() };
    const { sb } = open({ 'journal:get': () => state.view });

    const field = (await screen.findByLabelText('Tagestext')) as HTMLTextAreaElement;
    await userEvent.clear(field);
    await userEvent.type(field, 'Eigener Satz.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(screen.getByText('Gespeichert.')).toBeTruthy());
    /* Weiterschreiben auf dem eben Gespeicherten. */
    await userEvent.type(field, ' Weiter.');

    state.view = view({
      text: 'Von außen umgeschrieben.',
      doc: doc({ hash: 'hash-extern', body: '## Tag\n\nVon außen umgeschrieben.\n' }),
    });
    sb.emit('event:vault-changed', { paths: [DAY_PATH], external: true });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Dieser Abschnitt hat sich außerhalb geändert');
    expect(field.value).toBe('Eigener Satz. Weiter.');

    await userEvent.click(within(alert).getByRole('button', { name: 'Meinen Text behalten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(sb.payloadsOf('journal:setDay').at(-1)).toMatchObject({ expectedHash: 'hash-2' }),
    );
  });

  it('bietet nach einem Konflikt den ausdrücklichen Weg zum Überschreiben', async () => {
    const { sb } = open({
      'journal:setDay': () => {
        throw Object.assign(new Error('Konflikt'), { code: 'conflict' });
      },
    });

    await userEvent.type(await screen.findByLabelText('Tagestext'), ' Zusatz.');
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
  /* Das Feld ist ein Schreibfeld, kein Fragefeld: Enter bricht die Zeile um wie
     in jedem Editor — und seit 048/D2 legt auch keine Enter-Kombination mehr
     ab, weder Shift+Enter noch Ctrl+Enter. Nur der Knopf legt ab. */
  it('bricht mit Enter, Shift+Enter und Ctrl+Enter nur die Zeile um — keine Kombination legt ab', async () => {
    const { sb } = open();
    const field = (await screen.findByLabelText('Mit dem Coach sprechen')) as HTMLTextAreaElement;

    field.focus();
    await userEvent.paste('Erste Zeile');
    await userEvent.keyboard('{Enter}');
    await userEvent.paste('zweite Zeile');
    expect(field.value).toBe('Erste Zeile\nzweite Zeile');
    expect(sb.payloadsOf('journal:append')).toEqual([]);

    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await userEvent.paste('dritte Zeile');
    expect(field.value).toBe('Erste Zeile\nzweite Zeile\ndritte Zeile');
    expect(sb.payloadsOf('journal:append')).toEqual([]);

    /* Ctrl+Enter fällt in jsdom nicht auf einen Zeilenumbruch zurück (kein
       echtes `contenteditable`-Verhalten) — entscheidend ist hier nur, dass
       kein Ablegen ausgelöst wird, nicht die genaue Umbruchstelle. */
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await userEvent.paste('vierte Zeile');
    expect(sb.payloadsOf('journal:append')).toEqual([]);
    const finalValue = field.value;

    await userEvent.click(screen.getByRole('button', { name: 'Sagen' }));
    await waitFor(() =>
      expect(sb.payloadOf('journal:append')).toEqual({
        date: TODAY,
        text: finalValue,
      }),
    );
  });

  /* Der Hinweis über dem Feld darf keine Taste mehr nennen, die ablegt — er
     nennt stattdessen den Knopf, der es tatsächlich tut (048, D2). */
  it('nennt im Hinweis den Knopf statt einer Taste, und Enter nur für den Umbruch', async () => {
    open();
    await screen.findByLabelText('Mit dem Coach sprechen');

    const hint = document
      .querySelector('#sb-journal-field')
      ?.closest('.sb-composer')
      ?.querySelector('.sb-composer-hint');
    expect(hint?.textContent).toContain('Entermacht einen Umbruch');
    expect(hint?.textContent).toContain('Nur der Knopf „Sagen“ legt ab.');
    expect(hint?.textContent).not.toContain('Shift+Enter');
  });

  /* 048, D5: with no key filing any more (D2), the send button must be
     reachable without a mouse. `submitKey="none"` doesn't reorder the DOM —
     it only stops the field from swallowing Enter — so plain `Tab` from the
     field has to land on the stance switch first (the one control between
     field and button in `CoachComposer.tsx`'s footer) and then on the send
     button itself, in that DOM order. */
  it('erreicht mit Tab vom Gesprächsfeld über die Haltungsauswahl den Sagen-Knopf (048, D5)', async () => {
    open();
    const field = await screen.findByLabelText('Mit dem Coach sprechen');
    const send = screen.getByRole('button', { name: 'Sagen' });
    const stanceButtons = screen.getAllByRole('button', { name: /^Haltung .+ wählen$/ });
    expect(stanceButtons.length).toBeGreaterThan(0);

    /* The button is disabled — and so out of the tab order — while the field
       is empty (see `ChatComposer.tsx`); some text makes it a real stop. */
    await userEvent.type(field, 'Kurzer Satz.');
    field.focus();
    expect(document.activeElement).toBe(field);

    for (const stance of stanceButtons) {
      await userEvent.tab();
      expect(document.activeElement).toBe(stance);
    }
    await userEvent.tab();
    expect(document.activeElement).toBe(send);
  });

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
    const field = (await screen.findByLabelText('Mit dem Coach sprechen')) as HTMLTextAreaElement;
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

    const field = await screen.findByLabelText('Mit dem Coach sprechen');
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
    expect(screen.queryByRole('article', { name: 'Gaston' })).toBeNull();
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
    const cancel = await within(composer()).findByRole('button', { name: 'Abbrechen' });
    await userEvent.click(cancel);

    await waitFor(() => expect(sb.payloadOf('journal:abort')).toEqual({ messageId: 'm-1' }));
  });

  it('schickt während einer laufenden Antwort keine zweite Runde', async () => {
    const { sb } = open();
    await userEvent.click(await screen.findByRole('button', { name: 'Haltung Tipps wählen' }));

    await say('Erste Runde.');
    await within(composer()).findByRole('button', { name: 'Abbrechen' });
    /* Enter im Feld: zwei Runden gleichzeitig würden sich beim Schreiben in
       dieselbe Datei überholen. */
    await userEvent.type(
      await screen.findByLabelText('Mit dem Coach sprechen'),
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

    /* The field is untouched by the legacy block — it operates on
       `view.text`/`view.doc.hash` alone (D8), regardless of `view.turns`.
       There is no separate view mode any more (047, D2): the day's own text
       is already in the textarea, ready to keep typing into. */
    const field = screen.getByLabelText('Tagestext') as HTMLTextAreaElement;
    expect(field.value).toBe(DAY_TEXT);
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
  /* 018 turned the close-out from a blocking `CloseDialog` into a non-modal
     `CloseProposal` card that sits next to the day's own text — a `gs-card`
     without a dialog role, so it is found by its content, not by role
     `dialog`. Its edit state lives in `lib/close-proposal.ts`, module-scoped
     and keyed by date; without resetting it here, one test's edits would
     leak into the next. */
  beforeEach(() => clearProposal(TODAY));
  afterEach(() => clearProposal(TODAY));

  /** Öffnet den Vorschlag über den Knopf bei den Fakten und liefert die
   * gerenderte Karte selbst zurück, statt eines Dialog-Elements. */
  async function openClose(extra: Handlers = {}): Promise<{ sb: Mock; panel: HTMLElement }> {
    const { sb } = open(extra);
    await userEvent.click(await screen.findByRole('button', { name: 'Tag abschließen' }));
    const reason = await screen.findByText(suggestion.proposal.reason);
    const panel = reason.closest('.sb-close-proposal') as HTMLElement;
    return { sb, panel };
  }

  it('zeigt den Vorschlag mit Ziel, Grund und Fristen — und schreibt noch nichts', async () => {
    const { sb, panel } = await openClose();

    expect(sb.payloadOf('journal:close')).toEqual({ date: TODAY });
    expect(panel.textContent).toContain('Ohne Modell im Tageseintrag erkannt');
    expect(within(panel).getByLabelText('Ladezeiten der Angebotsliste messen')).toBeTruthy();
    /* Das Ziel steht dabei: ein Todo mit Projekt geht in dessen Datei. */
    expect(panel.textContent).toContain('in Projekt Kundenportal Relaunch');
    expect(panel.textContent).toContain('in Tageseintrag, Abschnitt Fakten');
    /* Das Warte-auf sagt, in welcher Form es notiert wird. */
    expect(within(panel).getByLabelText('Freigabe des Rollenkonzepts')).toBeTruthy();
    expect(panel.textContent).toContain('als Todo mit @wait im Tageseintrag');
    expect(panel.textContent).toContain('Stimmung Gedrückt');
    /* Und bis hierher ist nichts geschrieben. */
    expect(sb.payloadsOf('journal:applyClose')).toEqual([]);
  });

  it('steht neben dem Tagestext statt ihn zu verdecken — kein Dialog mehr, beides gleichzeitig sichtbar', async () => {
    const { panel } = await openClose();

    /* Die ganze Story: es gibt keine Modal-Ebene mehr, die den Text
       verdeckt — beides ist gleichzeitig da, ohne dass irgendetwas
       geschlossen oder weggeklickt werden muss. */
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByText(DAY_TEXT).length).toBeGreaterThan(0);
    expect(within(panel).getByText(suggestion.proposal.reason)).toBeTruthy();
  });

  it('übersteht ein Verlassen und Zurückkommen des Bildschirms mitsamt den eigenen Änderungen', async () => {
    const first = open();
    await userEvent.click(await screen.findByRole('button', { name: 'Tag abschließen' }));
    const reason = await screen.findByText(suggestion.proposal.reason);
    const panelBefore = reason.closest('.sb-close-proposal') as HTMLElement;

    /* Ein Todo abwählen — das ist die Änderung, die den Neustart überstehen muss. */
    await userEvent.click(within(panelBefore).getByLabelText('Belege 2025 sortieren'));
    expect(
      (within(panelBefore).getByLabelText('Belege 2025 sortieren') as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (
        within(panelBefore).getByLabelText(
          'Ladezeiten der Angebotsliste messen',
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);

    /* Der Screen wird komplett unmontiert und frisch neu gerendert — wie ein
       Wechsel auf einen anderen Screen und zurück. Der Vorschlag lebt in
       `close-proposal.ts`, nicht in diesem Bildschirm, und muss deshalb ohne
       neuen Lauf sofort wieder da sein. */
    act(() => first.unmount());

    const second = open();
    const panelAfter = (await screen.findByText(suggestion.proposal.reason)).closest(
      '.sb-close-proposal',
    ) as HTMLElement;

    expect(
      (within(panelAfter).getByLabelText('Belege 2025 sortieren') as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (within(panelAfter).getByLabelText('Ladezeiten der Angebotsliste messen') as HTMLInputElement)
        .checked,
    ).toBe(true);
    /* Kein zweiter Lauf, nur die alten, in der Sitzung gehaltenen Daten. */
    expect(second.sb.payloadsOf('journal:close')).toEqual([]);
  });

  it('übernimmt nur das Ausgewählte und bietet danach den Rückweg', async () => {
    const { sb, panel } = await openClose();

    await userEvent.click(within(panel).getByLabelText('Belege 2025 sortieren'));
    /* Personen sind seit 075, D4 Chips statt einer Alles-oder-nichts-Checkbox
       — die einzige vorgeschlagene Person wird über ihre eigene Entfernen-
       Schaltfläche abgewählt, nicht über ein Feld-Kontrollkästchen. */
    await userEvent.click(within(panel).getByRole('button', { name: '„Miriam“ entfernen' }));
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Übernehmen und abschließen' }),
    );

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

    /* Danach steht da, was passiert ist — mit Rückgängig. Der Vorschlag selbst
       ist weg, weil er zu einer geschriebenen Tatsache geworden ist (018). */
    expect(await screen.findByText('Übernommen in')).toBeTruthy();
    expect(screen.queryByText(suggestion.proposal.reason)).toBeNull();
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

  it('setzt nach dem Übernehmen die Marke im Kopf, ohne dass neu geladen werden muss (AC2)', async () => {
    /* Same pattern as the reopen test: `journal:get` reflects the write the
       mock just made, so the assertion pins the real invalidate-and-refetch
       path (mutations.applyClose's onSuccess → qk.journal.day) instead of
       just trusting it happened. */
    const state = { view: view() };
    const { sb, panel } = await openClose({
      'journal:get': () => state.view,
      'journal:applyClose': () => {
        state.view = view({ day: day({ closed: NOW.toISOString() }) });
        return {
          written: [DAY_PATH, project.path],
          undo: [{ path: DAY_PATH, body: doc().body, expectedHash: 'hash-3' }],
        };
      },
    });

    expect(screen.queryByText(/Abgeschlossen am/)).toBeNull();
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Übernehmen und abschließen' }),
    );

    await waitFor(() => expect(sb.payloadOf('journal:applyClose')).toBeTruthy());
    expect(await screen.findByText(/Abgeschlossen am/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tag abschließen' })).toBeNull();
  });

  it('Verwerfen nimmt den Vorschlag weg und schreibt nichts', async () => {
    const { sb, panel } = await openClose();

    await userEvent.click(within(panel).getByRole('button', { name: 'Verwerfen' }));

    await waitFor(() => expect(screen.queryByText(suggestion.proposal.reason)).toBeNull());
    expect(sb.payloadsOf('journal:applyClose')).toEqual([]);
    /* Der Auslöser-Knopf ist wieder da — nichts hindert einen neuen Lauf. */
    expect(await screen.findByRole('button', { name: 'Tag abschließen' })).toBeTruthy();
  });

  it('Erneut ausführen ersetzt den Fund vollständig statt ihn mit dem alten zu vermischen', async () => {
    const rerun: JournalCloseSuggestion = {
      ...suggestion,
      proposal: {
        ...suggestion.proposal,
        reason: 'Zweiter Lauf: nur noch eine Sache offen.',
        todos: [
          {
            text: 'Nur diese eine Sache',
            scope: 'work',
            due: null,
            waitingFor: null,
            priority: 0,
            project: null,
          },
        ],
        waitingOn: [],
      },
    };
    let calls = 0;
    const { sb, panel } = await openClose({
      /* Each call puts its own task on the live queue as it happens — the
         same reason `closesTo` above does, rather than answering `work:list`
         with both tasks unconditionally from the very first render, which
         would seed the rerun's result before "Erneut ausführen" was ever
         clicked. */
      'journal:close': () => {
        const task = closeTask(calls === 0 ? 'close-task-1' : 'close-task-2');
        calls += 1;
        setWorkTasks([...getWorkTasks(), task]);
        return task;
      },
      'work:list': () => getWorkTasks(),
      'tasks:result': ({ id }) => ({
        kind: 'journal-close',
        suggestion: id === 'close-task-1' ? suggestion : rerun,
      }),
    });

    await userEvent.click(within(panel).getByRole('button', { name: 'Erneut ausführen' }));

    const panelAfter = (await screen.findByText(rerun.proposal.reason)).closest(
      '.sb-close-proposal',
    ) as HTMLElement;
    expect(within(panelAfter).getByLabelText('Nur diese eine Sache')).toBeTruthy();
    /* Der alte Fund ist weg, nicht bloß ergänzt. */
    expect(screen.queryByText(suggestion.proposal.reason)).toBeNull();
    expect(screen.queryByLabelText('Ladezeiten der Angebotsliste messen')).toBeNull();
    expect(screen.queryByLabelText('Belege 2025 sortieren')).toBeNull();
    expect(sb.payloadsOf('journal:close')).toEqual([{ date: TODAY }, { date: TODAY }]);
  });

  it('sagt vorher, wenn nichts zu holen ist — aber der Knopf bleibt aktiv, weil Übernehmen den Tag trotzdem abschließt (049, D3)', async () => {
    const { sb, panel } = await openClose(
      closesTo({
        ...suggestion,
        proposal: { ...suggestion.proposal, todos: [], waitingOn: [] },
        frontmatter: { people: [], projects: [], areas: [], mood: null, energy: null, tags: [] },
      }),
    );

    expect(panel.textContent).toContain('Im Tagestext war nichts zu holen');
    /* Das war der Sackgassen-Fall: ein leerer Fund durfte den Knopf früher
       tot schalten, und der Tag konnte nie geschlossen werden. Jetzt bleibt
       der Knopf aktiv — nur `busy` (laufender Request) deaktiviert ihn. */
    const applyButton = within(panel).getByRole('button', { name: 'Übernehmen und abschließen' });
    expect(applyButton.hasAttribute('disabled')).toBe(false);

    await userEvent.click(applyButton);

    await waitFor(() => {
      const payload = sb.payloadOf('journal:applyClose') as IpcRequest<'journal:applyClose'>;
      expect(payload.todos).toEqual([]);
      expect(payload.frontmatter).toEqual({
        people: [],
        projects: [],
        areas: [],
        mood: null,
        energy: null,
        tags: [],
      });
      expect(payload.expectedHash).toBe('hash-1');
    });
  });

  it('zeigt den Heuristik-Hinweis, wenn ohne Modell (heuristisch) gefunden wurde', async () => {
    const { panel } = await openClose();
    expect(within(panel).getByText('Ohne Modell gefunden — Regeln statt Verstehen.')).toBeTruthy();
  });

  it('liefert auch ohne konfiguriertes Modell einen Vorschlag mit dem Heuristik-Hinweis', async () => {
    /* Kein Provider, keine Routing-Zuordnung — „kein Modell konfiguriert".
       Der Kanal selbst liefert (wie im echten Hauptprozess) trotzdem einen
       heuristischen Vorschlag statt gar nichts (Guardrail 1). */
    const noModelSettings: SettingsSnapshot = {
      ...settings,
      vault: {
        ...(settings.vault as NonNullable<SettingsSnapshot['vault']>),
        providers: [],
        routing: { tasks: {}, defaults: {} },
      },
    };
    const { sb, panel } = await openClose({
      'settings:get': () => noModelSettings,
    });

    expect(within(panel).getByText('Ohne Modell gefunden — Regeln statt Verstehen.')).toBeTruthy();
    expect(within(panel).getByLabelText('Ladezeiten der Angebotsliste messen')).toBeTruthy();

    /* Der Abschluss selbst braucht kein Modell: der Übernehmen-Weg ist
       derselbe wie mit einem konfigurierten Provider. */
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Übernehmen und abschließen' }),
    );
    await waitFor(() => expect(sb.payloadOf('journal:applyClose')).toBeTruthy());
    expect(await screen.findByText('Übernommen in')).toBeTruthy();
  });

  it('ist im Vorschlag frei von A11y-Verstößen', async () => {
    const { container } = open();
    await userEvent.click(await screen.findByRole('button', { name: 'Tag abschließen' }));
    await screen.findByText(suggestion.proposal.reason);
    await expectNoViolations(container);
  });
});

describe('Tagebuch: Tagesabschluss an einem Tag ohne Text (049, D4)', () => {
  /* `journal:close` returns `null` when the day's file exists but carries no
     (or blank) text — there is nothing to run extraction on. With the manual
     header switch gone (049, D1/D2), the "Tag abschließen" trigger is the
     only way left to close such a day: a silent no-op on `null` would be a
     dead end. */
  beforeEach(() => {
    clearProposal(TODAY);
    clearProposal(EARLIER);
  });
  afterEach(() => {
    clearProposal(TODAY);
    clearProposal(EARLIER);
  });

  it('öffnet den Vorschlag leer statt gar nichts zu tun, und Übernehmen schließt den Tag trotzdem ab', async () => {
    const { sb } = open({ 'journal:close': () => null });

    await userEvent.click(await screen.findByRole('button', { name: 'Tag abschließen' }));

    const reason = await screen.findByText(
      'Im Tagestext steht noch nichts, was sich herausziehen ließe.',
    );
    const panel = reason.closest('.sb-close-proposal') as HTMLElement;
    expect(panel).toBeTruthy();
    /* The "nothing found" line the real, non-null path also shows once the
       find is empty — honest either way. */
    expect(
      within(panel).getByText(
        'Im Tagestext war nichts zu holen. „Übernehmen und abschließen“ schließt den Tag trotzdem ab.',
      ),
    ).toBeTruthy();
    expect(sb.payloadsOf('journal:applyClose')).toEqual([]);

    const applyButton = within(panel).getByRole('button', { name: 'Übernehmen und abschließen' });
    expect(applyButton.hasAttribute('disabled')).toBe(false);
    await userEvent.click(applyButton);

    await waitFor(() => {
      const payload = sb.payloadOf('journal:applyClose') as IpcRequest<'journal:applyClose'>;
      expect(payload.todos).toEqual([]);
      expect(payload.frontmatter).toEqual({
        people: [],
        projects: [],
        areas: [],
        mood: null,
        energy: null,
        tags: [],
      });
      expect(payload.expectedHash).toBe('hash-1');
    });
  });

  it('bleibt unter dem angeklickten Datum — ein Tageswechsel nimmt den leeren Vorschlag nicht mit', async () => {
    open({ 'journal:close': () => null, 'journal:list': () => [day(), earlierDay] });

    await userEvent.click(await screen.findByRole('button', { name: 'Tag abschließen' }));
    await screen.findByText('Im Tagestext steht noch nichts, was sich herausziehen ließe.');

    await userEvent.click(
      await screen.findByRole('button', { name: `Eintrag vom ${EARLIER} öffnen` }),
    );

    /* The empty panel that opened for TODAY must not follow onto the other
       day — the store is keyed by date, and this screen only ever renders
       the entry for the day currently shown. */
    expect(
      screen.queryByText('Im Tagestext steht noch nichts, was sich herausziehen ließe.'),
    ).toBeNull();
    /* Nothing was ever proposed for `EARLIER`, so its own trigger is back. */
    expect(await screen.findByRole('button', { name: 'Tag abschließen' })).toBeTruthy();
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

  it('bleibt secondary und klein — an einem leeren wie an einem beschriebenen Tag, mit oder ohne eigenen Entwurf (047, D4)', async () => {
    /* 047/D4 dropped the primary/secondary switch this button used to make
       depending on whether the day already had prose or a draft: the
       screen's one teal accent belongs to the day field's own save action
       now (`DayText.tsx`), not to this button — so it renders
       `variant="secondary" size="sm"` unconditionally, on every day. */
    open({ 'journal:get': () => null });

    const button = await screen.findByRole('button', { name: 'Interview starten' });
    expect(button.className).toContain('gs-btn--secondary');
    expect(button.className).not.toContain('gs-btn--primary');
    /* „Klein" ist eine Klasse, nicht nur ein Wort im Titel: `size="sm"`
       (`atoms/Button.tsx`) — die mittlere Größe wäre hier die Voreinstellung
       und damit still. */
    expect(button.className).toContain('gs-btn--sm');
    expect(button.className).not.toContain('gs-btn--md');
    /* Und die Umhüllung, die ihn in der streckenden Spalte auf seiner eigenen
       Breite hält (047, Q4). jsdom wendet das Stylesheet nicht an, eine
       gemessene Breite gäbe es hier also nicht — prüfbar ist, dass der Knopf
       nicht nackt in `.sb-dayentry` hängt, wo er die vollen 74ch spannen
       würde. */
    expect(button.parentElement?.className).toContain('sb-dayentry-interview');
    expect(button.parentElement?.parentElement?.className).toContain('sb-dayentry');

    const field = await screen.findByLabelText('Tagestext');
    await userEvent.type(field, 'Ein erster eigener Satz.');

    expect(button.className).toContain('gs-btn--secondary');
    expect(button.className).not.toContain('gs-btn--primary');
    expect(button.className).toContain('gs-btn--sm');
    expect(button.parentElement?.className).toContain('sb-dayentry-interview');
  });

  it('ist auch an einem beschriebenen Tag secondary', async () => {
    open();

    const button = await screen.findByRole('button', { name: 'Interview starten' });
    expect(button.className).toContain('gs-btn--secondary');
  });

  it('öffnet beim Klick das Interview-Overlay', async () => {
    open();

    await userEvent.click(await screen.findByRole('button', { name: 'Interview starten' }));

    expect(await screen.findByRole('dialog', { name: 'Interview' })).toBeTruthy();
  });

  it('lässt beim Schließen den Tagestext bearbeitbar zurück und setzt den Cursor genau dorthin', async () => {
    /* 047/D4: das Schließen des Interviews gibt den Fokus nicht mehr an den
       Coach-Composer zurück, sondern an den Tag selbst — dieselbe `fieldRef`,
       die auch der Autofokus auf einem frischen Tag benutzt. */
    open();

    await userEvent.click(await screen.findByRole('button', { name: 'Interview starten' }));
    const dialog = await screen.findByRole('dialog', { name: 'Interview' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Verlassen und selbst schreiben' }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const field = screen.getByLabelText('Tagestext') as HTMLTextAreaElement;
    expect(field.disabled).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(field));
  });
});

describe('Tagebuch: loses Ende am Tag (022, D6)', () => {
  /* A loose end only ever stands on a day before today (`isBefore` in
     `loose-ends.ts`) — `TODAY` is the one day it could never carry, so the
     fixture has to use a past day, `EARLIER`, to exercise the real path. */
  const LOOSE_END = {
    id: 'loose-end:1',
    day: EARLIER,
    quote: 'Morgen sehe ich mir das Angebot noch mal an.',
    resolution: null,
  };
  /* Deliberately different from today's `hash-1` (via the default `view()`),
     so a test that asserted the wrong hash would fail loudly instead of
     passing by coincidence. */
  const EARLIER_HASH = 'hash-past';

  function withLooseEnd(extra: Handlers = {}): Handlers {
    return {
      'journal:get': ({ date }) =>
        date === EARLIER
          ? view({ looseEnds: [LOOSE_END], doc: doc({ hash: EARLIER_HASH }) })
          : view(),
      ...extra,
    };
  }

  async function openOnEarlierDay(extra: Handlers = {}): Promise<{ sb: Mock }> {
    const { sb } = open(withLooseEnd(extra));
    await userEvent.click(
      await screen.findByRole('button', { name: `Eintrag vom ${EARLIER} öffnen` }),
    );
    return { sb };
  }

  it('zeigt das lose Ende der Ankündigung direkt am Tag, ohne den Umweg über die Wartung', async () => {
    await openOnEarlierDay();

    expect(await screen.findByText(`„${LOOSE_END.quote}“`)).toBeTruthy();
  });

  it('beantwortet das lose Ende über journal:answerLooseEnd, mit dem Hash von heute statt vom betrachteten Tag', async () => {
    const { sb } = await openOnEarlierDay();

    await screen.findByText(`„${LOOSE_END.quote}“`);
    await userEvent.type(screen.getByLabelText('Antwort'), 'Erledigt, alles gut.');
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));

    /* `journal:answerLooseEnd` always appends into *today*'s file, no matter
       which day's loose-end row triggered it — the concurrency guard has to
       carry today's hash (`hash-1`), never the viewed day's (`hash-past`),
       or every answer would fail with `conflict`. */
    await waitFor(() =>
      expect(sb.payloadOf('journal:answerLooseEnd')).toEqual({
        id: LOOSE_END.id,
        day: LOOSE_END.day,
        text: 'Erledigt, alles gut.',
        expectedHash: 'hash-1',
      }),
    );
  });

  it('lässt die Zeile nach dem Beantworten verschwinden, weil der Tag mit dem offenen Filter neu geladen wird', async () => {
    const state = { view: view({ looseEnds: [LOOSE_END], doc: doc({ hash: EARLIER_HASH }) }) };
    const { sb } = await openOnEarlierDay({
      'journal:get': ({ date }) => (date === EARLIER ? state.view : view()),
      'journal:answerLooseEnd': () => {
        /* `openLooseEnds()` (020, D5) is the single source of truth: once the
           answer is written, a re-fetch of the day no longer lists it — the
           row disappearing is a direct consequence of that filter, not a
           second check this component invents on its own. */
        state.view = view({ looseEnds: [] });
        return { path: DAY_PATH, hash: 'hash-6' };
      },
    });

    await screen.findByText(`„${LOOSE_END.quote}“`);
    await userEvent.type(screen.getByLabelText('Antwort'), 'Erledigt.');
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));

    await waitFor(() => expect(sb.payloadOf('journal:answerLooseEnd')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText(`„${LOOSE_END.quote}“`)).toBeNull());
  });

  it('zeigt keine Zeile, solange kein loses Ende am Tag offen ist', async () => {
    open();

    await screen.findByRole('heading', { name: 'Montag, 10. August 2026' });
    expect(screen.queryByLabelText('Antwort')).toBeNull();
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

describe('Tagebuch: wieder öffnen (009, D6; 049, D1)', () => {
  /* Same timestamp `journal:setClosed`'s default handler above writes when
     `closed: true` — used here to build the "already closed" view directly,
     without going through a click first. The manual "mark as finished"
     switch is gone (049, D1): the header offers exactly one action, and it
     only ever runs the other direction, `closed: false`. */
  const CLOSED_AT = NOW.toISOString();

  it('zeigt an einem offenen Tag weder die Marke noch „Wieder öffnen" und keinen „Als abgeschlossen markieren"-Knopf', async () => {
    open();

    expect(screen.queryByText(/Abgeschlossen am/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Wieder öffnen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Als abgeschlossen markieren' })).toBeNull();
  });

  it('zeigt an einem abgeschlossenen Tag die Marke mit Datum und „Wieder öffnen"', async () => {
    open({ 'journal:get': () => view({ day: day({ closed: CLOSED_AT }) }) });

    expect(await screen.findByText('Abgeschlossen am 10. Aug. 2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wieder öffnen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Als abgeschlossen markieren' })).toBeNull();
  });

  it('öffnet per Klick wieder, mit dem eingefrorenen Hash, und die Marke verschwindet ohne vollständigen Reload', async () => {
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
    expect(screen.queryByRole('button', { name: 'Wieder öffnen' })).toBeNull();
  });

  it('meldet einen Konflikt beim Wiederöffnen sichtbar, statt still zu scheitern', async () => {
    open({
      'journal:get': () => view({ day: day({ closed: CLOSED_AT }) }),
      'journal:setClosed': () => {
        throw Object.assign(new Error('Konflikt'), { code: 'conflict' });
      },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Wieder öffnen' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('wurde zwischenzeitlich geändert');
  });

  it('zeigt an einem abgeschlossenen Tag keinen „Tag abschließen"-Auslöser (049, D2)', async () => {
    open({ 'journal:get': () => view({ day: day({ closed: CLOSED_AT }) }) });

    await screen.findByRole('button', { name: 'Wieder öffnen' });
    expect(screen.queryByRole('button', { name: 'Tag abschließen' })).toBeNull();
  });
});
