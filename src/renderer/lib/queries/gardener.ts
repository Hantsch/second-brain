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

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import type { GardenerFinding, GardenerReport } from '@shared/types';
import { api } from '../api';
import { bridge } from '../bridge';
import { qk } from './keys';
import { useVaultReady } from './data';

export type GardenerProgress = IpcEvents['event:gardener-progress'];
export type FixResult = IpcResponse<'gardener:applyFix'>;
export type UndoFixResult = IpcResponse<'gardener:undoFix'>;
export type DiscardPlanResult = IpcResponse<'gardener:discardPlan'>;
export type DiscardPageResult = IpcResponse<'gardener:discardPage'>;
export type SupersedeResult = IpcResponse<'gardener:supersede'>;
export type OrphanTargetsResult = IpcResponse<'gardener:orphanTargets'>;
export type LinkOrphanResult = IpcResponse<'gardener:linkOrphan'>;
export type AnswerLooseEndResult = IpcResponse<'journal:answerLooseEnd'>;

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
 * `gardener.useLlm` in the vault decides. `resume: true` continues the last
 * stored run (021b, D3/D4) instead of starting fresh — the screen's
 * "continue" button next to "check now".
 */
export function useGardenerRun(): UseMutationResult<
  GardenerReport,
  unknown,
  IpcRequest<'gardener:run'> | undefined
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (options?: IpcRequest<'gardener:run'>) => api.gardener.run(options),
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
  /** Puts a finding away until it counts again — mirrors `useSnoozeReminder`. */
  snooze: UseMutationResult<void, unknown, { id: string; days: number }>;
  /** The reverse path to `snooze`, otherwise there would be none. */
  unsnooze: UseMutationResult<void, unknown, string>;
  fix: UseMutationResult<FixResult, unknown, GardenerFinding>;
  undoFix: UseMutationResult<UndoFixResult, unknown, string>;
  /**
   * Only fetches the preview (015 D6) — nothing is written until `discardPage`
   * confirms it, same trade-off as `projects:suggestStatus` (guardrail 2).
   */
  discardPlan: UseMutationResult<DiscardPlanResult, unknown, IpcRequest<'gardener:discardPlan'>>;
  discardPage: UseMutationResult<DiscardPageResult, unknown, IpcRequest<'gardener:discardPage'>>;
  supersede: UseMutationResult<SupersedeResult, unknown, IpcRequest<'gardener:supersede'>>;
  /**
   * Candidates for an orphan finding with no unambiguous fix (016 D2) — a
   * fetch-on-demand read, like `discardPlan`: nothing is written until
   * `linkOrphan` confirms a pick.
   */
  orphanTargets: UseMutationResult<OrphanTargetsResult, unknown, string>;
  /**
   * Confirms a pick (016 D3) — this one writes, so the report, the dashboard and
   * the module counts are invalidated exactly as after `discardPage`.
   */
  linkOrphan: UseMutationResult<LinkOrphanResult, unknown, IpcRequest<'gardener:linkOrphan'>>;
  /**
   * Answers a loose end (020 D5/D6). Unlike every other mutation here, the
   * write touches no persisted report state — `journal:answerLooseEnd` only
   * records the id in its own file (`main/loose-end-state.ts`) — so a
   * `gardener:report` refetch would bring the very same finding straight
   * back. The finding is therefore removed from the cached report directly
   * (`onSuccess` below), not through `refresh()`.
   */
  answerLooseEnd: UseMutationResult<
    AnswerLooseEndResult,
    unknown,
    IpcRequest<'journal:answerLooseEnd'>
  >;
}

/** The screen's write paths. Each has its undo path alongside it. */
export function useGardenerMutations(): GardenerMutations {
  const client = useQueryClient();
  const done = (): void => refresh(client);
  return {
    dismiss: useMutation({ mutationFn: api.gardener.dismiss, onSuccess: done, retry: false }),
    undismiss: useMutation({ mutationFn: api.gardener.undismiss, onSuccess: done, retry: false }),
    snooze: useMutation({
      mutationFn: ({ id, days }: { id: string; days: number }) => api.gardener.snooze(id, days),
      onSuccess: done,
      retry: false,
    }),
    unsnooze: useMutation({ mutationFn: api.gardener.unsnooze, onSuccess: done, retry: false }),
    fix: useMutation({ mutationFn: api.gardener.applyFix, onSuccess: done, retry: false }),
    undoFix: useMutation({ mutationFn: api.gardener.undoFix, onSuccess: done, retry: false }),
    discardPlan: useMutation({ mutationFn: api.gardener.discardPlan, retry: false }),
    discardPage: useMutation({
      mutationFn: api.gardener.discardPage,
      onSuccess: done,
      retry: false,
    }),
    supersede: useMutation({ mutationFn: api.gardener.supersede, onSuccess: done, retry: false }),
    orphanTargets: useMutation({ mutationFn: api.gardener.orphanTargets, retry: false }),
    linkOrphan: useMutation({ mutationFn: api.gardener.linkOrphan, onSuccess: done, retry: false }),
    answerLooseEnd: useMutation({
      mutationFn: (request: IpcRequest<'journal:answerLooseEnd'>) =>
        api.journal.answerLooseEnd(request),
      /* Direct removal, not `refresh()`: invalidating `gardener.report()` would
         only refetch the same stale finding — see the interface comment above. */
      onSuccess: (_, variables) => {
        client.setQueryData<GardenerReport | null>(qk.gardener.report(), (prev) =>
          prev === null || prev === undefined
            ? prev
            : { ...prev, findings: prev.findings.filter((entry) => entry.id !== variables.id) },
        );
      },
      retry: false,
    }),
  };
}

/**
 * The progress of the running maintenance run. `null` means: none is running
 * right now. Seeded from `gardener:runStatus` on mount (021a, D4) — a screen
 * opened mid-run must show the bar right away, not wait for the next
 * `event:gardener-progress` tick, which may be seconds out. The subscription
 * then lives as long as the screen does and layers live updates on top;
 * progress that nobody watches doesn't need to be collected.
 */
export function useGardenerProgress(): GardenerProgress | null {
  const ready = useVaultReady();
  const [progress, setProgress] = useState<GardenerProgress | null>(null);
  /* Once a live event has arrived, it is the newer truth — the seed must
     never overwrite it, even if the query resolves after that first event
     (e.g. a run finishing right as the screen mounts). */
  const liveEventSeen = useRef(false);

  const { data: seed } = useQuery({
    queryKey: qk.gardener.runStatus(),
    queryFn: api.gardener.runStatus,
    enabled: ready,
    /* A one-shot read of "is a run going right now" — nothing here changes
       under a refetch that the live event stream wouldn't already report. */
    staleTime: Infinity,
    gcTime: 0,
  });

  useEffect(() => {
    if (seed && !liveEventSeen.current) setProgress(seed);
  }, [seed]);

  useEffect(() => {
    return bridge().on('event:gardener-progress', (next) => {
      liveEventSeen.current = true;
      setProgress(next.running ? next : null);
    });
  }, []);

  return progress;
}
