// @vitest-environment jsdom
/* Erfassen: zwei Sekunden von „Gedanke" zu „gespeichert".
 *
 * Der Prüfstein ist die Wiederholung — nach dem Speichern muss das Feld leer,
 * fokussiert und bereit sein, sonst braucht der zweite Gedanke die Maus. Dazu:
 * Scope und Tags kommen mit, wenn sie gesetzt sind, und der Rückweg nimmt die
 * Datei wieder weg, ohne den Text zu verlieren.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { DumpItem, FilingProposal, SettingsSnapshot, TaskDefinition } from '@shared/types';
import { CapturePanel } from '@renderer/screens/capture/CapturePanel';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';

/** Wird von außen aufgelöst — damit ein Test den Vorgang mitten im Laufen prüfen kann. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const TASKS: TaskDefinition[] = [
  {
    kind: 'classify-dump',
    labelKey: 'task.classify-dump.label',
    hintKey: 'task.classify-dump.hint',
    suggested: 'cheap',
    typicalTokens: { in: 600, out: 120 },
    sensitive: false,
    streams: false,
    structured: true,
  },
];

function proposalFor(path: string): FilingProposal {
  return {
    dumpPath: path,
    title: 'Kundenportal: Ladezeiten prüfen',
    scope: 'work',
    tags: [],
    primary: { target: 'inbox', path, section: null, content: '' },
    extras: [],
    alternatives: [],
    confidence: 0.4,
    reason: 'Ohne Modell im Text erkannt.',
    todos: [],
    waitingOn: [],
    entities: [],
    heuristic: true,
    createdAt: '2026-08-10T14:32:00+02:00',
  };
}

/* `| Promise<...>` zusätzlich zur festen Antwort: ein Test hält den Vorgang
   mit `deferred()` künstlich offen, um den Zwischenstand zu prüfen. */
type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

interface Mock {
  calls: { channel: IpcChannel; payload: unknown }[];
}

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
  return { calls };
}

function dumpFor(request: IpcRequest<'capture:dump'>): DumpItem {
  return {
    path: 'inbox/2026-08-10-1432-gedanke.md',
    id: '2026-08-10-1432-gedanke',
    title: request.text.slice(0, 40),
    text: request.text,
    created: '2026-08-10T14:32:00+02:00',
    origin: request.origin,
    status: 'raw',
    ageDays: 0,
    wordCount: request.text.split(/\s+/).length,
    tags: request.tags ?? [],
    scope: request.scope ?? null,
    filedInto: null,
    filedAt: null,
  };
}

function snapshot(autoClassify: boolean): SettingsSnapshot {
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
      machine: { vramOverrideMb: null, resourceBudgetPercent: 80 },
    },
    vault: {
      version: 1,
      languages: { ui: 'de', documents: 'de', conversation: 'de', translateSources: true },
      capture: {
        quickCaptureShortcut: 'Control+Shift+Space',
        autoClassify,
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
      },
      journal: { mode: 'tips' },
      gardener: { runOnOpen: true, reviewAfterDays: 120, useLlm: true },
      providers: [],
      routing: { tasks: {}, defaults: {} },
      dashboard: { tiles: [], updated: '2026-08-10T14:32:00+02:00' },
      preferredTags: [],
    },
  };
}

function renderCapture(extra: Handlers = {}, autoClassify = true): Mock {
  const sb = installMock({
    'capture:dump': (request) => dumpFor(request),
    'settings:get': () => snapshot(autoClassify),
    /* Ohne Modell — der Normalfall im Demo-Vault. Tests, die ein Modell
       zeigen wollen, überschreiben das gezielt. */
    'llm:routing': () => ({ tasks: {}, defaults: {} }),
    'llm:tasks': () => TASKS,
    ...extra,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CapturePanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return sb;
}

function field(): HTMLTextAreaElement {
  return screen.getByLabelText('Was liegt an?') as HTMLTextAreaElement;
}

function dumpCalls(sb: Mock): IpcRequest<'capture:dump'>[] {
  return sb.calls
    .filter((call) => call.channel === 'capture:dump')
    .map((call) => call.payload as IpcRequest<'capture:dump'>);
}

beforeEach(() => {
  setLanguage('de');
});

afterEach(() => {
  delete window.sb;
});

describe('Erfassen', () => {
  it('zählt Zeichen und Wörter mit, während getippt wird', async () => {
    renderCapture();
    await userEvent.type(field(), 'Zwei Wörter');
    expect(screen.getByText('11 Zeichen · 2 Wörter')).toBeTruthy();
  });

  /* Vorher tat Esc im Feld gar nichts — der Fokus blieb stehen, ohne einen Weg
     zurück außer der Maus. Der Entwurf darf dabei nicht verloren gehen. */
  it('verlässt das Feld mit Esc, ohne den Entwurf zu verwerfen', async () => {
    renderCapture();
    await userEvent.type(field(), 'Noch nicht fertig gedacht.');
    expect(field()).toBe(document.activeElement);

    await userEvent.keyboard('{Escape}');

    expect(field()).not.toBe(document.activeElement);
    expect(field().value).toBe('Noch nicht fertig gedacht.');
  });

  it('nimmt Scope und Tags mit, wenn sie gesetzt sind', async () => {
    const sb = renderCapture();
    await userEvent.type(field(), 'Ladezeiten der Angebotsliste prüfen.');
    await userEvent.selectOptions(screen.getByLabelText('Bereich'), 'work');
    await userEvent.type(screen.getByLabelText('Tags'), '#Kundenportal, frontend');

    await userEvent.click(screen.getByRole('button', { name: /Speichern/ }));

    await waitFor(() => expect(dumpCalls(sb)).toHaveLength(1));
    expect(dumpCalls(sb)[0]).toEqual({
      text: 'Ladezeiten der Angebotsliste prüfen.',
      origin: 'window',
      tags: ['kundenportal', 'frontend'],
      scope: 'work',
    });
  });

  it('ist nach dem Speichern sofort wieder bereit — zwei Dumps ohne Maus', async () => {
    const sb = renderCapture();
    await userEvent.type(field(), 'Erster Gedanke.');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(field().value).toBe(''));
    await waitFor(() => expect(document.activeElement).toBe(field()));

    await userEvent.keyboard('Zweiter Gedanke.');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(dumpCalls(sb)).toHaveLength(2));
    expect(dumpCalls(sb).map((call) => call.text)).toEqual(['Erster Gedanke.', 'Zweiter Gedanke.']);
  });

  /* Die Zeile behauptet nicht, dass gerade etwas passiert — sie bindet sich an
     den echten Vorgang (`capture:classify`, denselben Cache wie die Inbox).
     Vorher stand „wird erstellt" unverändert da, ob der Vorschlag längst im
     Cache lag oder noch lief (main/ipc/capture.ts:121-126). */
  it('meldet den echten Stand des Vorschlags, nicht eine Einstellung', async () => {
    const gate = deferred<FilingProposal>();
    const sb = renderCapture({ 'capture:classify': () => gate.promise });
    await userEvent.type(field(), 'Kundenportal: Ladezeiten prüfen.');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(await screen.findByText('Gespeichert in')).toBeTruthy();
    expect(screen.getByText('inbox/2026-08-10-1432-gedanke.md')).toBeTruthy();
    /* Solange die Klassifizierung noch läuft: „wird erstellt". */
    expect(await screen.findByText('Vorschlag wird erstellt …')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'In der Inbox ansehen' })).toBeNull();

    /* Aufgelöst, ohne Modell: derselbe Satz wie in der Inbox — kein neuer, der
       dasselbe ein zweites Mal sagt. */
    gate.resolve(proposalFor('inbox/2026-08-10-1432-gedanke.md'));
    expect(
      await screen.findByText('Ohne Modell eingeordnet — Regeln statt Verstehen.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'In der Inbox ansehen' })).toBeTruthy();
    expect(sb.calls.filter((call) => call.channel === 'capture:classify')).toHaveLength(1);
  });

  it('meldet, wenn ein Modell den Vorschlag gebaut hat', async () => {
    renderCapture({
      'llm:routing': () => ({
        tasks: { 'classify-dump': { providerId: 'local-1', model: 'qwen2.5:14b' } },
        defaults: {},
      }),
      'capture:classify': ({ path }) => proposalFor(path),
    });
    await userEvent.type(field(), 'Kundenportal: Ladezeiten prüfen.');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(await screen.findByText('Vorschlag steht — in der Inbox')).toBeTruthy();
  });

  it('schweigt über den Vorschlag, wenn das Einordnen abgeschaltet ist', async () => {
    renderCapture({}, false);
    await userEvent.type(field(), 'Kundenportal: Ladezeiten prüfen.');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(await screen.findByText('Gespeichert in')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Vorschlag wird erstellt …')).toBeNull());
  });

  it('nimmt den Dump zurück und legt den Text wieder ins Feld', async () => {
    const sb = renderCapture({ 'capture:discard': () => ({ undoToken: 'undo-1' }) });
    await userEvent.type(field(), 'Doch nicht so wichtig.');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await screen.findByText('Gespeichert in');

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));

    await waitFor(() => expect(field().value).toBe('Doch nicht so wichtig.'));
    expect(sb.calls.find((call) => call.channel === 'capture:discard')?.payload).toEqual({
      path: 'inbox/2026-08-10-1432-gedanke.md',
    });
  });

  it('speichert nichts, wenn nichts im Feld steht', async () => {
    const sb = renderCapture();
    await userEvent.click(field());
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(dumpCalls(sb)).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Speichern/ }).hasAttribute('disabled')).toBe(true);
  });
});
