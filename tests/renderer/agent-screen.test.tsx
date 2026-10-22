// @vitest-environment jsdom
/* The agent screen: its header opens plain Claude in the vault, its commands panel says
   what that session knows, and the old settings tab address still lands here. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { AgentSetupState, KnowledgeModule, VaultStatus } from '@shared/types';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';
import { agentSetupNotInstalled } from '@renderer/lib/mock-agent-setup';
import { clearToasts, useToasts } from '@renderer/lib/toast';
import { AgentScreen } from '@renderer/screens/agent/AgentScreen';
import { SettingsScreen } from '@renderer/screens/settings/SettingsScreen';

type SbHandlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const READY_STATUS: VaultStatus = {
  root: 'C:/vault',
  name: 'Demo-Vault',
  ready: true,
  indexing: false,
  indexRefreshFailedAt: null,
  indexedAt: '2026-08-10T09:00:00+02:00',
  docCount: 42,
};

const SETUP_INSTALLED: AgentSetupState = {
  ...agentSetupNotInstalled,
  files: agentSetupNotInstalled.files.map((file) => ({
    ...file,
    status: 'current',
    installedVersion: file.shippedVersion,
  })),
  action: 'none',
  help: { status: 'current', installedVersion: 4, shippedVersion: 4 },
};

function module(slug: string): KnowledgeModule {
  return {
    slug,
    title: slug,
    description: '',
    created: '2026-08-01',
    updated: '2026-08-01',
    counts: { sources: 0, entities: 0, concepts: 0 },
    findingCount: 0,
    lastIngest: null,
    tags: [],
  };
}

function installMock(handlers: SbHandlers): void {
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) return null;
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
}

function baseHandlers(setup: AgentSetupState): SbHandlers {
  return {
    'vault:status': () => READY_STATUS,
    'agent:cliStatus': () => ({ state: 'installed', path: 'C:/bin/claude' }),
    'agent:setupStatus': () => setup,
    'modules:list': () => [module('auth0'), module('gaston-help'), module('godot')],
  };
}

function show(path = '/agent') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/agent" element={<AgentScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function toastSnapshot() {
  return renderHook(() => useToasts()).result.current;
}

beforeEach(() => setLanguage('en'));

afterEach(() => {
  cleanup();
  delete window.sb;
  clearToasts();
});

describe('agent screen', () => {
  it('opens plain Claude in the vault, without a first prompt', async () => {
    const launches: unknown[] = [];
    installMock({
      ...baseHandlers(SETUP_INSTALLED),
      'agent:launchTerminal': (request) => {
        launches.push(request);
        return { ok: true, terminal: 'windows-terminal' };
      },
    });

    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Open Claude in the vault' }));

    await waitFor(() => expect(launches).toEqual([undefined]));
    await waitFor(() =>
      expect(toastSnapshot()).toEqual([
        expect.objectContaining({ kind: 'success', message: 'rail.agent.opened.windows-terminal' }),
      ]),
    );
  });

  it('says why Claude was not opened', async () => {
    installMock({
      ...baseHandlers(agentSetupNotInstalled),
      'agent:launchTerminal': () => ({ ok: false, reason: 'setup-missing' }),
    });

    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Open Claude in the vault' }));

    await waitFor(() =>
      expect(toastSnapshot()).toEqual([
        expect.objectContaining({
          kind: 'warn',
          message: 'rail.agent.refused',
          description: 'rail.agent.reason.setup-missing',
        }),
      ]),
    );
  });

  it('lists the Gaston and Claude Code commands, with the modules to curate', async () => {
    installMock(baseHandlers(SETUP_INSTALLED));
    show();

    expect(await screen.findByText('/gaston-curate <module>')).toBeTruthy();
    expect(screen.getByText('/gaston-propose')).toBeTruthy();
    expect(screen.getByText('/gaston-jobs')).toBeTruthy();
    expect(screen.getByText('/model')).toBeTruthy();
    expect(screen.getByText('/help')).toBeTruthy();
    /* The help module is read-only by convention, so it is not offered. */
    expect(await screen.findByText('auth0, godot')).toBeTruthy();
    expect(screen.queryByText(/only exist once the agent setup/)).toBeNull();
  });

  it('says the Gaston commands are not there while the setup is missing', async () => {
    installMock(baseHandlers(agentSetupNotInstalled));
    show();

    expect(await screen.findByText(/only exist once the agent setup/)).toBeTruthy();
  });

  it('sends the old settings tab address to the agent screen', async () => {
    installMock(baseHandlers(SETUP_INSTALLED));
    show('/settings?tab=agent');

    expect(await screen.findByRole('heading', { level: 1, name: 'Agent' })).toBeTruthy();
  });
});
