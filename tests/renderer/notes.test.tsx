// @vitest-environment jsdom
/* Notes — a home for the areas (story 005, deliverable D8).
 *
 * The prüfsteine of this screen:
 *
 * - Areas render as collapsible sections; a collapsed section never fetches
 *   its full notes or its todos (`areas:notes` / `todos:list` stay uncalled
 *   until the chevron opens it) — the over-fetch guard the story asks for.
 * - The composer saves with the button and with Ctrl+Enter, and an untargeted
 *   note carries no `area` field at all — the main process resolves that to
 *   the default area on its own.
 * - No `llm:*` channel is ever invoked: this screen has no LLM-shaped feature.
 * - No axe violation.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcError, IpcRequest, IpcResponse } from '@shared/ipc';
import type { Area, AreaNote, Todo } from '@shared/types';
import { ToastHost } from '@renderer/components/ToastHost';
import { NotesScreen } from '@renderer/screens/notes/NotesScreen';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';
import { clearToasts } from '@renderer/lib/toast';

/** What a rejected IPC call looks like from the mock bridge — `isIpcError`
    (in `decodeIpcError`) accepts a plain `code`+`message` object directly,
    no need to go through the wire prefix a real preload uses. */
function ipcError(code: IpcError['code']): Error {
  return Object.assign(new Error(code), { code });
}

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

interface Mock {
  calls: { channel: IpcChannel; payload: unknown }[];
  payloadOf(channel: IpcChannel): unknown;
  payloadsOf(channel: IpcChannel): unknown[];
}

/* Own mock instead of the shared one from `tests/setup.ts`: a test under
   `tests/renderer/` only sees `src/renderer`, `src/shared` and itself
   (tsconfig.web) — the same reason `journal.test.tsx` and `dashboard.test.tsx`
   each carry their own. */
function installMock(handlers: Handlers): Mock {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler)
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return {
    calls,
    payloadOf: (channel) => calls.find((entry) => entry.channel === channel)?.payload,
    payloadsOf: (channel) =>
      calls.filter((entry) => entry.channel === channel).map((e) => e.payload),
  };
}

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container);
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

const NOW = '2026-08-10T14:32:00+02:00';

/* The default area: always in the list, starts open, and is where an
   untargeted note lands — so it stays present even without a note yet. */
const defaultArea: Area = {
  path: 'areas/notes.md',
  slug: 'notes',
  title: 'Notizen',
  scope: 'private',
  hash: 'hash-default',
  noteCount: 0,
  openTodoCount: 0,
  notes: [],
};

const healthArea: Area = {
  path: 'areas/gesundheit.md',
  slug: 'gesundheit',
  title: 'Gesundheit',
  scope: 'private',
  hash: 'hash-health',
  noteCount: 2,
  openTodoCount: 1,
  /* The list-level preview — deliberately different text from the full note
     below, so a test can tell which channel actually filled the screen. */
  notes: [
    { day: '2026-08-04', heading: '2026-08-04', line: 22, excerpt: 'Vorschau: Schlafprotokoll.' },
    { day: '2026-07-28', heading: '2026-07-28', line: 12, excerpt: 'Vorschau: kurze Pausen.' },
  ],
};

/* The full entries `areas:notes` returns once the section is expanded. */
const healthNotes: AreaNote[] = [
  {
    day: '2026-08-04',
    heading: '2026-08-04',
    line: 22,
    excerpt: 'Zwei Wochen Schlafprotokoll, ausführlich: vor Mitternacht ins Bett wirkt mehr.',
  },
  {
    day: '2026-07-28',
    heading: '2026-07-28',
    line: 12,
    excerpt: 'Kurze Pausen alle 45 Minuten, ausführlich: mehr gebracht als jede neue Übung.',
  },
];

const healthTodo: Todo = {
  id: 'todo-health-1',
  text: 'Sporttermin für Freitag buchen',
  state: 'open',
  scope: 'private',
  path: healthArea.path,
  line: 30,
  project: null,
  projectTitle: null,
  area: healthArea.slug,
  due: null,
  waitingFor: null,
  neededBy: null,
  priority: 2,
  tags: [],
  createdAt: NOW,
  doneAt: null,
  dueInDays: null,
};

function renderNotes(path = '/notes', extra: Handlers = {}): { sb: Mock; container: HTMLElement } {
  const sb = installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 5,
      indexedAt: NOW,
      indexing: false,
    }),
    'areas:list': () => [defaultArea, healthArea],
    'areas:notes': ({ slug }) => (slug === 'gesundheit' ? healthNotes : []),
    'areas:createNote': ({ area }) => ({
      path: area ? `areas/${area}.md` : defaultArea.path,
      hash: 'hash-after-save',
      created: false,
    }),
    'areas:moveNote': ({ from, to }) => ({
      from: { path: `areas/${from}.md`, hash: 'hash-source-after-move', created: false },
      to: { path: `areas/${to}.md`, hash: 'hash-target-after-move', created: false },
    }),
    'todos:list': ({ area }) => (area === 'gesundheit' ? [healthTodo] : []),
    ...extra,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <NotesScreen />
        {/* Toasts render outside the screen in `AppShell` — mounted here too,
            since a conflict on either write is meant to surface as one. */}
        <ToastHost />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { sb, container };
}

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
});

afterEach(() => {
  delete window.sb;
  clearToasts();
});

describe('Notizen: Bereiche', () => {
  it('zeigt beide Bereiche mit ihrem Titel', async () => {
    renderNotes();

    /* Der Screen-Titel (h1) heißt zufällig genauso wie der Standardbereich
       (h2) — deshalb wird hier nach Ebene unterschieden. */
    expect(await screen.findByRole('heading', { level: 1, name: 'Notizen' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 2, name: 'Notizen' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Gesundheit' })).toBeTruthy();
  });

  it('lädt Notizen und Todos eines Bereichs erst beim Ausklappen', async () => {
    const { sb } = renderNotes();
    await screen.findByRole('heading', { name: 'Gesundheit' });

    /* Der Standardbereich „Notizen" ist immer offen (er ist leer, soll aber
       nie so aussehen) und fragt entsprechend seine eigenen, leeren Kanäle
       an — „Gesundheit" bleibt zugeklappt und wird für keinen der beiden
       nicht angefragt. */
    const notesFor = (slug: string): unknown[] =>
      sb.payloadsOf('areas:notes').filter((p) => (p as { slug: string }).slug === slug);
    const todosFor = (area: string): unknown[] =>
      sb.payloadsOf('todos:list').filter((p) => (p as { area?: string }).area === area);
    expect(notesFor('gesundheit')).toEqual([]);
    expect(todosFor('gesundheit')).toEqual([]);
    expect(screen.queryByText(/ausführlich/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Notizen zeigen' }));

    expect(await screen.findByText(/Zwei Wochen Schlafprotokoll, ausführlich/)).toBeTruthy();
    expect(screen.getByText(healthTodo.text)).toBeTruthy();
    await waitFor(() => expect(notesFor('gesundheit')).toEqual([{ slug: 'gesundheit' }]));
  });

  it('öffnet den per ?a= benannten Bereich sofort', async () => {
    renderNotes('/notes?a=gesundheit');

    expect(await screen.findByText(/Zwei Wochen Schlafprotokoll, ausführlich/)).toBeTruthy();
    expect(screen.getByText(healthTodo.text)).toBeTruthy();
  });
});

describe('Notizen: der Composer', () => {
  it('speichert per Knopf, ohne das Ziel anzufassen — ohne area-Feld', async () => {
    const { sb } = renderNotes();

    const field = await screen.findByLabelText('Ein Gedanke, der für sich steht.');
    await userEvent.type(field, 'Ein Gedanke, der für sich steht.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(sb.payloadOf('areas:createNote')).toEqual({
        text: 'Ein Gedanke, der für sich steht.',
      }),
    );
    /* Und das Feld ist wieder leer — der Text steht in der Datei. */
    await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(''));
  });

  it('speichert auch mit Strg+Enter', async () => {
    const { sb } = renderNotes();

    const field = await screen.findByLabelText('Ein Gedanke, der für sich steht.');
    await userEvent.type(field, 'Noch ein Gedanke.');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() =>
      expect(sb.payloadOf('areas:createNote')).toEqual({ text: 'Noch ein Gedanke.' }),
    );
  });

  it('legt mit gewähltem Ziel den Bereich im Feld an', async () => {
    const { sb } = renderNotes();

    const field = await screen.findByLabelText('Ein Gedanke, der für sich steht.');
    await userEvent.type(field, 'Notiz für Gesundheit.');
    await userEvent.selectOptions(screen.getByLabelText('Bereich'), 'gesundheit');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(sb.payloadOf('areas:createNote')).toEqual({
        text: 'Notiz für Gesundheit.',
        area: 'gesundheit',
      }),
    );
  });

  it('zeigt einen Konflikt beim Speichern als Toast statt als Fehlerkarte, Text bleibt im Feld', async () => {
    const { sb } = renderNotes('/notes', {
      'areas:createNote': () => {
        throw ipcError('conflict');
      },
    });

    const field = await screen.findByLabelText('Ein Gedanke, der für sich steht.');
    await userEvent.type(field, 'Text, der in Konflikt gerät.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(sb.payloadOf('areas:createNote')).toBeTruthy());
    expect(await screen.findByText(/wurde zwischenzeitlich geändert/)).toBeTruthy();
    /* Toast, not the generic inline card. */
    expect(screen.queryByRole('alert')).toBeNull();
    /* The composer only clears its field on success — the user's text is
       still there to retry with. */
    expect((field as HTMLTextAreaElement).value).toBe('Text, der in Konflikt gerät.');
  });
});

describe('Notizen: neuer Bereich', () => {
  const newArea: Area = {
    path: 'areas/finanzen.md',
    slug: 'finanzen',
    title: 'Finanzen',
    scope: 'private',
    hash: 'hash-finanzen',
    noteCount: 0,
    openTodoCount: 0,
    notes: [],
  };

  it('öffnet über den Kopf-Button einen Dialog, zeigt die Slug-Vorschau und legt an', async () => {
    /* A mutable fixture instead of a static one: `areas:list` needs to see
       the created area after the mutation, the same way the real vault
       would once the file exists. */
    const areasList: Area[] = [defaultArea, healthArea];
    const { sb } = renderNotes('/notes', {
      'areas:list': () => [...areasList],
      'areas:create': ({ title }) => {
        areasList.push(newArea);
        return { ...newArea, title };
      },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Neuer Bereich' }));
    const titleField = await screen.findByLabelText('Titel');
    await userEvent.type(titleField, 'Finanzen');

    expect(await screen.findByText('Angelegt wird areas/finanzen.md.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(sb.payloadOf('areas:create')).toEqual({ title: 'Finanzen' }));
    /* The dialog closes and the new section appears — `createArea`'s
       `onSuccess` invalidates the `areas` root (D6), `useAreas` refetches. */
    expect(await screen.findByRole('heading', { level: 2, name: 'Finanzen' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('zeigt bei einem doppelten Titel die lesbare Meldung statt der generischen Konfliktkarte', async () => {
    const { sb } = renderNotes('/notes', {
      'areas:create': () => {
        throw ipcError('conflict');
      },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Neuer Bereich' }));
    await userEvent.type(await screen.findByLabelText('Titel'), 'Gesundheit');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(sb.payloadOf('areas:create')).toBeTruthy());
    expect(
      await screen.findByText('Diesen Bereich gibt es schon — wähle einen anderen Titel.'),
    ).toBeTruthy();
    /* Not the generic "the file changed" card. */
    expect(
      screen.queryByText('Die Datei wurde zwischenzeitlich geändert. Nichts wurde überschrieben.'),
    ).toBeNull();
    /* The dialog stays open so the user can pick another title. */
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('Notizen: Notiz verschieben', () => {
  it('bietet pro Notiz einen Verschieben-Button, der die anderen Bereiche zur Wahl stellt', async () => {
    renderNotes();

    await userEvent.click(await screen.findByRole('button', { name: 'Notizen zeigen' }));
    await screen.findByText(/Zwei Wochen Schlafprotokoll, ausführlich/);

    const moveButtons = screen.getAllByRole('button', {
      name: 'In einen anderen Bereich verschieben',
    });
    /* One per note in the expanded "Gesundheit" section. */
    expect(moveButtons.length).toBe(healthNotes.length);

    await userEvent.click(moveButtons[0]!);

    const dialog = await screen.findByRole('dialog', { name: 'Notiz verschieben' });
    /* Scoped to the dialog: the composer's own target select also has an
       option named "Notizen". */
    expect(within(dialog).getByRole('option', { name: 'Notizen' })).toBeTruthy();
    /* "Gesundheit" itself never appears as a target for its own note. */
    expect(within(dialog).queryByRole('option', { name: 'Gesundheit' })).toBeNull();
  });

  it('verschiebt mit dem erwarteten Payload: from, to, line, expectedHash', async () => {
    const { sb } = renderNotes();

    await userEvent.click(await screen.findByRole('button', { name: 'Notizen zeigen' }));
    await screen.findByText(/Zwei Wochen Schlafprotokoll, ausführlich/);
    await userEvent.click(
      screen.getAllByRole('button', { name: 'In einen anderen Bereich verschieben' })[0]!,
    );
    await screen.findByRole('heading', { name: 'Notiz verschieben' });

    await userEvent.click(screen.getByRole('button', { name: 'Verschieben' }));

    await waitFor(() =>
      expect(sb.payloadOf('areas:moveNote')).toEqual({
        from: 'gesundheit',
        to: 'notes',
        line: healthNotes[0]!.line,
        expectedHash: healthArea.hash,
      }),
    );
  });

  it('zeigt bei einem Konflikt einen Toast, die Notiz bleibt sichtbar', async () => {
    const { sb } = renderNotes('/notes', {
      'areas:moveNote': () => {
        throw ipcError('conflict');
      },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Notizen zeigen' }));
    await screen.findByText(/Zwei Wochen Schlafprotokoll, ausführlich/);
    await userEvent.click(
      screen.getAllByRole('button', { name: 'In einen anderen Bereich verschieben' })[0]!,
    );
    await screen.findByRole('heading', { name: 'Notiz verschieben' });

    await userEvent.click(screen.getByRole('button', { name: 'Verschieben' }));

    await waitFor(() => expect(sb.payloadOf('areas:moveNote')).toBeTruthy());
    expect(await screen.findByText(/Gesundheit.*wurde zwischenzeitlich geändert/)).toBeTruthy();
    /* The note is still there — a failed mutation invalidates nothing. */
    expect(screen.getByText(/Zwei Wochen Schlafprotokoll, ausführlich/)).toBeTruthy();
  });

  /* Only `conflict` gets a toast. Every other code used to fail completely
     silently — the dialog just sat there with a spinner that stopped, no
     card, no toast, nothing (a review finding on this story). The dialog
     itself must now show something. */
  it('zeigt bei einem Nicht-Konflikt-Fehler eine Karte im Dialog, nicht nur Stille', async () => {
    await renderNotes('/notes', {
      'areas:moveNote': () => {
        throw ipcError('not-found');
      },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Notizen zeigen' }));
    await screen.findByText(/Zwei Wochen Schlafprotokoll, ausführlich/);
    await userEvent.click(
      screen.getAllByRole('button', { name: 'In einen anderen Bereich verschieben' })[0]!,
    );
    const dialog = await screen.findByRole('heading', { name: 'Notiz verschieben' });

    await userEvent.click(screen.getByRole('button', { name: 'Verschieben' }));

    expect(await screen.findByText(/Gesundheit.*gibt es nicht/)).toBeTruthy();
    /* Still inside the dialog, not a toast — the dialog is still open. */
    expect(dialog.closest('.gs-scrim')).not.toBeNull();
  });
});

describe('Notizen: ohne LLM und ohne A11y-Verstoß', () => {
  it('ruft während Rendern und Bedienen keinen llm:-Kanal auf', async () => {
    const { sb } = renderNotes();

    await screen.findByRole('heading', { name: 'Gesundheit' });
    await userEvent.click(screen.getByRole('button', { name: 'Notizen zeigen' }));
    await screen.findByText(healthTodo.text);
    await userEvent.type(
      await screen.findByLabelText('Ein Gedanke, der für sich steht.'),
      'Ohne Modell geschrieben.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(sb.payloadOf('areas:createNote')).toBeTruthy());

    expect(sb.calls.some((entry) => entry.channel.startsWith('llm:'))).toBe(false);
  });

  it('ist frei von A11y-Verstößen, auch mit einem ausgeklappten Bereich', async () => {
    const { container } = renderNotes();

    await userEvent.click(await screen.findByRole('button', { name: 'Notizen zeigen' }));
    await screen.findByText(healthTodo.text);
    await expectNoViolations(container);
  });
});
