/* Die Hooks der Todos: die Liste eines Projekts, die Liste über alles — und die
   drei Schreibwege (abhaken, anlegen, ändern).

   `open` bleibt aus der Anfrage heraus: der Screen zeigt Erledigte auf Wunsch,
   und zwei Listen mit unterschiedlichen Schlüsseln wären zweimal derselbe
   Dateizugriff. Gefiltert wird im Renderer. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest } from '@shared/ipc';
import type { Todo } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';
import { useVaultReady } from './data';

/** Alle Todos des Vaults, offene und erledigte. */
export function useAllTodos(): UseQueryResult<Todo[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.todos.list('withDone'),
    queryFn: () => api.todos.list({}),
    enabled: ready,
  });
}

/** Die Todos eines Projekts, in Dateireihenfolge. */
export function useProjectTodos(slug: string | null): UseQueryResult<Todo[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.todos.project(slug ?? ''),
    queryFn: () => api.todos.list({ project: slug ?? '' }),
    enabled: ready && slug !== null && slug.length > 0,
  });
}

function refresh(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['todos'] });
  /* Zählungen und `lastTouch` der Projekte hängen an den Todos. */
  void client.invalidateQueries({ queryKey: ['projects'] });
  void client.invalidateQueries({ queryKey: qk.dashboard.data() });
}

export interface TodoMutations {
  toggle: UseMutationResult<Todo, unknown, string>;
  create: UseMutationResult<Todo, unknown, IpcRequest<'todos:create'>>;
  update: UseMutationResult<Todo, unknown, IpcRequest<'todos:update'>>;
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
  };
}
