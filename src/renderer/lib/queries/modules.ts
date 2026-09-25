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
import type {
  KnowledgeModule,
  ModuleDeletePlan,
  ModuleDeleteResult,
  ModuleRenamePlan,
  ModuleRenameResult,
  ModuleUndoResult,
  RawSource,
  VaultDoc,
  WikiPage,
  WriteResult,
} from '@shared/types';
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

/**
 * The rename preview (063, D5). Modeled as a query, not a manually triggered
 * mutation like `discardPlan` (`lib/queries/gardener.ts`): the title changes
 * on every keystroke the dialog re-plans for, and a query's key-based cache
 * already drops a stale in-flight response the moment a newer title
 * supersedes it — a mutation would have to reimplement that race guard by
 * hand. Mirrors `useSectionMigrationPlan` (`lib/queries/data.ts`), the other
 * "preview that tracks a changing input" query in this codebase.
 */
export function useModuleRenamePlan(
  slug: string,
  title: string,
  enabled: boolean,
): UseQueryResult<ModuleRenamePlan> {
  return useQuery({
    queryKey: qk.modules.renamePlan(slug, title),
    queryFn: () => api.modules.renamePlan(slug, title),
    enabled,
    retry: false,
    staleTime: 0,
  });
}

export interface ModuleMutations {
  create: UseMutationResult<KnowledgeModule, unknown, { title: string; description: string }>;
  savePage: UseMutationResult<WriteResult, unknown, IpcRequest<'modules:savePage'>>;
  rename: UseMutationResult<ModuleRenameResult, unknown, IpcRequest<'modules:rename'>>;
  /**
   * Only fetches the preview (063, D6) — nothing is written until `delete`
   * confirms it, the same "plan is a mutation, not a query" trade-off
   * `discardPlan` (`lib/queries/gardener.ts`) makes: unlike the rename plan,
   * there is no changing input here to key a query on.
   */
  deletePlan: UseMutationResult<ModuleDeletePlan, unknown, string>;
  delete: UseMutationResult<ModuleDeleteResult, unknown, IpcRequest<'modules:delete'>>;
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
    rename: useMutation({
      mutationFn: (request: IpcRequest<'modules:rename'>) => api.modules.rename(request),
      onSuccess: (result, variables) => {
        refreshModule(client, result.newSlug);
        if (result.newSlug !== variables.slug) {
          /* The old slug names no module anymore. `event:vault-changed`
             invalidates the whole `modules` root centrally too (the main
             process settles a rename with a full refresh), but removing it
             here right away — same "don't wait for the event" trade-off
             `refreshModule` above already makes — keeps a stale page or
             graph view from flashing under a slug that is already gone. */
          void client.removeQueries({ queryKey: qk.modules.pages(variables.slug) });
          void client.removeQueries({ queryKey: qk.modules.graph(variables.slug) });
          void client.removeQueries({ queryKey: qk.vault.doc(modulLogPath(variables.slug)) });
        }
      },
      retry: false,
    }),
    deletePlan: useMutation({
      mutationFn: (slug: string) => api.modules.deletePlan(slug),
      retry: false,
    }),
    delete: useMutation({
      mutationFn: (request: IpcRequest<'modules:delete'>) => api.modules.delete(request),
      onSuccess: (_result, variables) => {
        /* The deleted slug names no module anymore — there is nothing left to
           refresh it into, only the list and the now-stale per-module caches
           to drop. Mirrors `rename`'s `onSuccess` removing the *old* slug's
           queries above, just with no surviving slug on the other side. */
        void client.invalidateQueries({ queryKey: qk.modules.list() });
        void client.removeQueries({ queryKey: qk.modules.pages(variables.slug) });
        void client.removeQueries({ queryKey: qk.modules.graph(variables.slug) });
        void client.removeQueries({ queryKey: qk.vault.doc(modulLogPath(variables.slug)) });
      },
      retry: false,
    }),
  };
}

/**
 * Undoes a rename or a delete (063). Its own hook, not folded into
 * `ModuleMutations`: the toast action that triggers it (`RenameModuleDialog`,
 * and `DeleteModuleDialog` to follow in D6) fires after the dialog that owns
 * `useModuleMutations` has already closed, so it needs no slug of its own —
 * `modules:undo` settles with a full index refresh regardless of which module
 * it restored.
 */
export function useModuleUndo(): UseMutationResult<ModuleUndoResult, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (undoToken: string) => api.modules.undo(undoToken),
    onSuccess: () => refreshModule(client, null),
    retry: false,
  });
}
