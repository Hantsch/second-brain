/* The todo hooks: a project's list, the list across everything — and the
   three write paths (toggle, create, update).

   `open` stays out of the request: the screen shows completed ones on
   demand, and two lists with different keys would be the same file access
   twice. Filtering happens in the renderer. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest } from '@shared/ipc';
import type { Todo } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';
import { useVaultReady } from './data';

/** All todos in the vault, open and completed. */
export function useAllTodos(): UseQueryResult<Todo[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.todos.list('withDone'),
    queryFn: () => api.todos.list({}),
    enabled: ready,
  });
}

/** A project's todos, in file order. */
export function useProjectTodos(slug: string | null): UseQueryResult<Todo[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.todos.project(slug ?? ''),
    queryFn: () => api.todos.list({ project: slug ?? '' }),
    enabled: ready && slug !== null && slug.length > 0,
  });
}

/**
 * An area's todos, in file order. `slug` is `null` while the area's
 * collapsible section is closed — same gate as `useAreaNotes`, so a
 * collapsed section never fetches anything for it.
 */
export function useAreaTodos(slug: string | null): UseQueryResult<Todo[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.todos.area(slug ?? ''),
    queryFn: () => api.todos.list({ area: slug ?? '' }),
    enabled: ready && slug !== null && slug.length > 0,
  });
}

function refresh(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['todos'] });
  /* Project counts and `lastTouch` depend on the todos. */
  void client.invalidateQueries({ queryKey: ['projects'] });
  void client.invalidateQueries({ queryKey: qk.dashboard.data() });
}

export interface TodoMutations {
  toggle: UseMutationResult<Todo, unknown, string>;
  create: UseMutationResult<Todo, unknown, IpcRequest<'todos:create'>>;
  update: UseMutationResult<Todo, unknown, IpcRequest<'todos:update'>>;
  reorder: UseMutationResult<Todo[], unknown, IpcRequest<'todos:reorder'>>;
}

export function useTodoMutations(): TodoMutations {
  const client = useQueryClient();
  return {
    toggle: useMutation({
      mutationFn: (id: string) => api.todos.toggle(id),
      onSuccess: () => refresh(client),
    }),
    create: useMutation({
      mutationFn: api.todos.create,
      onSuccess: () => refresh(client),
    }),
    update: useMutation({
      mutationFn: api.todos.update,
      onSuccess: () => refresh(client),
    }),
    reorder: useMutation({
      mutationFn: api.todos.reorder,
      onSuccess: () => refresh(client),
    }),
  };
}
