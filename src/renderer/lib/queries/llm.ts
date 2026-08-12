/* Die Hooks der LLM-Verwaltung: Provider, Vorlagen, Aufgaben, Routing — und die
   Frage, die jeder LLM-gestützte Screen stellt: liegt für diese Aufgabe
   überhaupt ein Modell? Die Antwort entscheidet zwischen Arbeitsfläche und dem
   ehrlichen Zustand „kein Modell konfiguriert".

   Provider und Routing liegen in den Vault-Einstellungen. Sie ändern sich nur
   durch Aktionen dieser Oberfläche, nicht durch Dateiänderungen im Vault —
   deshalb invalidieren die Mutationen hier gezielt, statt an
   `event:vault-changed` zu hängen. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest, IpcResponse } from '@shared/ipc';
import type {
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
 * Route einer Aufgabe: eigener Eintrag, sonst der Standard ihrer
 * Leistungsklasse. Dieselbe Kette wie `RoutingGateway.routeFor` im Kern — hier
 * nur, um die Oberfläche vorher schon ehrlich zu machen.
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

/** `undefined` heißt „noch unbekannt" — solange wird nichts behauptet. */
export function useTaskRouted(task: TaskKind): boolean | undefined {
  const routing = useRouting();
  const tasks = useTasks();
  if (routing.isError || tasks.isError) return undefined;
  if (!routing.data || !tasks.data) return undefined;
  return hasRoute(routing.data, tasks.data, task);
}

/**
 * Läuft auf diesem Rechner schon eine lokale Runtime? Wird nur gefragt, wenn
 * `enabled` — die Abfrage geht ans Netz (localhost) und gehört deshalb nicht in
 * jeden Screen.
 */
export function useLocalRuntimes(enabled: boolean): UseQueryResult<LocalRuntime[]> {
  return useQuery({
    queryKey: qk.llm.detect(),
    queryFn: api.llm.detectLocal,
    enabled,
    retry: false,
    /* Ob Ollama läuft, ändert sich außerhalb der App. Beim Wiederbetreten des
       Tabs wird deshalb frisch gefragt. */
    staleTime: 0,
    gcTime: 0,
  });
}

/** Was nach einer Provider-Änderung nicht mehr stimmt. */
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

/** Provider anlegen, ändern, entfernen, testen — jede Änderung frischt den Bestand auf. */
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
