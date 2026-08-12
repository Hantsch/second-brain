/* The maintenance hooks: read the last report, start and cancel a run,
   set and unset "looks fine", apply a fix and revert it.

   Three quirks, all justified:

   - **`gardener:report` does not check anything.** The query is cheap (one file)
     and returns `null` as long as nobody has run a check. The screen then says
     "not checked yet" — and no number.
   - **The run is a mutation, not a `refetch`.** It writes (the report) and
     costs time; as a query, every mount would restart it.
   - **Progress hangs off the event, not the cache.** `event:gardener-progress`
     fires several times per second; writing every chunk into the query cache
     would re-render half the screen. Hence a small dedicated store, exactly
     like the reply stream (`llm-stream.ts`) — and a subscription that lives
     only as long as the screen is open. */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcEvents, IpcResponse } from '@shared/ipc';
import type { GardenerFinding, GardenerReport } from '@shared/types';
import { api } from '../api';
import { bridge } from '../bridge';
import { qk } from './keys';
import { useVaultReady } from './data';

export type GardenerProgress = IpcEvents['event:gardener-progress'];
export type FixResult = IpcResponse<'gardener:applyFix'>;
export type UndoFixResult = IpcResponse<'gardener:undoFix'>;

/** The last report. `null` means: there is none — not "all fine". */
export function useGardenerReport(): UseQueryResult<GardenerReport | null> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.gardener.report(),
    queryFn: api.gardener.report,
    enabled: ready,
  });
}

/** Report, dashboard, and module counts hang off the same run. */
function refresh(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: qk.gardener.report() });
  void client.invalidateQueries({ queryKey: qk.dashboard.data() });
  /* The module card shows its module's findings (`modules:list`). "Looks fine"
     lowers the count there too — otherwise two screens would disagree. */
  void client.invalidateQueries({ queryKey: qk.modules.list() });
}

/**
 * A run. `useLlm` overrides the setting for this run; without it,
 * `gardener.useLlm` in the vault decides.
 */
export function useGardenerRun(): UseMutationResult<GardenerReport, unknown, boolean | undefined> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (useLlm?: boolean) => api.gardener.run(useLlm),
    /* The main process has already stored the report; its version is the
       authoritative one and thus goes into the cache without a second round-trip. */
    onSuccess: (report) => {
      client.setQueryData(qk.gardener.report(), report);
      void client.invalidateQueries({ queryKey: qk.dashboard.data() });
      void client.invalidateQueries({ queryKey: qk.modules.list() });
    },
    /* A run is expensive and triggered by the user: no silent retry. */
    retry: false,
  });
}

export function useGardenerCancel(): UseMutationResult<void, unknown, void> {
  return useMutation({ mutationFn: () => api.gardener.cancel(), retry: false });
}

export interface GardenerMutations {
  dismiss: UseMutationResult<void, unknown, string>;
  undismiss: UseMutationResult<void, unknown, string>;
  fix: UseMutationResult<FixResult, unknown, GardenerFinding>;
  undoFix: UseMutationResult<UndoFixResult, unknown, string>;
}

/** The screen's four write paths. Each has its undo path alongside it. */
export function useGardenerMutations(): GardenerMutations {
  const client = useQueryClient();
  const done = (): void => refresh(client);
  return {
    dismiss: useMutation({ mutationFn: api.gardener.dismiss, onSuccess: done, retry: false }),
    undismiss: useMutation({ mutationFn: api.gardener.undismiss, onSuccess: done, retry: false }),
    fix: useMutation({ mutationFn: api.gardener.applyFix, onSuccess: done, retry: false }),
    undoFix: useMutation({ mutationFn: api.gardener.undoFix, onSuccess: done, retry: false }),
  };
}

/**
 * The progress of the running maintenance run. `null` means: none is running
 * right now. The subscription lives as long as the screen does — progress
 * that nobody watches doesn't need to be collected.
 */
export function useGardenerProgress(): GardenerProgress | null {
  const [progress, setProgress] = useState<GardenerProgress | null>(null);

  useEffect(() => {
    return bridge().on('event:gardener-progress', (next) => {
      setProgress(next.running ? next : null);
    });
  }, []);

  return progress;
}
