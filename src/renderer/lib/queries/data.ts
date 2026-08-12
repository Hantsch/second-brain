/* Die Hooks, mit denen Screens an Vault-Daten kommen. Ein Hook pro Kanal, Keys
   aus `keys.ts` — nur so kann `events.ts` gezielt invalidieren.

   Gemeinsame Regel: gefragt wird erst, wenn ein Vault offen **und** der Index
   fertig ist. Solange er baut, bleibt die Query aus und der Screen zeigt
   Platzhalter — er behauptet nie, der Vault sei leer. */

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { IndexStats } from '@shared/ipc';
import type {
  DumpItem,
  JournalDay,
  KnowledgeModule,
  Project,
  RawSource,
  SearchHit,
  Todo,
  VaultStatus,
} from '@shared/types';
import { api } from '../api';
import { qk } from './keys';

/* Ab zwei Zeichen wird gesucht: bei einem Buchstaben trifft alles. Dieselbe
   Schwelle wie in der Befehlspalette. */
export const MIN_QUERY = 2;

export function useVaultStatus(): UseQueryResult<VaultStatus> {
  return useQuery({ queryKey: qk.vault.status(), queryFn: api.vault.status });
}

/** Steht der Index bereit? Nur dann haben Listen eine belastbare Antwort. */
export function useVaultReady(): boolean {
  const { data } = useVaultStatus();
  return data?.ready === true && !data.indexing;
}

export function useIndexStats(): UseQueryResult<IndexStats> {
  return useQuery({ queryKey: qk.index.stats(), queryFn: api.index.stats });
}

export function useProjects(): UseQueryResult<Project[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.projects.list(),
    queryFn: () => api.projects.list(),
    enabled: ready,
  });
}

export function useTodos(): UseQueryResult<Todo[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.todos.list('open'),
    queryFn: () => api.todos.list({ open: true }),
    enabled: ready,
  });
}

export function useInbox(): UseQueryResult<DumpItem[]> {
  const ready = useVaultReady();
  return useQuery({ queryKey: qk.capture.inbox(), queryFn: api.capture.inbox, enabled: ready });
}

export function useJournalDays(): UseQueryResult<JournalDay[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.journal.list(),
    queryFn: () => api.journal.list(),
    enabled: ready,
  });
}

export function useModules(): UseQueryResult<KnowledgeModule[]> {
  const ready = useVaultReady();
  return useQuery({ queryKey: qk.modules.list(), queryFn: api.modules.list, enabled: ready });
}

export function useSources(): UseQueryResult<RawSource[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.modules.sources(),
    queryFn: () => api.modules.sources(),
    enabled: ready,
  });
}

/** Volltextsuche. Unter der Mindestlänge wird nicht gefragt, nicht geraten. */
export function useSearch(text: string, limit = 12): UseQueryResult<SearchHit[]> {
  const needle = text.trim();
  return useQuery({
    queryKey: qk.search.query(`${needle}:${limit}`),
    queryFn: () => api.search.query(needle, { limit }),
    enabled: needle.length >= MIN_QUERY,
    retry: false,
  });
}
