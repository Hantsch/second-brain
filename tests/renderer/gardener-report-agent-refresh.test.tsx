// @vitest-environment jsdom
/* The report's `agentAudit.open` follows the agent's job files: whenever they change, an open
   Maintenance screen must read the report again, or a failed audit would never give the
   hand-over button back. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcEventName, IpcEvents } from '@shared/ipc';
import type { VaultStatus } from '@shared/types';
import type { SbBridge } from '@renderer/lib/bridge';
import { useGardenerReport } from '@renderer/lib/queries/gardener';

const READY: VaultStatus = {
  root: 'C:/vault',
  name: 'Demo-Vault',
  ready: true,
  indexing: false,
  indexRefreshFailedAt: null,
  indexedAt: '2026-08-10T09:00:00+02:00',
  docCount: 42,
};

function Probe() {
  useGardenerReport();
  return null;
}

afterEach(() => {
  cleanup();
  delete window.sb;
});

describe('useGardenerReport', () => {
  it('reads the report again when the agent jobs change', async () => {
    const listeners: ((payload: IpcEvents['event:agent-jobs']) => void)[] = [];
    const reportCalls = vi.fn();
    const invoke = vi.fn(async (channel: IpcChannel) => {
      if (channel === 'vault:status') return READY;
      if (channel === 'gardener:report') reportCalls();
      return null;
    });
    window.sb = {
      invoke,
      on: (event: IpcEventName, callback: (payload: IpcEvents['event:agent-jobs']) => void) => {
        if (event === 'event:agent-jobs') listeners.push(callback);
        return () => undefined;
      },
      off: () => undefined,
    } as unknown as SbBridge;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(reportCalls).toHaveBeenCalledTimes(1));

    listeners.forEach((listener) => listener([]));

    await waitFor(() => expect(reportCalls).toHaveBeenCalledTimes(2));
  });
});
