/* The hooks for LLM management: providers, presets, tasks, routing — and
   the question every LLM-powered screen asks: is there even a model for
   this task? The answer decides between the working surface and the honest
   "no model configured" state.

   Providers and routing live in the vault settings. They only change
   through actions in this UI, not through file changes in the vault —
   that's why the mutations here invalidate deliberately, instead of
   hooking into `event:vault-changed`. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest, IpcResponse } from '@shared/ipc';
import type {
  EngineBuildId,
  LocalRuntimeStatus,
  MachineScanResult,
  ModelRef,
  ModelTier,
  ProviderConfig,
  ProviderPreset,
  RecommendationSet,
  Routing,
  RuntimeId,
  RuntimePlan,
  TaskDefinition,
  TaskKind,
} from '@shared/types';
import { api } from '../api';
import { qk } from './keys';

export type LocalRuntime = IpcResponse<'llm:detectLocal'>[number];
export type TaskTestResult = IpcResponse<'llm:testTask'>;

/**
 * A task's route: its own entry, otherwise the default of its performance
 * tier. The same chain as `RoutingGateway.routeFor` in the core — here only
 * to make the UI honest ahead of time.
 */
export function resolveRoute(
  routing: Routing,
  tasks: readonly TaskDefinition[],
  task: TaskKind,
): { ref: ModelRef; inherited: boolean } | null {
  const own = routing.tasks[task];
  if (own) return { ref: own, inherited: false };
  const tier = tasks.find((definition) => definition.kind === task)?.suggested;
  const fallback = tier === undefined ? undefined : routing.defaults[tier];
  return fallback ? { ref: fallback, inherited: true } : null;
}

function hasRoute(routing: Routing, tasks: readonly TaskDefinition[], task: TaskKind): boolean {
  return resolveRoute(routing, tasks, task) !== null;
}

export function useProviders(): UseQueryResult<ProviderConfig[]> {
  return useQuery({ queryKey: qk.llm.providers(), queryFn: api.llm.providers, retry: false });
}

export function usePresets(): UseQueryResult<ProviderPreset[]> {
  return useQuery({ queryKey: qk.llm.presets(), queryFn: api.llm.presets, retry: false });
}

export function useTasks(): UseQueryResult<TaskDefinition[]> {
  return useQuery({ queryKey: qk.llm.tasks(), queryFn: api.llm.tasks, retry: false });
}

export function useRouting(): UseQueryResult<Routing> {
  return useQuery({ queryKey: qk.llm.routing(), queryFn: api.llm.routing, retry: false });
}

/** `undefined` means "still unknown" — until then, nothing is asserted. */
export function useTaskRouted(task: TaskKind): boolean | undefined {
  const routing = useRouting();
  const tasks = useTasks();
  if (routing.isError || tasks.isError) return undefined;
  if (!routing.data || !tasks.data) return undefined;
  return hasRoute(routing.data, tasks.data, task);
}

/**
 * Is a local runtime already running on this machine? Only queried when
 * `enabled` — the request goes over the network (localhost) and therefore
 * doesn't belong in every screen.
 */
export function useLocalRuntimes(enabled: boolean): UseQueryResult<LocalRuntime[]> {
  return useQuery({
    queryKey: qk.llm.detect(),
    queryFn: api.llm.detectLocal,
    enabled,
    retry: false,
    /* Whether Ollama is running changes outside the app. That's why
       re-entering the tab triggers a fresh query. */
    staleTime: 0,
    gcTime: 0,
  });
}

/** What's no longer accurate after a provider change. Exported so
    `events.ts` can reuse it once a model pull finishes (019c, F6) — a fresh
    model belongs to the same "provider models" picture this already
    invalidates for every other provider-changing action, rather than a
    second, narrower invalidation growing next to it. */
export function invalidateProviders(client: ReturnType<typeof useQueryClient>): void {
  void client.invalidateQueries({ queryKey: qk.llm.providers() });
  void client.invalidateQueries({ queryKey: qk.llm.routing() });
  void client.invalidateQueries({ queryKey: qk.llm.detect() });
  void client.invalidateQueries({ queryKey: qk.settings.snapshot() });
}

export interface ProviderMutations {
  add: UseMutationResult<ProviderConfig, unknown, IpcRequest<'llm:addProvider'>>;
  update: UseMutationResult<ProviderConfig, unknown, IpcRequest<'llm:updateProvider'>>;
  remove: UseMutationResult<void, unknown, string>;
  probe: UseMutationResult<ProviderConfig, unknown, string>;
  models: UseMutationResult<string[], unknown, string>;
}

/** Add, edit, remove, test a provider — every change refreshes the set. */
export function useProviderMutations(): ProviderMutations {
  const client = useQueryClient();
  const done = (): void => invalidateProviders(client);
  return {
    add: useMutation({ mutationFn: api.llm.addProvider, onSuccess: done }),
    update: useMutation({ mutationFn: api.llm.updateProvider, onSuccess: done }),
    remove: useMutation({ mutationFn: api.llm.removeProvider, onSuccess: done }),
    probe: useMutation({ mutationFn: api.llm.probe, onSuccess: done }),
    models: useMutation({ mutationFn: api.llm.models, onSuccess: done }),
  };
}

/**
 * The remembered result of the last scan (035, D2) — what the machine card
 * shows on mount, without the user clicking scan first. `undefined` while
 * loading, `null` for "never scanned" (the honest empty state); a mutation
 * result below always takes precedence once one has run, via
 * `setQueryData` on this same key.
 */
export function useMachineScanResult(): UseQueryResult<MachineScanResult | null> {
  return useQuery({
    queryKey: qk.llm.machineScan(),
    queryFn: api.llm.getMachineScan,
    retry: false,
  });
}

/**
 * Scans this machine for RAM/VRAM/CPU/disk facts. Triggered by hand from the
 * models tab — every press is a fresh look at the machine, so this is a
 * mutation rather than a query. Its result replaces whatever
 * `useMachineScanResult` had cached, so a rescan is reflected immediately
 * without a refetch.
 */
export function useMachineScan(): UseMutationResult<MachineScanResult, unknown, void> {
  const client = useQueryClient();
  return useMutation({
    mutationKey: qk.llm.machineScan(),
    mutationFn: api.llm.scanMachine,
    onSuccess: (result) => client.setQueryData(qk.llm.machineScan(), result),
  });
}

/**
 * Sets or clears the manually entered VRAM override (028): the renderer
 * validates the raw input via `parseVramOverrideMb` before this ever runs
 * (`MachineCard.tsx`), so a rejected value never reaches the channel. Returns
 * a fresh `MachineScanResult` — same shape `useMachineScan` resolves to —
 * written into the same query cache `useMachineScanResult` reads, so the
 * card shows the edit immediately and a later remount still sees it.
 */
export function useSetVramOverride(): UseMutationResult<MachineScanResult, unknown, number | null> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.llm.setVramOverride,
    onSuccess: (result) => client.setQueryData(qk.llm.machineScan(), result),
  });
}

/**
 * Sets the resource budget percentage (029, D4): the renderer validates the
 * raw input via `parseResourceBudgetPercent` before this ever runs
 * (`MachineCard.tsx`'s `BudgetRow`), so a rejected value never reaches the
 * channel — same shape as `useSetVramOverride` above, including writing the
 * fresh `MachineScanResult` into the same query cache.
 */
export function useSetResourceBudget(): UseMutationResult<MachineScanResult, unknown, number> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.llm.setResourceBudget,
    onSuccess: (result) => client.setQueryData(qk.llm.machineScan(), result),
  });
}

export interface RoutingMutations {
  setRoute: UseMutationResult<Routing, unknown, { task: TaskKind; ref: ModelRef | null }>;
  setDefault: UseMutationResult<Routing, unknown, { tier: ModelTier; ref: ModelRef | null }>;
  test: UseMutationResult<TaskTestResult, unknown, TaskKind>;
}

export function useRoutingMutations(): RoutingMutations {
  const client = useQueryClient();
  const write = (routing: Routing): void => {
    client.setQueryData(qk.llm.routing(), routing);
    void client.invalidateQueries({ queryKey: qk.settings.snapshot() });
  };
  return {
    setRoute: useMutation({ mutationFn: api.llm.setRoute, onSuccess: write }),
    setDefault: useMutation({ mutationFn: api.llm.setDefault, onSuccess: write }),
    test: useMutation({ mutationFn: api.llm.testTask }),
  };
}

/**
 * Is Ollama installed/running on this machine (019c)? Unlike `useLocalRuntimes`
 * (which only runs while the onboarding card is showing, and probes every
 * local preset at once), this is meant to answer "without acting" the moment
 * the models tab opens — the story's own wording for the first acceptance
 * criterion — so it's always enabled, not gated behind `empty`. Still
 * `staleTime: 0`: whether the runtime is running changes outside the app, so
 * a re-visit (or the explicit "recheck" button, which just calls `refetch`)
 * must not serve a stale answer.
 */
export function useRuntimeStatus(runtime: RuntimeId): UseQueryResult<LocalRuntimeStatus> {
  return useQuery({
    queryKey: qk.llm.runtimeStatus(runtime),
    queryFn: async () => (await api.llm.localRuntimeStatus(runtime)).status,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

/**
 * The install precondition judgement (019c D1) — a plain read with no side
 * effect, but never fetched on mount: `enabled: false` and the caller drives
 * it by hand via `refetch()` when the user actually opens the "get it" flow,
 * so the dialog always shows this moment's disk/platform facts rather than
 * whatever happened to be cached from an earlier visit.
 */
export function useRuntimeInstallPlan(runtime: RuntimeId): UseQueryResult<RuntimePlan> {
  return useQuery({
    queryKey: qk.llm.runtimeInstallPlan(runtime),
    queryFn: () => api.llm.runtimeInstallPlan(runtime),
    enabled: false,
    retry: false,
  });
}

/**
 * The recommendation set (019b), read here only to derive which local models
 * are worth offering in the runtime card's pull list (`needsDownloadGb !==
 * null` rows) — see `derivePullCandidates` in `LocalRuntimePullList.tsx`.
 * Enabled only once a runtime is actually running: pulling needs a reachable
 * `POST /api/pull`, so there is nothing useful to offer before that.
 */
export function useRecommendations(enabled: boolean): UseQueryResult<RecommendationSet> {
  return useQuery({
    queryKey: qk.llm.recommendations(),
    queryFn: api.llm.recommendModels,
    enabled,
    retry: false,
  });
}

export interface RuntimeMutations {
  /** `buildId` (033, D10) is only meaningful for `'llamacpp'` — Ollama's
      channel ignores it, so passing `undefined` here keeps its behaviour
      exactly as before. */
  download: UseMutationResult<{ downloadId: string }, unknown, EngineBuildId | undefined>;
  cancelDownload: UseMutationResult<void, unknown, string>;
  openInstaller: UseMutationResult<{ opened: boolean; reason?: string }, unknown, void>;
  start: UseMutationResult<
    { started: boolean; status: LocalRuntimeStatus; reason?: 'timeout' | 'spawn-failed' },
    unknown,
    void
  >;
  /** Re-runs the install-precondition judgement for one specific build (033,
      D10) — what the install dialog's build select calls when the user picks
      a different option than the GPU-scan's preselected one, so the shown
      size/target reflect the chosen build rather than the original one. */
  replan: UseMutationResult<RuntimePlan, unknown, EngineBuildId>;
}

/**
 * The runtime lifecycle actions (019c D6; 033, D10 makes them per-runtime):
 * get the installer, cancel that download, open the finished installer,
 * start the server once installed, and re-plan for a chosen engine build.
 * Only `start` invalidates `runtimeStatus` — it's the one action whose whole
 * point is "the status just changed"; the others report through
 * `event:install-progress` instead (read directly by the dialog, not through
 * the query cache — the same split `usePullMutations` uses for pulls).
 */
export function useRuntimeMutations(runtime: RuntimeId): RuntimeMutations {
  const client = useQueryClient();
  return {
    download: useMutation({
      mutationFn: (buildId?: EngineBuildId) => api.llm.downloadRuntime(runtime, buildId),
    }),
    cancelDownload: useMutation({
      mutationFn: (downloadId: string) => api.llm.cancelRuntimeDownload(runtime, downloadId),
    }),
    openInstaller: useMutation({ mutationFn: () => api.llm.openRuntimeInstaller(runtime) }),
    start: useMutation({
      mutationFn: () => api.llm.startLocalRuntime(runtime),
      /* Only a successful start rewrites the cached status. On failure the
         card must stay on "installed, stopped" so its failure sentence
         actually renders — that sentence lives in that branch only, and
         overwriting the status unconditionally would flip the card away
         from it before the user ever saw why starting didn't work. */
      onSuccess: (result) => {
        if (result.started) client.setQueryData(qk.llm.runtimeStatus(runtime), result.status);
      },
    }),
    replan: useMutation({
      mutationFn: (buildId: EngineBuildId) => api.llm.runtimeInstallPlan(runtime, buildId),
    }),
  };
}

export interface PullMutations {
  start: UseMutationResult<{ pullId: string }, unknown, string>;
  cancel: UseMutationResult<void, unknown, string>;
}

/**
 * Starts or cancels a model pull (019c, D5). The mutations only kick the
 * pull off/end it — the running progress itself lives in `pullStore`, not
 * here, since it arrives many times per second and a query-cache write per
 * event would be the wrong tool (see `llm-stream.ts` for the same call on
 * the streaming-chat side). Nothing here needs invalidating either: no
 * query exposes "is a model installed" that a finished pull would affect.
 */
export function usePullMutations(runtime: RuntimeId): PullMutations {
  return {
    start: useMutation({ mutationFn: (modelId: string) => api.llm.pullModel(runtime, modelId) }),
    cancel: useMutation({ mutationFn: api.llm.cancelPull }),
  };
}
