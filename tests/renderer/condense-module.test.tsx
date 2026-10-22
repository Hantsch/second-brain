// @vitest-environment jsdom
/* The condensed tab of a module: the wiring that differs from the area and
 * project levels — the `module` unit on the wire, the `condense-module` task,
 * the `modules.condensed.*` copy, and no delete action even when an artifact
 * exists. The panel's shared behaviour is covered by `condense-project.test.tsx`. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { ModuleCondensedTab } from '@renderer/screens/modules/ModuleCondensedTab';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';
import { resetWorkTasksStoreForTests } from '@renderer/lib/tasks-store';
import { clearToasts } from '@renderer/lib/toast';

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

interface Call {
  channel: IpcChannel;
  payload: unknown;
}

function installMock(handlers: Handlers): Call[] {
  const calls: Call[] = [];
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) throw Object.assign(new Error(`no handler for ${channel}`), { code: 'invalid' });
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return calls;
}

const MODULE = { slug: 'second-brain-methodik', title: 'Second-Brain-Methodik' };

const ARTIFACT = {
  content: 'Verdichtete Übersicht des Moduls.',
  hash: 'hash-condensed',
  path: 'modules/second-brain-methodik/wiki/overview.md',
  condensedAt: '2026-08-10T09:00:00+02:00',
  sources: ['modules/second-brain-methodik/wiki/index.md'],
};

const ROUTED: Handlers = {
  'llm:routing': () => ({
    tasks: {
      'condense-module': { providerId: 'local', model: 'qwen' },
      'condense-area': { providerId: 'local', model: 'qwen' },
    },
    defaults: {},
  }),
  'llm:tasks': () => [],
};

const NOT_ROUTED: Handlers = {
  'llm:routing': () => ({ tasks: {}, defaults: {} }),
  'llm:tasks': () => [],
};

function renderPanel(handlers: Handlers): Call[] {
  const calls = installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 5,
      indexedAt: '2026-08-10T09:00:00+02:00',
      indexing: false,
      indexRefreshFailedAt: null,
    }),
    'condense:read': () => null,
    ...handlers,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ModuleCondensedTab module={MODULE} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return calls;
}

beforeEach(() => {
  resetWorkTasksStoreForTests();
  setLanguage('en');
});

afterEach(() => {
  delete window.sb;
  clearToasts();
});

Element.prototype.scrollIntoView = () => undefined;

describe('condensed tab of a module', () => {
  it('reads the module unit and offers a trigger once a model is routed', async () => {
    const calls = renderPanel(ROUTED);

    expect(await screen.findByText('Not condensed yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Condense this module' })).toBeTruthy();
    expect(calls.find((entry) => entry.channel === 'condense:read')?.payload).toEqual({
      unit: 'module',
      slug: MODULE.slug,
    });
  });

  it('names condense-module without a trigger when no model is routed, and keeps the artifact readable', async () => {
    renderPanel({ ...NOT_ROUTED, 'condense:read': () => ARTIFACT });

    expect(await screen.findByText('This step needs a model')).toBeTruthy();
    expect(screen.getByText(/Condense module/)).toBeTruthy();
    expect(await screen.findByText('Verdichtete Übersicht des Moduls.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Condense/ })).toBeNull();
  });

  it('offers no delete action for an existing artifact', async () => {
    renderPanel({ ...ROUTED, 'condense:read': () => ARTIFACT });

    expect(await screen.findByText('Verdichtete Übersicht des Moduls.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Condense again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete condensation' })).toBeNull();
  });
});
