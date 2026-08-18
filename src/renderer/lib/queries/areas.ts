/* The area hooks: the list, one area's notes, and the three write paths
   (create a note, create an area, move a note between areas). Mirrors
   `todos.ts`'s shape. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest } from '@shared/ipc';
import type { Area, AreaNote, WriteResult } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';
import { useVaultReady } from './data';

/** All areas in the vault. */
export function useAreas(): UseQueryResult<Area[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.areas.list(),
    queryFn: () => api.areas.list(),
    enabled: ready,
  });
}

/** One area's notes, read from the file. */
export function useAreaNotes(slug: string | null): UseQueryResult<AreaNote[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.areas.notes(slug ?? ''),
    queryFn: () => api.areas.notes(slug ?? ''),
    enabled: ready && slug !== null && slug.length > 0,
  });
}

function refresh(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['areas'] });
  /* `openTodoCount` on an `Area` depends on the todos. */
  void client.invalidateQueries({ queryKey: ['todos'] });
  void client.invalidateQueries({ queryKey: qk.dashboard.data() });
}

export interface AreaMutations {
  createNote: UseMutationResult<WriteResult, unknown, IpcRequest<'areas:createNote'>>;
  createArea: UseMutationResult<Area, unknown, string>;
  moveNote: UseMutationResult<
    { from: WriteResult; to: WriteResult },
    unknown,
    IpcRequest<'areas:moveNote'>
  >;
}

export function useAreaMutations(): AreaMutations {
  const client = useQueryClient();
  return {
    createNote: useMutation({
      mutationFn: api.areas.createNote,
      onSuccess: () => refresh(client),
    }),
    createArea: useMutation({
      mutationFn: (title: string) => api.areas.create(title),
      onSuccess: () => refresh(client),
    }),
    moveNote: useMutation({
      mutationFn: api.areas.moveNote,
      onSuccess: () => refresh(client),
    }),
  };
}
