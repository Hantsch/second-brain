// @vitest-environment jsdom
/* Der Projekt-Screen: die Antwort auf „wo war ich stehengeblieben?".
 *
 * Geprüft wird, was der Screen behauptet — und dass er nur behauptet, was
 * wirklich passiert: der Statuswechsel schreibt, der Vorschlag schreibt nicht,
 * das Häkchen geht an genau ein Todo. Dazu die Trennung von Arbeit und Privat,
 * die Gruppierung nach Fälligkeit, die beiden Leerzustände und die Tastatur.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { Project, Todo, VaultDoc } from '@shared/types';
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

function todo(patch: Partial<Todo> & { id: string; text: string }): Todo {
  return {
    state: 'open',
    scope: 'work',
    path: portal.path,
    line: 20,
    project: portal.slug,
    projectTitle: portal.title,
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
    body: BODY,
    hash: docHash,
    modified: NOW,
    size: 800,
  };
}

// ── Attrappe ─────────────────────────────────────────────────────────────────

interface Options {
  projects?: Project[];
  todos?: Todo[];
  extra?: SbHandlers;
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
    'claude:sessions': () => [],
    'shell:openPath': () => undefined,
    ...options.extra,
  };
  const sb = installSbMock(handlers);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  /* `main` wie in der Hülle (`AppShell`): ohne Landmarke wäre jeder axe-Lauf ein
     Verstoß, der im echten Screen nicht existiert. */
  const rendered = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/projects']}>
        <main>
          <ProjectsScreen />
        </main>
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
    expect(await screen.findByText(/Kein Projekt passt zu „zebra"/)).toBeTruthy();
  });

  it('zeigt offene Todos, Frist und Alter in der Zeile', async () => {
    mount();
    const list = await screen.findByRole('list', { name: 'Projekte' });
    const row = within(list).getAllByRole('button')[0];

    expect(row?.textContent).toContain('2 offen');
    expect(row?.textContent).toContain('Aug');
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
    expect(await screen.findByText('Status steht jetzt auf „Pausiert".')).toBeTruthy();
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
      screen.getByRole('checkbox', { name: '„Testmandant aufsetzen" abhaken' }),
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
    expect(screen.getByText(/bleibt mit „resolved: true" in der Projektdatei/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));

    await waitFor(() => expect(callsTo(sb, 'projects:patch')).toHaveLength(1));
    /* Genau die Liste von vor dem Klick, wortwörtlich aus der Datei — samt
       `ticket`, das die App nicht deutet. */
    expect(callsTo(sb, 'projects:patch')[0]).toEqual({
      slug: portal.slug,
      patch: { waiting_on: RAW_WAITING },
    });
  });

  it('zeigt Warte-auf mit Person, Sache und Überfälligkeit', async () => {
    mount();
    await detailReady();

    expect(screen.getByText('Jonas')).toBeTruthy();
    expect(screen.getByText('Fallback für Sitzungen')).toBeTruthy();
    expect(screen.getByText('überfällig')).toBeTruthy();
  });

  it('rendert den Stand als Prosa und die Notizen einklappbar', async () => {
    mount();
    await detailReady();

    expect(screen.getByText('Die neue Angebotsliste liegt auf dem Testsystem.')).toBeTruthy();
    expect(screen.queryByText('Testlauf mit Miriam lief durch.')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Notizen zeigen' }));
    expect(screen.getByText('Testlauf mit Miriam lief durch.')).toBeTruthy();
  });

  it('zeigt die Arbeitsspur ehrlich, wenn der Kanal noch fehlt', async () => {
    mount({
      extra: {
        'claude:sessions': () => {
          throw Object.assign(new Error('noch nicht implementiert'), { code: 'invalid' });
        },
      },
    });
    await detailReady();

    expect(await screen.findByText(/Claude-Sessions sind noch nicht angeschlossen/)).toBeTruthy();
    /* Die Dateispur kennt der Index trotzdem. */
    expect(screen.getByText(/Letzte Spur/)).toBeTruthy();
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
      await screen.findByRole('checkbox', { name: '„Testmandant aufsetzen" abhaken' }),
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
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

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
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

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
    expect(screen.getByText(/@wait:Name für „warte auf"/)).toBeTruthy();
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

    const box = await screen.findByRole('checkbox', { name: '„Testmandant aufsetzen" abhaken' });
    box.focus();
    await userEvent.keyboard('x');

    await waitFor(() => expect(callsTo(sb, 'todos:toggle')).toEqual([{ id: someday.id }]));
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

  it('hat keinen Verstoß im Dialog', async () => {
    mount();
    await screen.findByRole('list', { name: 'Projekte' });
    await userEvent.click(screen.getByRole('button', { name: 'Neues Projekt' }));
    /* Der Dialog liegt als Overlay ausserhalb des Screens — deshalb der Body. */
    await expectNoA11yViolations(await screen.findByRole('dialog', { name: 'Neues Projekt' }));
  });
});
