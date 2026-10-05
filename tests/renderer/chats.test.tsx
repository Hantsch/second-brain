// @vitest-environment jsdom
/* Der Chats-Screen: der Verlauf aller Fragen, lesbar ohne neue Frage.
 *
 * Geprüft wird, was der Nutzer erlebt: ohne Chat steht ein ehrlicher
 * Leerzustand; ein Chat aus der Liste öffnet sich schreibgeschützt (Frage,
 * Antwort, kein „Als Wiki-Seite ablegen“); die Auswahl steht in der Adresse;
 * „Im Chat weiterfragen“ gibt den Chat an das Fragen-Overlay weiter, und das
 * Panel öffnet genau diesen Chat statt eines leeren.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { ChatThread } from '@shared/types';
import { setLanguage } from '@renderer/i18n';
import type { SbBridge } from '@renderer/lib/bridge';
import { ShellOverlaysProvider, useShellOverlays } from '@renderer/lib/shell-overlays';
import { AskPanel } from '@renderer/screens/ask/AskPanel';
import { ChatsScreen } from '@renderer/screens/chats/ChatsScreen';

const NOW = '2026-08-10T14:32:00+02:00';
const QUESTION = 'Wie lange leben Access-Token?';
const ANSWER = 'Access-Token leben 15 Minuten.';

type Handlers = {
  [K in IpcChannel]?: (payload: IpcRequest<K>) => IpcResponse<K> | unknown;
};

function installMock(handlers: Handlers): ReturnType<typeof vi.fn> {
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) {
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    }
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return invoke;
}

function chat(id: string, title: string): ChatThread {
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

/** Where the router stands, and what the shell was asked to open. */
function Probe() {
  const location = useLocation();
  const { askPrefill } = useShellOverlays();
  return (
    <>
      <span data-testid="location" hidden>
        {`${location.pathname}${location.search}`}
      </span>
      <span data-testid="prefill-thread" hidden>
        {askPrefill?.threadId ?? ''}
      </span>
    </>
  );
}

function renderIn(ui: ReactNode, entry = '/chats'): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <ShellOverlaysProvider>
          {/* The shell supplies the landmark in the app; standalone, axe needs one. */}
          <main>{ui}</main>
          <Probe />
        </ShellOverlaysProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
});

afterEach(() => {
  delete window.sb;
});

describe('Chats', () => {
  it('sagt ehrlich, dass es noch keinen Chat gibt', async () => {
    installMock(baseHandlers({ 'chat:threads': () => [] }));
    renderIn(<ChatsScreen />);

    expect(await screen.findByText('Noch kein Chat')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Gespräche' })).toBeNull();
  });

  it('öffnet einen Chat aus der Liste schreibgeschützt und merkt ihn sich in der Adresse', async () => {
    const invoke = installMock(baseHandlers());
    renderIn(<ChatsScreen />);

    expect(await screen.findByText('Wähle links einen Chat, um ihn zu lesen.')).toBeTruthy();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Gespräch „Rollenmodell“ öffnen' }),
    );

    expect(await screen.findByText(ANSWER)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Rollenmodell' })).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/chats?t=c-2');
    expect(invoke).toHaveBeenCalledWith('chat:thread', { id: 'c-2' });
    /* Ablegen gehört zum Weiterfragen — die Leseansicht bietet es nicht an. */
    expect(screen.queryByRole('button', { name: 'Als Wiki-Seite ablegen' })).toBeNull();
  });

  it('liest den Chat aus der Adresse, auch nach einem Neuladen', async () => {
    installMock(baseHandlers());
    renderIn(<ChatsScreen />, '/chats?t=c-1');

    expect(await screen.findByText(ANSWER)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Token-Lebensdauer' })).toBeTruthy();
  });

  it('gibt den Chat zum Weiterfragen an das Fragen-Overlay weiter', async () => {
    installMock(baseHandlers());
    renderIn(<ChatsScreen />, '/chats?t=c-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Im Chat weiterfragen' }));

    expect(screen.getByTestId('prefill-thread').textContent).toBe('c-1');
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
    const invoke = installMock(baseHandlers());
    renderIn(<AskPanel prefill={{ threadId: 'c-1' }} />);

    expect(await screen.findByText(ANSWER)).toBeTruthy();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('chat:thread', { id: 'c-1' }));
  });
});
