// @vitest-environment jsdom
/* 042, D5: the rail no longer carries its own maintenance-run indicator — a
   run going is now surfaced by `RunStrip` in the app shell (see
   `src/renderer/components/RunStrip.tsx`, mounted in `AppShell.tsx`), not by
   a rail entry. This file keeps the baseline smoke test that the rail
   renders its regular navigation and the vault indicator; the former
   `GardenerIndicator`-in-the-rail tests were removed with that component. */

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

describe('Rail', () => {
  it('renders the vault indicator regardless of a maintenance run going', async () => {
    installMock({
      'vault:status': () => READY_STATUS,
      'journal:list': () => [],
    });

    renderRail('/journal');

    expect(
      await screen.findByRole('button', { name: 'Vault-Status, öffnet die Einstellungen' }),
    ).toBeTruthy();
    /* No dedicated rail entry for a run — that's RunStrip's job now (D3). */
    expect(screen.queryByRole('button', { name: /Wartungslauf läuft/ })).toBeNull();
  });
});
