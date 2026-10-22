// @vitest-environment jsdom
/* Der Chats-Screen: hier wird gefragt, weitergefragt und zurückgekehrt.
 *
 * Geprüft wird, was der Nutzer erlebt: ein Chat aus der Liste öffnet sich mit
 * Eingabefeld darunter; die Auswahl steht in der Adresse; „Neuer Chat“ leert
 * Gespräch und Adresse; und wer den Screen mitten in einer Antwort verlässt,
 * findet sie bei der Rückkehr weiterlaufend im selben Chat vor.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcEventName, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import type { ChatMessage, ChatThread } from '@shared/types';
import { setLanguage } from '@renderer/i18n';
import type { SbBridge } from '@renderer/lib/bridge';
import { resetChatSession } from '@renderer/lib/chat-session';
import { wireEvents } from '@renderer/lib/events';
import { clearStream } from '@renderer/lib/llm-stream';
import { AskPanel } from '@renderer/screens/ask/AskPanel';
import { ChatsScreen } from '@renderer/screens/chats/ChatsScreen';

const NOW = '2026-08-10T14:32:00+02:00';
const QUESTION = 'Wie lange leben Access-Token?';
const ANSWER = 'Access-Token leben 15 Minuten.';
const FOLLOW_UP = 'Und Refresh-Token?';
const LIVE_ID = 'm-live';

type Handlers = {
  [K in IpcChannel]?: (payload: IpcRequest<K>) => IpcResponse<K> | unknown;
};

interface Mock {
  invoke: ReturnType<typeof vi.fn>;
  emit<E extends IpcEventName>(event: E, payload: IpcEvents[E]): void;
}

function installMock(handlers: Handlers): Mock {
  const listeners = new Map<string, Set<(payload: never) => void>>();
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) {
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    }
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
    invoke,
    emit: (event, payload) => {
      act(() => {
        for (const callback of listeners.get(event) ?? []) {
          (callback as (value: unknown) => void)(payload);
        }
      });
    },
  };
}

function chat(id: string, title: string, extra: ChatMessage[] = []): ChatThread {
  return {
    id,
    kind: 'ask',
    title,
    created: NOW,
    updated: NOW,
    context: null,
    messages: [
      { id: `${id}-q`, role: 'user', content: QUESTION, at: NOW },
      { id: `${id}-a`, role: 'assistant', content: ANSWER, at: NOW, model: 'qwen2.5:14b' },
      ...extra,
    ],
  };
}

const FIRST = chat('c-1', 'Token-Lebensdauer');
const SECOND = chat('c-2', 'Rollenmodell');

function baseHandlers(extra: Handlers = {}): Handlers {
  return {
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 12,
      indexedAt: NOW,
      indexing: false,
      indexRefreshFailedAt: null,
    }),
    'chat:threads': () => [FIRST, SECOND],
    'chat:thread': ({ id }) => [FIRST, SECOND].find((entry) => entry.id === id) ?? null,
    'modules:list': () => [],
    'projects:list': () => [],
    'llm:routing': () => ({ tasks: {}, defaults: {} }),
    'llm:tasks': () => [],
    ...extra,
  };
}

/** Where the router stands, plus a way to leave the screen and come back. */
function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="location" hidden>
        {`${location.pathname}${location.search}`}
      </span>
      <button type="button" onClick={() => navigate('/elsewhere')}>
        Woandershin
      </button>
      <button type="button" onClick={() => navigate('/chats')}>
        Zu den Chats
      </button>
    </>
  );
}

let unwire: (() => void) | null = null;

function renderIn(ui: ReactNode, entry = '/chats'): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  unwire = wireEvents(client);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        {/* The shell supplies the landmark in the app; standalone, axe needs one. */}
        <main>
          <Routes>
            <Route path="/chats" element={ui} />
            <Route path="/elsewhere" element={<p>Anderer Screen</p>} />
          </Routes>
        </main>
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
});

afterEach(() => {
  unwire?.();
  unwire = null;
  delete window.sb;
  clearStream(LIVE_ID);
  resetChatSession();
});

describe('Chats', () => {
  it('bietet ohne bisherigen Chat gleich das Eingabefeld an', async () => {
    installMock(baseHandlers({ 'chat:threads': () => [] }));
    renderIn(<ChatsScreen />);

    expect(await screen.findByText('Frag Gaston')).toBeTruthy();
    expect(screen.getByLabelText('Deine Frage')).toBeTruthy();
  });

  it('öffnet einen Chat aus der Liste zum Weiterfragen und merkt ihn sich in der Adresse', async () => {
    const { invoke } = installMock(baseHandlers());
    renderIn(<ChatsScreen />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Gespräch „Rollenmodell“ öffnen' }),
    );

    expect(await screen.findByText(ANSWER)).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/chats?t=c-2');
    expect(invoke).toHaveBeenCalledWith('chat:thread', { id: 'c-2' });
    expect(screen.getByLabelText('Deine Frage')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Als Wiki-Seite ablegen' })).toBeTruthy();
  });

  it('liest den Chat aus der Adresse, auch nach einem Neuladen', async () => {
    const { invoke } = installMock(baseHandlers());
    renderIn(<ChatsScreen />, '/chats?t=c-1');

    expect(await screen.findByText(ANSWER)).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith('chat:thread', { id: 'c-1' });
  });

  it('fragt im geöffneten Chat weiter', async () => {
    const { invoke } = installMock(
      baseHandlers({ 'chat:ask': () => ({ threadId: 'c-1', messageId: LIVE_ID }) }),
    );
    renderIn(<ChatsScreen />, '/chats?t=c-1');
    await screen.findByText(ANSWER);

    await userEvent.type(screen.getByLabelText('Deine Frage'), FOLLOW_UP);
    await userEvent.click(screen.getByRole('button', { name: 'Frage stellen' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'chat:ask',
        expect.objectContaining({ question: FOLLOW_UP, threadId: 'c-1' }),
      ),
    );
  });

  it('„Neuer Chat“ leert Gespräch und Adresse', async () => {
    installMock(baseHandlers());
    renderIn(<ChatsScreen />, '/chats?t=c-1');
    await screen.findByText(ANSWER);

    await userEvent.click(screen.getByRole('button', { name: 'Neuer Chat' }));

    await waitFor(() => expect(screen.queryByText(ANSWER)).toBeNull());
    expect(screen.getByTestId('location').textContent).toBe('/chats');
  });

  it('kehrt in den zuletzt offenen Chat zurück, und eine laufende Antwort wächst dort weiter', async () => {
    const state = { thread: FIRST };
    const sb = installMock(
      baseHandlers({
        'chat:ask': () => ({ threadId: 'c-1', messageId: LIVE_ID }),
        'chat:thread': () => state.thread,
        'chat:threads': () => [state.thread],
        'chat:abort': () => undefined,
      }),
    );
    renderIn(<ChatsScreen />, '/chats?t=c-1');
    await screen.findByText(ANSWER);

    state.thread = chat('c-1', 'Token-Lebensdauer', [
      { id: `${LIVE_ID}-q`, role: 'user', content: FOLLOW_UP, at: NOW },
    ]);
    await userEvent.type(screen.getByLabelText('Deine Frage'), FOLLOW_UP);
    await userEvent.click(screen.getByRole('button', { name: 'Frage stellen' }));
    await screen.findByRole('button', { name: 'Abbrechen' });
    sb.emit('event:llm-stream', {
      messageId: LIVE_ID,
      threadId: 'c-1',
      delta: 'Sie gelten ',
      done: false,
    });
    expect(await screen.findByText(/Sie gelten/)).toBeTruthy();

    /* Weg vom Screen — die Antwort läuft im Hauptprozess weiter. */
    await userEvent.click(screen.getByRole('button', { name: 'Woandershin' }));
    expect(await screen.findByText('Anderer Screen')).toBeTruthy();
    sb.emit('event:llm-stream', {
      messageId: LIVE_ID,
      threadId: 'c-1',
      delta: '30 Tage.',
      done: false,
    });

    /* Über die Navigation zurück, also ohne `?t=` in der Adresse. */
    await userEvent.click(screen.getByRole('button', { name: 'Zu den Chats' }));
    expect(await screen.findByText(/Sie gelten 30 Tage\./)).toBeTruthy();
    expect(screen.getByText(FOLLOW_UP)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeTruthy();

    /* Am Ende übernimmt die Datei. */
    state.thread = chat('c-1', 'Token-Lebensdauer', [
      { id: `${LIVE_ID}-q`, role: 'user', content: FOLLOW_UP, at: NOW },
      {
        id: LIVE_ID,
        role: 'assistant',
        content: 'Sie gelten 30 Tage.',
        at: NOW,
        model: 'qwen2.5:14b',
      },
    ]);
    sb.emit('event:llm-stream', { messageId: LIVE_ID, threadId: 'c-1', delta: '', done: true });
    expect(await screen.findByRole('button', { name: 'Frage stellen' })).toBeTruthy();
  });

  it('besteht die axe-Prüfung mit geöffnetem Chat', async () => {
    installMock(baseHandlers());
    renderIn(<ChatsScreen />, '/chats?t=c-1');
    await screen.findByText(ANSWER);

    const result = await axe.run(document.body, { resultTypes: ['violations'] });
    expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});

describe('Fragen-Panel mit übergebenem Chat', () => {
  it('öffnet genau diesen Chat statt eines leeren', async () => {
    const { invoke } = installMock(baseHandlers());
    renderIn(<AskPanel prefill={{ threadId: 'c-1' }} />);

    expect(await screen.findByText(ANSWER)).toBeTruthy();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('chat:thread', { id: 'c-1' }));
  });
});
