/* Die Hooks der Projekte: Liste, ein Projekt mit Datei, die Arbeitsspur — und
   die vier Schreibwege (anlegen, Frontmatter ändern, anhängen, Warte-auf
   abhaken) plus den Statusvorschlag.

   Zwei Regeln, die man im Code sonst nicht sieht:

   - **Eine Liste, alle Filter.** Gefragt wird einmal mit `includeDone`, gefiltert
     wird im Renderer. Ein eigener Query-Key je Filterstellung hieße: bei jedem
     Klick eine leere Liste, bis die Antwort da ist.
   - **Der Vorschlag ist eine Mutation, keine Query.** Er kostet ein Modell und
     läuft nur, wenn der Nutzer ihn holt — nicht beim Rendern.
   - Gefragt wird erst, wenn der Index steht (`useVaultReady`): eine leere Liste
     während des Indexlaufs sähe aus wie ein leerer Vault. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest, IpcResponse } from '@shared/ipc';
import type { ClaudeSession, Project, WriteResult } from '@shared/types';
import { api, IpcCallError } from '../api';
import { qk } from './keys';
import { useVaultReady } from './data';

export type ProjectDetail = NonNullable<IpcResponse<'projects:get'>>;
export type StatusSuggestion = NonNullable<IpcResponse<'projects:suggestStatus'>>;

/** Alle Projekte, auch erledigte — die Filter des Screens arbeiten darauf. */
export function useAllProjects(): UseQueryResult<Project[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.projects.list('withDone'),
    queryFn: () => api.projects.list({ includeDone: true }),
    enabled: ready,
  });
}

/** Ein Projekt mit seiner Datei. `null` heißt: keins ausgewählt. */
export function useProject(slug: string | null): UseQueryResult<ProjectDetail | null> {
  return useQuery({
    queryKey: qk.projects.detail(slug ?? ''),
    queryFn: () => api.projects.get(slug ?? ''),
    enabled: slug !== null && slug.length > 0,
    retry: false,
  });
}

/**
 * Die Claude-Sessions zu einem Projekt. Der Kanal darf fehlen — dann sagt die
 * Arbeitsspur das, statt „keine Sessions" zu behaupten (`error.code === 'invalid'`).
 */
export function useProjectSessions(project: Project | null): UseQueryResult<ClaudeSession[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.claude.sessions(),
    queryFn: () => api.claude.sessions(),
    enabled: ready,
    retry: false,
    select: (sessions) => filterSessions(sessions, project),
  });
}

/** Zuordnung über `vaultProject` oder das Arbeitsverzeichnis aus `repos`. */
export function filterSessions(
  sessions: readonly ClaudeSession[],
  project: Project | null,
): ClaudeSession[] {
  if (project === null) return [];
  const repos = project.repos.map((repo) => repo.replace(/\\/g, '/').toLowerCase());
  return sessions.filter((session) => {
    if (session.vaultProject === project.slug) return true;
    const cwd = session.cwd.replace(/\\/g, '/').toLowerCase();
    return repos.some((repo) => cwd === repo || cwd.startsWith(`${repo}/`));
  });
}

/** Ist dieser Fehler das ehrliche „der Kanal steht noch nicht"? */
export function isNotWired(error: unknown): boolean {
  return error instanceof IpcCallError && error.code === 'invalid';
}

/** Was nach einem Schreibvorgang an einem Projekt nicht mehr stimmt. */
function refresh(client: QueryClient, slug: string | null): void {
  void client.invalidateQueries({ queryKey: ['projects'] });
  void client.invalidateQueries({ queryKey: ['todos'] });
  void client.invalidateQueries({ queryKey: qk.dashboard.data() });
  if (slug !== null) void client.invalidateQueries({ queryKey: qk.projects.detail(slug) });
}

export interface ProjectMutations {
  create: UseMutationResult<Project, unknown, IpcRequest<'projects:create'>>;
  patch: UseMutationResult<Project, unknown, IpcRequest<'projects:patch'>>;
  append: UseMutationResult<WriteResult, unknown, IpcRequest<'projects:append'>>;
  resolveWaiting: UseMutationResult<Project, unknown, { slug: string; index: number }>;
  suggest: UseMutationResult<StatusSuggestion | null, unknown, string>;
}

export function useProjectMutations(): ProjectMutations {
  const client = useQueryClient();
  return {
    create: useMutation({
      mutationFn: api.projects.create,
      onSuccess: (created) => refresh(client, created.slug),
    }),
    patch: useMutation({
      mutationFn: api.projects.patch,
      onSuccess: (patched) => refresh(client, patched.slug),
    }),
    append: useMutation({
      mutationFn: api.projects.append,
      onSuccess: (_written, request) => refresh(client, request.slug),
    }),
    resolveWaiting: useMutation({
      mutationFn: ({ slug, index }: { slug: string; index: number }) =>
        api.projects.resolveWaiting(slug, index),
      onSuccess: (patched) => refresh(client, patched.slug),
    }),
    /* Holt nur den Vorschlag. Geschrieben wird er über `patch`, wenn der Nutzer
       ihn übernimmt (Guardrail 2). */
    suggest: useMutation({ mutationFn: (slug: string) => api.projects.suggestStatus(slug) }),
  };
}
