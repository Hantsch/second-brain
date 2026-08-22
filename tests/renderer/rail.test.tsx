// @vitest-environment jsdom
/* 021a, D5: the maintenance indicator in the rail foot must be visible from
   any screen — not only the maintenance screen itself — and only while a run
   is actually going. Rendered here on a non-garden route (`/journal`) with
   `GardenerIndicator`'s own hook (`useGardenerProgress`), the same one
   `RunBar` uses, so this test exercises the real wiring, not a stand-in. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { VaultStatus } from '@shared/types';
import { Rail } from '@renderer/components/Rail';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';

type SbHandlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const READY_STATUS: VaultStatus = {
  root: 'C:/vault',
  name: 'Demo-Vault',
  ready: true,
  indexing: false,
  indexedAt: '2026-08-10T09:00:00+02:00',
  docCount: 42,
};

/** Same idiom as `tests/renderer/garden.test.tsx`: a renderer-only stand-in for `window.sb`. */
function installMock(handlers: SbHandlers): void {
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) return null;
    return handler(payload);
  });
  window.sb = {
    invoke,
    on: () => () => undefined,
    off: () => undefined,
  } as unknown as SbBridge;
}

function renderRail(hash = '/journal') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[hash]}>
        <Rail />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLanguage('de');
});

afterEach(() => {
  delete window.sb;
});

describe('GardenerIndicator in the rail foot', () => {
  it('shows a maintenance run going, on a screen other than the maintenance screen', async () => {
    installMock({
      'vault:status': () => READY_STATUS,
      'journal:list': () => [],
      'gardener:runStatus': () => ({
        phase: 'checks',
        check: 'orphan',
        done: 2,
        total: 9,
        running: true,
        stage: 'checks',
        percent: 22,
        remaining: [],
        startedAt: '2026-08-22T10:00:00+02:00',
        trigger: 'user',
      }),
    });

    renderRail('/journal');

    const indicator = await screen.findByRole('button', { name: /Wartungslauf läuft/ });
    expect(indicator).toBeTruthy();
  });

  it('renders nothing while no run is going', async () => {
    installMock({
      'vault:status': () => READY_STATUS,
      'journal:list': () => [],
      'gardener:runStatus': () => null,
    });

    renderRail('/journal');

    /* Give the seed query a tick to settle, then confirm nothing appeared. */
    await screen.findByRole('button', { name: 'Vault-Status, öffnet die Einstellungen' });
    expect(screen.queryByRole('button', { name: /Wartungslauf läuft/ })).toBeNull();
  });
});
