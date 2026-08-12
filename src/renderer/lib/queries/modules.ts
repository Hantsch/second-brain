/* Die Hooks der Wissens-Module: Seiten, Seite, Graph, Quellen, Chronik — und die
   zwei Schreibwege (Modul anlegen, Seite speichern).

   Gefragt wird erst, wenn der Index steht (`useVaultReady`): eine Seitenliste,
   die während des Indexlaufs leer zurückkommt, sähe aus wie ein leeres Modul.

   Die Chronik (`wiki/log.md`) kommt über `vault:read`. Sie ist keine Wiki-Seite
   (VAULT-FORMAT.md: Katalog und Chronik tragen kein Frontmatter), hat also
   keinen eigenen Kanal — und braucht keinen. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest, IpcResponse } from '@shared/ipc';
import type { KnowledgeModule, RawSource, VaultDoc, WikiPage, WriteResult } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';
import { useVaultReady } from './data';

export type ModuleGraph = IpcResponse<'modules:graph'>;
export type ModulePage = NonNullable<IpcResponse<'modules:page'>>;

/** Pfad der Chronik eines Moduls. */
export function modulLogPath(module: string): string {
  return `modules/${module}/wiki/log.md`;
}

export function useModulePages(module: string | null): UseQueryResult<WikiPage[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.modules.pages(module ?? ''),
    queryFn: () => api.modules.pages({ module: module ?? '' }),
    enabled: ready && module !== null,
  });
}

/** Eine Seite mit Datei-Inhalt. `null` heißt: keine ausgewählt. */
export function useModulePage(path: string | null): UseQueryResult<ModulePage | null> {
  return useQuery({
    queryKey: qk.modules.page(path ?? ''),
    queryFn: () => api.modules.page(path ?? ''),
    enabled: path !== null,
    retry: false,
  });
}

export function useModuleGraph(module: string | null): UseQueryResult<ModuleGraph> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.modules.graph(module ?? ''),
    queryFn: () => api.modules.graph(module ?? ''),
    enabled: ready && module !== null,
  });
}

export function useModuleSources(module: string | null): UseQueryResult<RawSource[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.modules.sources(module ?? undefined),
    queryFn: () => api.modules.sources(module ?? undefined),
    enabled: ready,
  });
}

/** Die Chronik als rohes Markdown. `null`, wenn es noch keine gibt. */
export function useModuleLog(module: string | null): UseQueryResult<VaultDoc | null> {
  const path = module === null ? '' : modulLogPath(module);
  return useQuery({
    queryKey: qk.vault.doc(path),
    queryFn: () => api.vault.read(path),
    enabled: module !== null,
    retry: false,
  });
}

/** Was nach einem Schreibvorgang im Wiki nicht mehr stimmt. */
function refreshModule(client: QueryClient, module: string | null): void {
  void client.invalidateQueries({ queryKey: qk.modules.list() });
  if (module === null) return;
  void client.invalidateQueries({ queryKey: qk.modules.pages(module) });
  void client.invalidateQueries({ queryKey: qk.modules.graph(module) });
  void client.invalidateQueries({ queryKey: qk.vault.doc(modulLogPath(module)) });
}

export interface ModuleMutations {
  create: UseMutationResult<KnowledgeModule, unknown, { title: string; description: string }>;
  savePage: UseMutationResult<WriteResult, unknown, IpcRequest<'modules:savePage'>>;
}

export function useModuleMutations(module: string | null = null): ModuleMutations {
  const client = useQueryClient();
  return {
    create: useMutation({
      mutationFn: ({ title, description }: { title: string; description: string }) =>
        api.modules.create(title, description),
      onSuccess: (created) => refreshModule(client, created.slug),
    }),
    savePage: useMutation({
      mutationFn: api.modules.savePage,
      onSuccess: (written) => {
        void client.invalidateQueries({ queryKey: qk.modules.page(written.path) });
        refreshModule(client, module);
      },
    }),
  };
}
