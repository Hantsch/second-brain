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
  MachineScanResult,
  ModelRef,
  ModelTier,
  ProviderConfig,
  ProviderPreset,
  Routing,
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

/** What's no longer accurate after a provider change. */
function invalidateProviders(client: ReturnType<typeof useQueryClient>): void {
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
 * Scans this machine for RAM/VRAM/CPU/disk facts. Triggered by hand from the
 * models tab — no caching, no staleness: every press is a fresh look at the
 * machine, so this is a mutation rather than a query.
 */
export function useMachineScan(): UseMutationResult<MachineScanResult, unknown, void> {
  return useMutation({ mutationKey: qk.llm.machineScan(), mutationFn: api.llm.scanMachine });
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
