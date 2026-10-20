// @vitest-environment jsdom
/* 055, D5: a failed index refresh must be visible in two places — the rail's
   vault indicator (the dot + its aria-label) and the vault settings tab (the
   index-state row). Both read the same `indexRefreshFailedAt` field, so this
   test drives both from the same mocked `VaultStatus`. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse, IndexStats } from '@shared/ipc';
import type { VaultStatus } from '@shared/types';
import { VaultIndicator } from '@renderer/components/VaultIndicator';
import { VaultTab } from '@renderer/screens/settings/VaultTab';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';

type SbHandlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const STATS: IndexStats = {
  docs: 10,
  todos: 2,
  projects: 1,
  modules: 0,
  pages: 0,
  words: 100,
  builtAt: '2026-08-10T09:00:00+02:00',
  durationMs: 500,
  oversized: [],
};

const FAILED_STATUS: VaultStatus = {
  root: 'C:/vault',
  name: 'Demo-Vault',
  ready: true,
  indexing: false,
  indexRefreshFailedAt: '2026-09-25T08:00:00+02:00',
  indexedAt: '2026-08-10T09:00:00+02:00',
  docCount: 42,
};

const RECOVERED_STATUS: VaultStatus = {
  ...FAILED_STATUS,
  indexRefreshFailedAt: null,
};

/** Same idiom as `tests/renderer/rail.test.tsx`: a renderer-only stand-in for `window.sb`. */
function installMock(handlers: SbHandlers): void {
  const invoke = async (channel: IpcChannel, payload?: unknown) => {
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) return null;
    return handler(payload);
  };
  window.sb = {
    invoke,
    on: () => () => undefined,
    off: () => undefined,
  } as unknown as SbBridge;
}

function renderIndicator() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <VaultIndicator />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderVaultTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <VaultTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLanguage('en');
});

afterEach(() => {
  delete window.sb;
});

describe('index refresh failure', () => {
  it('shows a failed index update in the rail and the vault settings', async () => {
    installMock({
      'vault:status': () => FAILED_STATUS,
      'index:stats': () => STATS,
      'vault:recent': () => [],
    });

    const indicator = renderIndicator();
    await screen.findByLabelText('Index update failed');
    expect(indicator.container.querySelector('.sb-dot--warn')).toBeTruthy();

    const tab = renderVaultTab();
    await screen.findByText('update failed — rebuild the index');

    const result = await axe.run(indicator.container);
    expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);

    indicator.unmount();
    tab.unmount();
  });

  it('shows the normal state once the failure is cleared', async () => {
    installMock({
      'vault:status': () => RECOVERED_STATUS,
      'index:stats': () => STATS,
      'vault:recent': () => [],
    });

    const indicator = renderIndicator();
    await screen.findByLabelText('Index up to date');
    expect(indicator.container.querySelector('.sb-dot--warn')).toBeNull();

    const tab = renderVaultTab();
    await screen.findByText('up to date');
    expect(screen.queryByText('update failed — rebuild the index')).toBeNull();

    indicator.unmount();
    tab.unmount();
  });
});
