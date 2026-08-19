// @vitest-environment jsdom
/* Die Inbox als Arbeitsfläche: Vorschlag sehen, Ziel wechseln, Todos abwählen,
   ablegen — mit der Tastatur und ohne Modell.
 *
 * Der Prüfstein ist die Zusage aus Guardrail 2: was der Nutzer auf dem Schirm
 * bearbeitet, ist genau das, was über `capture:apply` geht. Deshalb prüfen die
 * Tests nicht nur, dass geklickt werden kann, sondern was im Aufruf steht.
 *
 * Seit Story 006 heißt die Arbeitsfläche `UnfiledWorkspace` und liegt im Körper
 * von `NotesScreen` (`/notes?filter=unfiled`). Diese Suite rendert sie weiter
 * allein: die Zusagen dieser Datei sind die der Arbeitsfläche, nicht die des
 * Wirts — dessen Kopf und Filter-Einstieg prüft `notes.test.tsx`.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type {
  DumpItem,
  FilingProposal,
  KnowledgeModule,
  Project,
  Routing,
  TaskDefinition,
} from '@shared/types';
import { UnfiledWorkspace } from '@renderer/screens/inbox/UnfiledWorkspace';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';

/* Die IPC-Attrappe steht hier und nicht in `tests/setup.ts`: die Renderer-Tests
   liegen in einer eigenen tsconfig, die den gemeinsamen Aufbau nicht kennt. */
type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

interface Recorded {
  channel: IpcChannel;
  payload: unknown;
}

interface Mock {
  calls: Recorded[];
}

function installMock(handlers: Handlers): Mock {
  const calls: Recorded[] = [];
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

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container);
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

const NOW = '2026-08-10T14:32:00+02:00';
const PROJECT_PATH = 'projects/work/kundenportal-relaunch/project.md';

const project: Project = {
  path: PROJECT_PATH,
  slug: 'kundenportal-relaunch',
  title: 'Kundenportal Relaunch',
  scope: 'work',
  status: 'active',
  priority: 1,
  deadline: '2026-08-13',
  nextStep: 'Abnahmeprotokoll mit Miriam durchgehen',
  nextStepStale: false,
  waitingOn: [],
  tags: ['kundenportal'],
  modules: [],
  repos: [],
  lastTouch: NOW,
  lastTouchSource: 'file',
  ageDays: 0,
  stale: false,
  todoCount: 3,
  openTodoCount: 2,
  excerpt: 'Die neue Angebotsliste liegt auf dem Testsystem.',
};

const knowledgeModule: KnowledgeModule = {
  slug: 'identity-management',
  title: 'Identity management',
  description: 'Rollen, Rechte, Anmeldeverfahren.',
  created: NOW,
  updated: NOW,
  counts: { sources: 1, entities: 1, concepts: 1 },
  findingCount: 0,
  lastIngest: null,
  tags: [],
};

const fresh: DumpItem = {
  path: 'inbox/2026-08-10-1432-ladezeiten.md',
  id: '2026-08-10-1432-ladezeiten',
  title: 'Ladezeiten der Angebotsliste',
  text: 'Kundenportal: Ladezeiten der Angebotsliste bis morgen prüfen. Sammelaufruf statt 400 Abfragen.',
  created: NOW,
  origin: 'quick-capture',
  status: 'raw',
  ageDays: 0,
  wordCount: 14,
  tags: ['kundenportal'],
  scope: 'work',
  filedInto: null,
  filedAt: null,
};

const old: DumpItem = {
  path: 'inbox/2026-08-01-1855-hochbeet.md',
  id: '2026-08-01-1855-hochbeet',
  title: 'Einkauf fürs Hochbeet',
  text: 'Noppenfolie 5 m, Edelstahlschrauben, zwei Säcke Blumenerde.',
  created: '2026-08-01T18:55:00+02:00',
  origin: 'quick-capture',
  status: 'raw',
  ageDays: 9,
  wordCount: 9,
  tags: ['garten'],
  scope: 'private',
  filedInto: null,
  filedAt: null,
};

/* Seit D4 bleibt ein abgelegter Dump liegen — als Beleg. Er darf in dieser
   Arbeitsfläche nicht mehr als offen zählen (D5). */
const filedDump: DumpItem = {
  path: 'inbox/2026-08-05-0900-abgelegt.md',
  id: '2026-08-05-0900-abgelegt',
  title: 'Schon abgelegter Gedanke',
  text: 'Dieser Text wurde bereits abgelegt.',
  created: '2026-08-05T09:00:00+02:00',
  origin: 'quick-capture',
  status: 'filed',
  ageDays: 5,
  wordCount: 6,
  tags: [],
  scope: 'work',
  filedInto: PROJECT_PATH,
  filedAt: '2026-08-06',
};

function proposalFor(dump: DumpItem): FilingProposal {
  return {
    dumpPath: dump.path,
    title: dump.title,
    scope: 'work',
    tags: ['kundenportal'],
    primary: {
      target: 'project',
      path: PROJECT_PATH,
      section: 'Notizen',
      content: `### 2026-08-10\n\n${dump.text}`,
    },
    extras: [],
    alternatives: [
      {
        target: 'area',
        path: 'areas/gesundheit.md',
        section: 'Notizen',
        content: `### 2026-08-10\n\n${dump.text}`,
      },
      { target: 'inbox', path: dump.path, section: null, content: dump.text },
    ],
    confidence: 0.55,
    reason: 'Erwähnt "Kundenportal" und einen Termin morgen.',
    todos: [
      {
        text: 'Ladezeiten der Angebotsliste prüfen',
        scope: 'work',
        due: '2026-08-11',
        waitingFor: null,
        priority: 0,
        project: 'kundenportal-relaunch',
      },
      {
        text: 'Sammelaufruf für Berechtigungen bauen',
        scope: 'work',
        due: null,
        waitingFor: null,
        priority: 0,
        project: 'kundenportal-relaunch',
      },
    ],
    waitingOn: [{ who: 'Jonas', what: 'Fallback für Sitzungen', since: '2026-08-06' }],
    entities: ['Kundenportal'],
    heuristic: true,
    createdAt: NOW,
  };
}

const ROUTED: Routing = {
  tasks: { 'classify-dump': { providerId: 'local-1', model: 'qwen2.5:14b' } },
  defaults: {},
};

const TASKS: TaskDefinition[] = [
  {
    kind: 'classify-dump',
    labelKey: 'task.classify-dump.label',
    hintKey: 'task.classify-dump.hint',
    suggested: 'cheap',
    sensitive: true,
    streams: false,
    structured: true,
  },
];

interface Rendered {
  sb: Mock;
  container: HTMLElement;
}

function renderInbox(extra: Handlers = {}): Rendered {
  const sb = installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 12,
      indexedAt: NOW,
      indexing: false,
    }),
    'capture:inbox': () => [fresh, old],
    'capture:classify': ({ path }) => proposalFor(path === old.path ? old : fresh),
    'projects:list': () => [project],
    'modules:list': () => [knowledgeModule],
    'llm:routing': () => ROUTED,
    'llm:tasks': () => TASKS,
    'capture:apply': () => ({
      dumpPath: fresh.path,
      written: [PROJECT_PATH],
      movedTo: null,
      undoToken: 'undo-1',
    }),
    'capture:keep': () => ({ dump: { ...fresh, status: 'kept' }, undoToken: 'undo-keep' }),
    'capture:discard': () => ({ undoToken: 'undo-2' }),
    'capture:undo': () => undefined,
    ...extra,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UnfiledWorkspace />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { sb, container };
}

/** Wartet, bis der Vorschlag steht — er kommt verzögert, damit j/k nichts kostet. */
async function waitForProposal(): Promise<HTMLElement> {
  return screen.findByRole('heading', { name: /Projekt Kundenportal Relaunch/ }, { timeout: 3000 });
}

function applyCall(sb: Mock): { proposal: FilingProposal } {
  const call = sb.calls.find((entry) => entry.channel === 'capture:apply');
  expect(call, 'capture:apply wurde nicht gerufen').toBeDefined();
  return call?.payload as { proposal: FilingProposal };
}

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
});

afterEach(() => {
  delete window.sb;
});

describe('Inbox', () => {
  it('zeigt Liste, Alter und den Vorschlag mit Ziel, Grund und Zuversicht', async () => {
    renderInbox();

    expect(await screen.findByText('Einkauf fürs Hochbeet')).toBeTruthy();
    /* Liegengeblieben: das Alter steht als Satz da, nicht als Datum. */
    expect(screen.getByText('liegt seit 9 Tagen')).toBeTruthy();

    const target = await waitForProposal();
    expect(target.textContent).toContain('Abschnitt Notizen');
    expect(screen.getByText('Erwähnt "Kundenportal" und einen Termin morgen.')).toBeTruthy();
    expect(screen.getByText('Zuversicht 55 %')).toBeTruthy();
    /* Der Volltext des Dumps steht da, nicht nur ein Anfang. */
    expect(screen.getByText(fresh.text)).toBeTruthy();
  });

  it('nennt den Weg zum Modell, wenn die Einordnung nur Regeln kannte', async () => {
    renderInbox();
    await waitForProposal();
    expect(screen.getByText('Ohne Modell eingeordnet — Regeln statt Verstehen.')).toBeTruthy();
  });

  it('bleibt ohne Modell voll benutzbar und zeigt den Weg in die Einstellungen', async () => {
    renderInbox({ 'llm:routing': () => ({ tasks: {}, defaults: {} }) });

    await waitForProposal();
    expect(screen.getByText(/Ablage-Vorschläge brauchen ein Modell/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Routing einrichten' })).toBeTruthy();
    /* Und trotzdem: der Heuristik-Vorschlag steht daneben und lässt sich ablegen. */
    expect(screen.getByRole('button', { name: /Ablegen/ })).toBeTruthy();
  });

  it('legt den bearbeiteten Text ab, nicht den vorgeschlagenen', async () => {
    const { sb } = renderInbox();
    await waitForProposal();

    const field = screen.getByLabelText('Das wird geschrieben');
    await userEvent.clear(field);
    await userEvent.type(field, 'Von mir umgeschrieben.');
    await userEvent.click(screen.getByRole('button', { name: /Ablegen/ }));

    await waitFor(() =>
      expect(applyCall(sb).proposal.primary.content).toBe('Von mir umgeschrieben.'),
    );
    expect(applyCall(sb).proposal.primary.path).toBe(PROJECT_PATH);
  });

  it('nimmt nur die Todos mit, die stehen geblieben sind', async () => {
    const { sb } = renderInbox();
    await waitForProposal();

    await userEvent.click(screen.getByLabelText('Ladezeiten der Angebotsliste prüfen'));
    await userEvent.click(screen.getByRole('button', { name: /Ablegen/ }));

    await waitFor(() => expect(applyCall(sb).proposal.todos).toHaveLength(1));
    expect(applyCall(sb).proposal.todos[0]?.text).toBe('Sammelaufruf für Berechtigungen bauen');
  });

  /* Kein rohes Datumsfeld mit „dd/mm/yyyy" und hellem Systemkalender: die zwei
     Fristen, die beim Einordnen fast immer gemeint sind, stehen als Chips da. */
  it('setzt die Frist eines Todos über die Chips „heute" und „morgen"', async () => {
    const { sb } = renderInbox();
    await waitForProposal();

    const group = screen.getByRole('group', {
      name: 'Frist für „Sammelaufruf für Berechtigungen bauen"',
    });
    expect(within(group).getByRole('button', { name: 'heute' })).toBeTruthy();
    await userEvent.click(within(group).getByRole('button', { name: 'morgen' }));
    await userEvent.click(screen.getByRole('button', { name: /Ablegen/ }));

    /* Der zweite Todo hatte keine Frist; „morgen" ist der Tag nach heute.
       Bewusst über die lokalen Datumsteile gebildet, nicht über toISOString():
       „morgen" ist für einen Menschen der lokale Kalendertag, und genau den
       bildet auch DueField. In den ersten Stunden eines Tages (UTC+2) liegt der
       UTC-Tag noch im Vortag — ein UTC-Vergleich wäre dann fälschlich rot. */
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expected = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, '0'),
      String(tomorrow.getDate()).padStart(2, '0'),
    ].join('-');
    await waitFor(() => expect(applyCall(sb).proposal.todos[1]?.due).toBe(expected));
  });

  it('lässt für ein anderes Datum ein Feld aufklappen', async () => {
    const { sb } = renderInbox();
    await waitForProposal();

    const group = screen.getByRole('group', {
      name: 'Frist für „Ladezeiten der Angebotsliste prüfen"',
    });
    await userEvent.click(within(group).getByRole('button', { name: 'Datum …' }));
    const field = within(group).getByLabelText('Datum …');
    fireEvent.change(field, { target: { value: '2026-08-20' } });
    await userEvent.click(screen.getByRole('button', { name: /Ablegen/ }));

    await waitFor(() => expect(applyCall(sb).proposal.todos[0]?.due).toBe('2026-08-20'));
  });

  it('nimmt eine Frist wieder weg, wenn derselbe Chip noch einmal kommt', async () => {
    const { sb } = renderInbox();
    await waitForProposal();

    const group = screen.getByRole('group', {
      name: 'Frist für „Sammelaufruf für Berechtigungen bauen"',
    });
    const today = within(group).getByRole('button', { name: 'heute' });
    await userEvent.click(today);
    await userEvent.click(today);
    await userEvent.click(screen.getByRole('button', { name: /Ablegen/ }));

    await waitFor(() => expect(applyCall(sb).proposal.todos[1]?.due).toBeNull());
  });

  it('schickt die Warte-auf-Einträge mit, ohne ein Hilfsfeld anzuhängen', async () => {
    const { sb } = renderInbox();
    await waitForProposal();

    await userEvent.click(screen.getByRole('button', { name: /Ablegen/ }));

    await waitFor(() => expect(applyCall(sb).proposal.waitingOn).toHaveLength(1));
    expect(applyCall(sb).proposal.waitingOn[0]).toEqual({
      who: 'Jonas',
      what: 'Fallback für Sitzungen',
      since: '2026-08-06',
    });
  });

  it('wechselt das Ziel über die Auswahl und legt dorthin ab', async () => {
    const { sb } = renderInbox();
    await waitForProposal();

    await userEvent.click(screen.getByRole('button', { name: 'Anderes Ziel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anderes Ziel' });
    await userEvent.click(within(dialog).getByRole('button', { name: /Bereich Gesundheit/ }));

    /* Das Ziel steht groß im Kopf, die Begründung sagt, dass es vom Nutzer kommt. */
    expect(await screen.findByRole('heading', { name: /Bereich Gesundheit/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Ablegen/ }));
    await waitFor(() => expect(applyCall(sb).proposal.primary.path).toBe('areas/gesundheit.md'));
  });

  /* Ein Todo, das ein eigenes Projekt nennt, wird dorthin geschrieben — auch
     wenn der Nutzer ein anderes Hauptziel gewählt hat. Ein Schreibvorgang in eine
     ungewählte Datei muss sichtbar sein (Guardrail 2). */
  it('sagt bei einem Todo, wenn es woanders landet als das Hauptziel', async () => {
    renderInbox();
    await waitForProposal();

    /* Beim vorgeschlagenen Ziel ist das Projekt schon das Hauptziel — kein Hinweis. */
    expect(screen.queryByText('nach Kundenportal Relaunch')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Anderes Ziel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anderes Ziel' });
    await userEvent.click(within(dialog).getByRole('button', { name: /Bereich Gesundheit/ }));

    expect(await screen.findByRole('heading', { name: /Bereich Gesundheit/ })).toBeTruthy();
    expect(screen.getAllByText('nach Kundenportal Relaunch')).toHaveLength(2);
  });

  it('bestätigt nach dem Ablegen mit Ziel und Rückgängig', async () => {
    const { sb } = renderInbox({
      'capture:apply': () => ({
        dumpPath: fresh.path,
        written: [PROJECT_PATH],
        movedTo: null,
        undoToken: 'undo-1',
      }),
    });
    await waitForProposal();

    await userEvent.click(screen.getByRole('button', { name: /Ablegen/ }));

    expect(await screen.findByText('Abgelegt in')).toBeTruthy();
    expect(screen.getByText(PROJECT_PATH)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    await waitFor(() =>
      expect(sb.calls.some((call) => call.channel === 'capture:undo')).toBe(true),
    );
  });

  it('fragt vor dem Verwerfen nach', async () => {
    const { sb } = renderInbox({ 'capture:discard': () => ({ undoToken: 'undo-2' }) });
    await waitForProposal();

    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Dump verwerfen?' });
    expect(sb.calls.some((call) => call.channel === 'capture:discard')).toBe(false);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Verwerfen' }));
    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'capture:discard')?.payload).toEqual({
        path: fresh.path,
      }),
    );
  });

  /* Über „Anderes Ziel" auf die Alternative „Bleibt in der Inbox" wechseln —
     derselbe Weg, den ein Vorschlag nimmt, der von sich aus dort landet. */
  async function switchToInboxTarget(): Promise<void> {
    await userEvent.click(screen.getByRole('button', { name: 'Anderes Ziel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anderes Ziel' });
    await userEvent.click(within(dialog).getByRole('button', { name: /Bleibt in der Inbox/ }));
    await screen.findByRole('heading', { name: 'Bleibt in der Inbox' });
  }

  it('lässt einen Dump bewusst liegen und bietet danach den Rückweg', async () => {
    const { sb } = renderInbox({
      'capture:keep': () => ({ dump: { ...fresh, status: 'kept' }, undoToken: 'undo-keep-1' }),
    });
    await waitForProposal();
    await switchToInboxTarget();

    /* Der teale Primärknopf im Zustand „bleibt liegen" geht über `capture:keep`
       — nicht über `capture:apply`, das denselben Status ohne Marke schriebe. */
    await userEvent.click(screen.getByRole('button', { name: 'Liegen lassen' }));

    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'capture:keep')?.payload).toEqual({
        path: fresh.path,
      }),
    );
    expect(sb.calls.some((call) => call.channel === 'capture:apply')).toBe(false);
    /* Vorher passierte sichtbar nichts — jetzt steht die Feststellung da. */
    expect(await screen.findByText('Bleibt liegen — als bewusst behalten markiert.')).toBeTruthy();
    /* Genau der eine Schreibweg, der einmal keinen Rückweg hatte: jetzt trägt
       er denselben Knopf wie „Ablegen" und „Verwerfen". */
    const undo = screen.getByRole('button', { name: 'Rückgängig' });
    await userEvent.click(undo);
    await waitFor(() =>
      expect(sb.calls.find((call) => call.channel === 'capture:undo')?.payload).toEqual({
        undoToken: 'undo-keep-1',
      }),
    );
  });

  /* Der häufigste Vorschlag ohne Modell. Er darf nicht „Ablegen" heißen: es wird
     nichts abgelegt, nichts geschrieben, und es gibt nichts zurückzunehmen. */
  describe('wenn der Vorschlag „bleibt in der Inbox" lautet', () => {
    const staying: Handlers = {
      'capture:classify': ({ path }) => {
        const proposal = proposalFor(path === old.path ? old : fresh);
        return {
          ...proposal,
          primary: { target: 'inbox', path, section: null, content: proposal.primary.content },
          alternatives: [proposalFor(fresh).primary],
          confidence: 0.3,
        };
      },
    };

    /* Das Teal gehört der Aktion, die Ctrl+Enter ausführt — und das ist hier
       „Liegen lassen". Zeigte der Knopf woanders hin als die Taste, täte das Auge
       etwas anderes als die Tastatur. */
    it('nennt den Knopf „Liegen lassen" und gibt ihm das Teal', async () => {
      renderInbox(staying);
      await screen.findByRole('heading', { name: 'Bleibt in der Inbox' });

      expect(screen.queryByRole('button', { name: 'Ablegen' })).toBeNull();
      const leave = screen.getByRole('button', { name: 'Liegen lassen' });
      expect(leave.className).toContain('gs-btn--primary');
      expect(screen.getByRole('button', { name: 'Anderes Ziel' }).className).toContain(
        'gs-btn--secondary',
      );
      /* Und kein Feld, das einen Schreibvorgang verspricht. */
      expect(screen.getByText('Nichts wird geschrieben — der Dump bleibt liegen')).toBeTruthy();
      expect(screen.queryByLabelText('Das wird geschrieben')).toBeNull();
    });

    it('bestätigt danach mit „bleibt liegen" und bietet den Rückweg', async () => {
      const { sb } = renderInbox({
        ...staying,
        'capture:keep': () => ({ dump: { ...fresh, status: 'kept' }, undoToken: 'undo-keep-3' }),
      });
      await screen.findByRole('heading', { name: 'Bleibt in der Inbox' });

      await userEvent.click(screen.getByRole('button', { name: 'Liegen lassen' }));

      /* Der Primärknopf ruft `capture:keep`, nicht `capture:apply` — sonst
         schriebe der Dump denselben Status ohne Rückweg. */
      await waitFor(() =>
        expect(sb.calls.find((call) => call.channel === 'capture:keep')?.payload).toEqual({
          path: fresh.path,
        }),
      );
      expect(sb.calls.some((call) => call.channel === 'capture:apply')).toBe(false);
      expect(
        await screen.findByText('Bleibt liegen — als bewusst behalten markiert.'),
      ).toBeTruthy();
      expect(screen.queryByText('Abgelegt in')).toBeNull();
      /* Jetzt trägt auch dieser Weg das Rückgängig — kein toter Knopf mehr. */
      const undo = screen.getByRole('button', { name: 'Rückgängig' });
      await userEvent.click(undo);
      await waitFor(() =>
        expect(sb.calls.find((call) => call.channel === 'capture:undo')?.payload).toEqual({
          undoToken: 'undo-keep-3',
        }),
      );
    });

    /* Ctrl+Enter muss dieselbe Aktion auslösen wie der Primärknopf im Bild —
       sonst tut das Auge etwas anderes als die Tastatur. */
    it('legt mit Ctrl+Enter über capture:keep ab, nicht über capture:apply', async () => {
      const { sb } = renderInbox({
        ...staying,
        'capture:keep': () => ({ dump: { ...fresh, status: 'kept' }, undoToken: 'undo-keep-4' }),
      });
      await screen.findByRole('heading', { name: 'Bleibt in der Inbox' });

      await userEvent.keyboard('{Control>}{Enter}{/Control}');

      await waitFor(() =>
        expect(sb.calls.find((call) => call.channel === 'capture:keep')?.payload).toEqual({
          path: fresh.path,
        }),
      );
      expect(sb.calls.some((call) => call.channel === 'capture:apply')).toBe(false);
    });
  });

  /* Ein Dump, der als „bleibt liegen" markiert wird, rutscht in der Liste nach
     hinten. Die Auswahl muss ihm folgen — sonst arbeitet der Nutzer plötzlich an
     einem fremden Dump weiter. */
  it('hält die Auswahl am Dump fest, wenn die Liste sich neu sortiert', async () => {
    let inbox: DumpItem[] = [fresh, old];
    renderInbox({
      'capture:inbox': () => inbox,
      'capture:keep': () => {
        inbox = [old, { ...fresh, status: 'kept' }];
        return { dump: { ...fresh, status: 'kept' }, undoToken: 'undo-keep-2' };
      },
    });
    await waitForProposal();
    await switchToInboxTarget();

    await userEvent.click(screen.getByRole('button', { name: 'Liegen lassen' }));

    await screen.findByText('Bleibt liegen — als bewusst behalten markiert.');
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: /Ladezeiten der Angebotsliste/ })
          .getAttribute('aria-current'),
      ).toBe('true'),
    );
  });

  it('bewegt sich mit j und k und legt mit Ctrl+Enter ab', async () => {
    const { sb } = renderInbox();
    const first = await screen.findByRole('button', { name: /Ladezeiten der Angebotsliste/ });
    expect(first.getAttribute('aria-current')).toBe('true');

    await userEvent.keyboard('{Tab}');
    first.focus();
    await userEvent.keyboard('j');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Einkauf fürs Hochbeet/ }).getAttribute('aria-current'),
      ).toBe('true'),
    );
    await userEvent.keyboard('k');
    await waitFor(() => expect(first.getAttribute('aria-current')).toBe('true'));

    await waitForProposal();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(applyCall(sb).proposal.dumpPath).toBe(fresh.path));
  });

  it('springt mit e in den Text und mit Esc zurück in die Liste', async () => {
    renderInbox();
    await waitForProposal();
    const row = screen.getByRole('button', { name: /Ladezeiten der Angebotsliste/ });
    row.focus();

    await userEvent.keyboard('e');
    const field = screen.getByLabelText('Das wird geschrieben');
    await waitFor(() => expect(document.activeElement).toBe(field));

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(row));
  });

  it('erklärt den Leerzustand statt einen leeren Kasten zu zeigen', async () => {
    renderInbox({ 'capture:inbox': () => [] });
    expect(await screen.findByText('Die Inbox ist leer')).toBeTruthy();
    /* Einmal, in der Karte. Vorher stand derselbe Weg zweimal da, weil die
       Arbeitsfläche einen eigenen `ScreenHeader` mit demselben Knopf trug; den
       Kopf stellt seit Story 006 `NotesScreen`, und der trägt „Neuer Bereich",
       nicht „Gedanken erfassen". */
    expect(screen.getAllByRole('button', { name: /Gedanken erfassen/ })).toHaveLength(1);
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = renderInbox();
    await waitForProposal();
    await expectNoViolations(container);
  });

  /* Story 006, D5: seit `capture:inbox` auch abgelegte Dumps liefert (D4 lässt
     sie liegen statt sie zu löschen), muss die Arbeitsfläche sie selbst
     aussortieren — sonst würden sie die Tastaturliste und ihre Zählung
     verstopfen, obwohl sie längst erledigt sind. */
  describe('Beleg: abgelegte Dumps', () => {
    it('hält einen abgelegten Dump aus der Arbeitsliste und zeigt ihn eingeklappt im Beleg', async () => {
      renderInbox({ 'capture:inbox': () => [fresh, old, filedDump] });

      /* Nur die zwei offenen Dumps zählen und stehen in der Tastaturliste. */
      await screen.findByText('Einkauf fürs Hochbeet');
      expect(screen.getByText('2 Dumps')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Schon abgelegter Gedanke/ })).toBeNull();

      /* Der Beleg steht eingeklappt da, mit seiner Zahl — die Zeile selbst ist
         erst nach dem Aufklappen zu sehen. */
      const toggle = screen.getByRole('button', { name: 'Notizen zeigen' });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(screen.getByText('1 abgelegt')).toBeTruthy();
      expect(screen.queryByText('Schon abgelegter Gedanke')).toBeNull();

      /* Aufgeklappt zeigt die Zeile den Titel und das aufgelöste Ziel, und der
         Link lässt sich anklicken, ohne zu werfen. */
      await userEvent.click(toggle);
      expect(await screen.findByText('Schon abgelegter Gedanke')).toBeTruthy();
      const link = screen.getByRole('button', { name: 'abgelegt in Kundenportal Relaunch' });
      await userEvent.click(link);
      expect(link).toBeTruthy();
    });

    it('zeigt keinen Beleg-Abschnitt, wenn nichts abgelegt ist', async () => {
      renderInbox();
      await screen.findByText('Einkauf fürs Hochbeet');

      expect(screen.queryByText('Abgelegt')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Notizen zeigen' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Notizen verbergen' })).toBeNull();
    });
  });
});
