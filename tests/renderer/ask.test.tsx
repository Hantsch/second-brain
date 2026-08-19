// @vitest-environment jsdom
/* Fragen — der Screen, an dem sich entscheidet, ob das Archiv etwas wert ist.
 *
 * Geprüft wird, was der Nutzer erlebt: die Antwort wächst stückweise, sie endet
 * mit Belegen, die Belegmarke im Text springt zum Beleg, ein Abbruch stoppt, ohne
 * Modell stehen die Fundstellen da (kein Fehler), eine Antwort ohne Beleg sagt das
 * — und eine gute Antwort wird mit Modul und Titel zur Wiki-Seite.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcEventName, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import type {
  ChatMessage,
  ChatThread,
  Citation,
  KnowledgeModule,
  Project,
  Routing,
  TaskDefinition,
  VaultDoc,
} from '@shared/types';
import { AskPanel } from '@renderer/screens/ask/AskPanel';
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
  };
}

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container);
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

const NOW = '2026-08-10T14:32:00+02:00';
const MODULE = 'identity-management';
const TOKEN_PAGE = `modules/${MODULE}/wiki/concepts/token-lebensdauer.md`;
const QUESTION = 'Wie lange leben Access-Token?';
const VERBATIM = 'Aktueller Stand: Access-Token 15 Minuten, Refresh-Token 8 Stunden';
const ANSWER = `Access-Token leben 15 Minuten [[${TOKEN_PAGE}]].`;

/* An area note (story 005): the citation panel resolves any path the same
   way, with no branching on `docType` — this is the fixture that proves it
   for `areas/`. */
const AREA_PATH = 'areas/gesundheit.md';
const AREA_QUOTE = 'Zwei Wochen Schlafprotokoll: vor Mitternacht ins Bett wirkt mehr.';
const AREA_ANSWER = `Vor Mitternacht ins Bett wirkt mehr [[${AREA_PATH}]].`;

const citation: Citation = {
  path: TOKEN_PAGE,
  title: 'Token-Lebensdauer',
  quote: VERBATIM,
  line: 13,
};

const knowledgeModule: KnowledgeModule = {
  slug: MODULE,
  title: 'Identity management',
  description: 'Rollen, Rechte, Anmeldeverfahren.',
  created: NOW,
  updated: NOW,
  counts: { sources: 1, entities: 2, concepts: 1 },
  findingCount: 0,
  lastIngest: null,
  tags: [],
};

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
  waitingOn: [{ who: 'Miriam', what: 'Abnahme', since: '2026-08-06' }],
  tags: [],
  modules: [],
  repos: [],
  lastTouch: NOW,
  lastTouchSource: 'file',
  ageDays: 0,
  stale: false,
  todoCount: 2,
  openTodoCount: 1,
  excerpt: 'Die neue Angebotsliste liegt auf dem Testsystem.',
};

const doc: VaultDoc = {
  path: TOKEN_PAGE,
  frontmatter: { type: 'concept', title: 'Token-Lebensdauer', created: '2026-07-17' },
  body: ['## Stand', '', VERBATIM, 'mit Rotation bei jeder Nutzung.', ''].join('\n'),
  hash: 'hash-1',
  modified: NOW,
  size: 320,
};

/* Line 5 (1-indexed) is where `AREA_QUOTE` actually sits — the citation
   below must agree, otherwise `contextOf` cannot relocate it. */
const areaDoc: VaultDoc = {
  path: AREA_PATH,
  frontmatter: { type: 'area', title: 'Gesundheit', created: '2026-07-01' },
  body: ['## Notizen', '', '### 2026-08-04', '', AREA_QUOTE, ''].join('\n'),
  hash: 'hash-area',
  modified: NOW,
  size: 180,
};

const areaCitation: Citation = {
  path: AREA_PATH,
  title: 'Gesundheit',
  quote: AREA_QUOTE,
  line: 5,
};

const ROUTED: Routing = {
  tasks: { 'query-answer': { providerId: 'local-1', model: 'qwen2.5:14b' } },
  defaults: {},
};

const TASKS: TaskDefinition[] = [
  {
    kind: 'query-answer',
    labelKey: 'task.query-answer.label',
    hintKey: 'task.query-answer.hint',
    suggested: 'strong',
    sensitive: false,
    streams: true,
    structured: false,
  },
];

function userMessage(id: string, content = QUESTION): ChatMessage {
  return { id, role: 'user', content, at: NOW };
}

function thread(messages: ChatMessage[], id = 'c-2026-08-10-1432-aaaa'): ChatThread {
  return { id, kind: 'ask', title: QUESTION, created: NOW, updated: NOW, messages, context: null };
}

interface Rendered {
  sb: Mock;
  container: HTMLElement;
  unwire: () => void;
}

function renderAsk(extra: Handlers = {}): Rendered {
  const sb = installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 12,
      indexedAt: NOW,
      indexing: false,
    }),
    'chat:threads': () => [],
    'chat:thread': () => null,
    'modules:list': () => [knowledgeModule],
    'projects:list': () => [project],
    'llm:routing': () => ROUTED,
    'llm:tasks': () => TASKS,
    'vault:read': () => doc,
    'shell:openPath': () => undefined,
    ...extra,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const unwire = wireEvents(client);
  const { container } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AskPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { sb, container, unwire };
}

let cleanup: (() => void) | null = null;

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  delete window.sb;
});

/** Rendert und meldet die Ereignisse wieder ab, wenn der Test durch ist. */
function open(extra: Handlers = {}): Rendered {
  const rendered = renderAsk(extra);
  cleanup = rendered.unwire;
  return rendered;
}

/** Stellt eine Frage über das Feld. */
async function submit(question = QUESTION): Promise<void> {
  const field = await screen.findByLabelText('Deine Frage');
  await userEvent.type(field, question);
  await userEvent.click(screen.getByRole('button', { name: 'Frage stellen' }));
}

describe('Fragen: Leerzustand', () => {
  it('schlägt drei Fragen vor, die zu diesem Vault passen', async () => {
    open();

    /* Aus dem Bestand gebildet, nicht hartcodiert: Modul, Projekt, Warte-auf. */
    const module = await screen.findByRole('button', {
      name: 'Was weiß ich über Identity management?',
    });
    expect(
      screen.getByRole('button', { name: /Woran habe ich bei „Kundenportal Relaunch"/ }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Worauf warte ich bei Miriam?' })).toBeTruthy();

    await userEvent.click(module);
    expect((screen.getByLabelText('Deine Frage') as HTMLTextAreaElement).value).toBe(
      'Was weiß ich über Identity management?',
    );
  });

  it('erklärt den Screen, wenn im Vault noch nichts liegt', async () => {
    open({ 'modules:list': () => [], 'projects:list': () => [] });
    expect(await screen.findByText('Frag dein zweites Hirn')).toBeTruthy();
  });
});

describe('Fragen: eine Antwort entsteht', () => {
  const messageId = 'm-stream';
  const threadId = 'c-2026-08-10-1432-aaaa';

  function handlers(state: { thread: ChatThread }): Handlers {
    return {
      'chat:ask': () => ({ threadId, messageId }),
      'chat:thread': () => state.thread,
      'chat:threads': () => [state.thread],
      'chat:abort': () => undefined,
    };
  }

  it('rendert den Stream stückweise und schließt mit Belegen ab', async () => {
    const state = { thread: thread([userMessage(`${messageId}-q`)]) };
    const { sb } = open(handlers(state));
    await submit();

    await waitFor(() =>
      expect(sb.payloadOf('chat:ask')).toEqual({
        question: QUESTION,
        module: null,
        project: null,
        scope: null,
      }),
    );
    /* Die Frage steht als Runde da, darunter die ruhige Denk-Anzeige. */
    const turn = await screen.findByRole('article', { name: 'Frage' });
    expect(turn.textContent).toContain(QUESTION);
    expect(screen.getByText('Liest die Fundstellen')).toBeTruthy();

    sb.emit('event:llm-stream', { messageId, threadId, delta: 'Access-Token leben ', done: false });
    expect(await screen.findByText(/Access-Token leben/)).toBeTruthy();
    expect(screen.queryByText('Liest die Fundstellen')).toBeNull();

    sb.emit('event:llm-stream', { messageId, threadId, delta: '15 Minuten.', done: false });
    expect(await screen.findByText(/Access-Token leben 15 Minuten\./)).toBeTruthy();

    /* Am Ende liegt die Antwort als Datei — mit geprüften Belegen. */
    state.thread = thread([
      userMessage(`${messageId}-q`),
      {
        id: messageId,
        role: 'assistant',
        content: ANSWER,
        at: NOW,
        citations: [citation],
        model: 'qwen2.5:14b',
      },
    ]);
    sb.emit('event:llm-stream', {
      messageId,
      threadId,
      delta: '',
      done: true,
      citations: [citation],
    });

    /* Das Modell, das geantwortet hat — Transparenz über die Route. Es steht erst
       da, wenn die geschriebene Antwort die laufende ersetzt hat. */
    expect(await screen.findByText('qwen2.5:14b')).toBeTruthy();
    const cites = screen.getByRole('list', { name: 'Belege' });
    expect(within(cites).getByText('Token-Lebensdauer')).toBeTruthy();
    expect(within(cites).getByText(`${TOKEN_PAGE}:13`)).toBeTruthy();
    /* Das Zitat steht wörtlich da, die Wörter der Frage sind markiert. */
    expect(cites.textContent).toContain(VERBATIM);
    expect(cites.querySelectorAll('mark.sb-hit-mark').length).toBeGreaterThan(0);
  });

  /* Ohne Modell sind die Belege die Antwort — sie müssen lesbar sein, nicht wie
     ein Grep-Dump aussehen. Der wörtliche Text mit `##`, `- ` und `[[…]]`
     bleibt im Beleg-Panel stehen; die Vorschau zeigt Fließtext. */
  it('zeigt die Zitat-Vorschau lesbar, ohne rohes Markdown', async () => {
    const markdownCitation: Citation = {
      path: TOKEN_PAGE,
      title: 'Token-Lebensdauer',
      quote: '- [[single-sign-on]] — Einmal anmelden\n## Begriffe\nsteht hier',
      line: 13,
    };
    const state = { thread: thread([userMessage(`${messageId}-q`)]) };
    const { sb } = open(handlers(state));
    await submit();
    sb.emit('event:llm-stream', {
      messageId,
      threadId,
      delta: '',
      done: true,
      citations: [markdownCitation],
    });

    const cites = await screen.findByRole('list', { name: 'Belege' });
    /* Der Fließtext bleibt lesbar; die rohe `[[ziel]]`-Syntax und die Marker
       `-` und `##` sind weg. */
    expect(cites.textContent).toContain('single-sign-on');
    expect(cites.textContent).toContain('Einmal anmelden');
    expect(cites.textContent).toContain('Begriffe');
    expect(cites.textContent).not.toContain('[[');
    expect(cites.textContent).not.toContain('##');
    expect(cites.textContent).not.toContain('- [[');
  });

  it('bricht auf Knopfdruck ab und sagt es', async () => {
    const state = { thread: thread([userMessage(`${messageId}-q`)]) };
    const { sb } = open(handlers(state));
    await submit();

    sb.emit('event:llm-stream', { messageId, threadId, delta: 'Access-Token', done: false });
    await userEvent.click(await screen.findByRole('button', { name: 'Abbrechen' }));

    await waitFor(() => expect(sb.payloadOf('chat:abort')).toEqual({ messageId }));
    /* Der Hauptprozess beendet den Stream mit Grund; nichts wurde geschrieben. */
    sb.emit('event:llm-stream', {
      messageId,
      threadId,
      delta: '',
      done: true,
      error: 'cancelled',
    });
    expect(await screen.findByText(/Abgebrochen/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Frage stellen' })).toBeTruthy();
  });

  it('springt von der Belegmarke zum Beleg und hebt ihn hervor', async () => {
    const state = {
      thread: thread([
        userMessage(`${messageId}-q`),
        {
          id: messageId,
          role: 'assistant',
          content: ANSWER,
          at: NOW,
          citations: [citation],
          model: 'qwen2.5:14b',
        },
      ]),
    };
    open({ ...handlers(state), 'chat:threads': () => [state.thread] });

    await userEvent.click(
      await screen.findByRole('button', { name: `Gespräch „${QUESTION}" öffnen` }),
    );
    const mark = await screen.findByRole('button', { name: 'Beleg 1 anzeigen' });
    expect(mark.textContent).toBe('[1]');

    await userEvent.click(mark);

    const entry = document.getElementById(`sb-cite-${messageId}-1`);
    expect(entry?.className).toContain('sb-cite--active');
    /* Und die Stelle im Kontext, mit den echten Zeilennummern der Datei: das
       Zitat steht in Zeile 13, nicht in der Leerzeile davor. */
    const panel = await screen.findByRole('dialog', { name: 'Token-Lebensdauer' });
    const hit = within(panel).getByText(VERBATIM).closest('li');
    expect(hit?.textContent?.startsWith('13')).toBe(true);
    expect(hit?.className).toContain('sb-context-line--hit');
    expect(within(panel).getByRole('button', { name: 'Datei öffnen' })).toBeTruthy();
  });

  /* Story 005: notes live under `areas/`, a document type the panel has never
     special-cased. This is the proof — the same citation panel, the same
     `contextOf` relocation, only the path and doc type differ. */
  it('öffnet den Beleg für eine Notiz in einem Bereich genauso, ohne Sonderfall', async () => {
    const state = {
      thread: thread([
        userMessage(`${messageId}-q`),
        {
          id: messageId,
          role: 'assistant',
          content: AREA_ANSWER,
          at: NOW,
          citations: [areaCitation],
          model: 'qwen2.5:14b',
        },
      ]),
    };
    open({
      ...handlers(state),
      'chat:threads': () => [state.thread],
      'vault:read': ({ path }) => (path === AREA_PATH ? areaDoc : doc),
    });

    await userEvent.click(
      await screen.findByRole('button', { name: `Gespräch „${QUESTION}" öffnen` }),
    );
    const mark = await screen.findByRole('button', { name: 'Beleg 1 anzeigen' });
    await userEvent.click(mark);

    const panel = await screen.findByRole('dialog', { name: 'Gesundheit' });
    const hit = within(panel).getByText(AREA_QUOTE).closest('li');
    expect(hit?.textContent?.startsWith('5')).toBe(true);
    expect(hit?.className).toContain('sb-context-line--hit');
    expect(within(panel).getByRole('button', { name: 'Datei öffnen' })).toBeTruthy();
  });
});

describe('Fragen: ehrliche Zustände', () => {
  const messageId = 'm-passages';
  const threadId = 'c-2026-08-10-1500-bbbb';

  it('zeigt ohne Route die Fundstellen statt eines Fehlers', async () => {
    const answered = thread(
      [
        userMessage(`${messageId}-q`),
        {
          id: messageId,
          role: 'assistant',
          content: 'Ich kann die Antwort nicht formulieren.',
          at: NOW,
          citations: [citation],
        },
      ],
      threadId,
    );
    open({
      'llm:routing': () => ({ tasks: {}, defaults: {} }),
      'chat:threads': () => [answered],
      'chat:thread': () => answered,
    });

    await userEvent.click(
      await screen.findByRole('button', { name: `Gespräch „${QUESTION}" öffnen` }),
    );

    expect(await screen.findByText(/Ich kann daraus keine Antwort formulieren/)).toBeTruthy();
    /* Der Weg zum Modell steht daneben — und der Screen bleibt benutzbar. */
    expect(screen.getAllByRole('button', { name: 'Routing einrichten' }).length).toBeGreaterThan(0);
    const cites = screen.getByRole('list', { name: 'Belege' });
    expect(within(cites).getByText('Token-Lebensdauer')).toBeTruthy();
    expect(within(cites).getByText(`${TOKEN_PAGE}:13`)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Frage stellen' })).toBeTruthy();
    /* Eine Liste von Fundstellen ist keine Antwort — sie wird nicht ins Wiki
       geschrieben, sonst stünde dort „ich kann das nicht formulieren". */
    expect(screen.queryByRole('button', { name: 'Als Wiki-Seite ablegen' })).toBeNull();
  });

  it('kennzeichnet eine Antwort ohne Beleg als solche', async () => {
    const answered = thread(
      [
        userMessage('m-none-q'),
        {
          id: 'm-none',
          role: 'assistant',
          content: 'Dazu steht nichts im Vault.',
          at: NOW,
          unsupported: true,
        },
      ],
      'c-2026-08-10-1600-cccc',
    );
    open({ 'chat:threads': () => [answered], 'chat:thread': () => answered });

    await userEvent.click(
      await screen.findByRole('button', { name: `Gespräch „${QUESTION}" öffnen` }),
    );

    expect(await screen.findByText('Dazu steht nichts im Vault.')).toBeTruthy();
    expect(screen.getByText(/Geraten wird hier nichts/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Belege' })).toBeNull();
  });

  it('markiert eine Antwort, deren Zitate nicht alle geprüft sind', async () => {
    const answered = thread(
      [
        userMessage('m-weak-q'),
        {
          id: 'm-weak',
          role: 'assistant',
          content: ANSWER,
          at: NOW,
          citations: [citation],
          model: 'qwen2.5:14b',
          unsupported: true,
        },
      ],
      'c-2026-08-10-1700-dddd',
    );
    open({ 'chat:threads': () => [answered], 'chat:thread': () => answered });

    await userEvent.click(
      await screen.findByRole('button', { name: `Gespräch „${QUESTION}" öffnen` }),
    );
    expect(await screen.findByText(/ließen sich nicht belegen/)).toBeTruthy();
  });
});

describe('Fragen: Gespräche und Ablegen', () => {
  const messageId = 'm-file';
  const threadId = 'c-2026-08-10-1800-eeee';
  const answered = thread(
    [
      userMessage(`${messageId}-q`),
      {
        id: messageId,
        role: 'assistant',
        content: ANSWER,
        at: NOW,
        citations: [citation],
        model: 'qwen2.5:14b',
      },
    ],
    threadId,
  );

  const base: Handlers = {
    'chat:threads': () => [answered],
    'chat:thread': () => answered,
    'chat:delete': () => undefined,
    'chat:fileBack': () => ({
      path: `modules/${MODULE}/wiki/concepts/lebensdauer-von-access-token.md`,
      hash: 'hash-2',
      created: true,
    }),
  };

  it('legt die Antwort mit Modul und Titel als Wiki-Seite ab', async () => {
    const { sb } = open(base);
    await userEvent.click(
      await screen.findByRole('button', { name: `Gespräch „${QUESTION}" öffnen` }),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Als Wiki-Seite ablegen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Antwort als Wiki-Seite ablegen' });
    /* Der Titel ist aus der Frage vorbelegt, das Modul gewählt. */
    const title = within(dialog).getByLabelText('Titel der Seite') as HTMLInputElement;
    expect(title.value).toBe('Wie lange leben Access-Token');
    expect(within(dialog).getByText(/Konzept-Seite im Modul „Identity management"/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ablegen' }));

    await waitFor(() =>
      expect(sb.payloadOf('chat:fileBack')).toEqual({
        threadId,
        messageId,
        module: MODULE,
        title: 'Wie lange leben Access-Token',
      }),
    );
    /* Danach steht der Pfad da, mit dem Weg hinein. */
    expect(await screen.findByText(/lebensdauer-von-access-token\.md/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    await waitFor(() =>
      expect(sb.payloadOf('shell:openPath')).toEqual({
        path: `modules/${MODULE}/wiki/concepts/lebensdauer-von-access-token.md`,
      }),
    );
  });

  it('legt in ein neu benanntes Modul ab', async () => {
    const { sb } = open(base);
    await userEvent.click(
      await screen.findByRole('button', { name: `Gespräch „${QUESTION}" öffnen` }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Als Wiki-Seite ablegen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Antwort als Wiki-Seite ablegen' });

    await userEvent.click(within(dialog).getByLabelText('Neues Modul anlegen'));
    await userEvent.type(
      within(dialog).getByLabelText('Name des neuen Moduls'),
      'Zugangsverwaltung',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ablegen' }));

    await waitFor(() =>
      expect(sb.payloadOf('chat:fileBack')).toMatchObject({ module: 'Zugangsverwaltung' }),
    );
  });

  it('fragt vor dem Löschen nach und sucht im Verlauf', async () => {
    const { sb } = open(base);
    const row = await screen.findByRole('button', { name: `Gespräch „${QUESTION}" öffnen` });
    expect(row.textContent).toContain(QUESTION);

    await userEvent.click(screen.getByRole('button', { name: `Gespräch „${QUESTION}" löschen` }));
    const dialog = await screen.findByRole('dialog', { name: 'Gespräch löschen?' });
    expect(sb.calls.some((call) => call.channel === 'chat:delete')).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(sb.payloadOf('chat:delete')).toEqual({ id: threadId }));

    await userEvent.type(screen.getByLabelText('Im Verlauf suchen'), 'rollen');
    await waitFor(() =>
      expect(
        sb.calls.some(
          (call) =>
            call.channel === 'chat:threads' &&
            (call.payload as { query?: string }).query === 'rollen',
        ),
      ).toBe(true),
    );
  });
});

describe('Fragen: Bedienbarkeit', () => {
  it('schickt mit Enter und macht mit Shift+Enter einen Umbruch', async () => {
    const { sb } = open({
      'chat:ask': () => ({ threadId: 'c-2026-08-10-1900-ffff', messageId: 'm-keys' }),
      'chat:thread': () => thread([userMessage('m-keys-q')], 'c-2026-08-10-1900-ffff'),
    });
    const field = await screen.findByLabelText('Deine Frage');

    await userEvent.type(field, 'Erste Zeile{Shift>}{Enter}{/Shift}zweite Zeile');
    expect((field as HTMLTextAreaElement).value).toBe('Erste Zeile\nzweite Zeile');
    expect(sb.calls.some((call) => call.channel === 'chat:ask')).toBe(false);

    await userEvent.type(field, '{Enter}');
    await waitFor(() =>
      expect((sb.payloadOf('chat:ask') as { question: string }).question).toBe(
        'Erste Zeile\nzweite Zeile',
      ),
    );
  });

  /* Vorher tat Esc im Feld gar nichts — der Fokus blieb stehen, ohne einen Weg
     zurück außer der Maus (gemessen: Fokus blieb auf #sb-ask-field). Der
     Entwurf darf dabei nicht verloren gehen — `ChatComposer` trägt auch das
     Gesprächsfeld des Tagebuchs, also gilt der Fix für beide. */
  it('verlässt das Feld mit Esc, ohne den Entwurf zu verwerfen', async () => {
    open();
    const field = await screen.findByLabelText('Deine Frage');

    await userEvent.type(field, 'Noch nicht fertig gefragt.');
    expect(field).toBe(document.activeElement);

    await userEvent.keyboard('{Escape}');

    expect(field).not.toBe(document.activeElement);
    expect((field as HTMLTextAreaElement).value).toBe('Noch nicht fertig gefragt.');
  });

  it('schränkt auf Modul und Bereich ein', async () => {
    const { sb } = open({
      'chat:ask': () => ({ threadId: 'c-2026-08-10-2000-gggg', messageId: 'm-filter' }),
      'chat:thread': () => thread([userMessage('m-filter-q')], 'c-2026-08-10-2000-gggg'),
    });
    await screen.findByLabelText('Deine Frage');

    await userEvent.click(screen.getByRole('button', { name: 'Arbeit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Identity management' }));
    await submit();

    await waitFor(() =>
      expect(sb.payloadOf('chat:ask')).toEqual({
        question: QUESTION,
        module: MODULE,
        project: null,
        scope: 'work',
      }),
    );
  });

  it('hat keinen A11y-Verstoß — leer und mit Antwort', async () => {
    const answered = thread([
      userMessage('m-a11y-q'),
      {
        id: 'm-a11y',
        role: 'assistant',
        content: ANSWER,
        at: NOW,
        citations: [citation],
        model: 'qwen2.5:14b',
      },
    ]);
    const { container } = open({
      'chat:threads': () => [answered],
      'chat:thread': () => answered,
    });

    await screen.findByRole('button', { name: `Gespräch „${QUESTION}" öffnen` });
    await expectNoViolations(container);

    await userEvent.click(screen.getByRole('button', { name: `Gespräch „${QUESTION}" öffnen` }));
    await screen.findByRole('list', { name: 'Belege' });
    await expectNoViolations(container);
  });
});

afterEach(() => {
  /* Der Stream-Puffer lebt im Modul — sonst tropft er in den nächsten Test. */
  for (const id of ['m-stream', 'm-passages', 'm-file', 'm-keys', 'm-filter']) clearStream(id);
});
