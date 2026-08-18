/* The project hooks: list, a single project with its file — and the four
   write paths (create, change frontmatter, append, check off a waiting-on
   entry) plus the status suggestion.

   The sessions of a project are not here: since story 008 they come from
   `agents:projects`/`agents:sessions` per CLI (`useMergedAgentSessions` in
   `queries/agents.ts`), not from a filtered `claude:sessions`.

   Two rules that otherwise aren't visible in the code:

   - **One list, all filters.** The request goes out once with `includeDone`,
     filtering happens in the renderer. A separate query key per filter
     setting would mean an empty list on every click until the response
     arrives.
   - **The suggestion is a mutation, not a query.** It costs a model call and
     only runs when the user fetches it — not on render.
   - The request only fires once the index is ready (`useVaultReady`): an
     empty list during the index run would look like an empty vault. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest, IpcResponse } from '@shared/ipc';
import type { Project, WriteResult } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';
import { useVaultReady } from './data';

export type ProjectDetail = NonNullable<IpcResponse<'projects:get'>>;
export type StatusSuggestion = NonNullable<IpcResponse<'projects:suggestStatus'>>;

/** All projects, including completed ones — the screen's filters work on this. */
export function useAllProjects(): UseQueryResult<Project[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.projects.list('withDone'),
    queryFn: () => api.projects.list({ includeDone: true }),
    enabled: ready,
  });
}

/** A project with its file. `null` means: none selected. */
export function useProject(slug: string | null): UseQueryResult<ProjectDetail | null> {
  return useQuery({
    queryKey: qk.projects.detail(slug ?? ''),
    queryFn: () => api.projects.get(slug ?? ''),
    enabled: slug !== null && slug.length > 0,
    retry: false,
  });
}

/** What's no longer accurate about a project after a write. */
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
    /* Only fetches the suggestion. It's written via `patch` once the user
       accepts it (guardrail 2). */
    suggest: useMutation({ mutationFn: (slug: string) => api.projects.suggestStatus(slug) }),
  };
}
