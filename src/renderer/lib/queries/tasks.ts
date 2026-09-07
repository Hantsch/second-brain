/* The work queue's write paths (072, D3): cancel, remove, retry.
   Mirrors `queries/gardener.ts`'s split between "the read lives in a store,
   not the cache" and "mutations are still plain TanStack mutations" — the
   queue itself is event-driven (`tasks-store.ts`, fed by `event:work-tasks`),
   so a mutation here does not invalidate or refetch anything: the main
   process emits the fresh list the moment the write lands, and the store
   already reads that live. A mutation that awaited nothing but the round-trip
   would leave the button's pending/error state with nothing to reflect, which
   is the only reason these are `useMutation`s at all rather than bare calls. */

import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type { WorkTask } from '@shared/types';
import { api } from '../api';

export { useWorkTasks, useWorkTasksLoaded } from '../tasks-store';

export function useTaskCancel(): UseMutationResult<boolean, unknown, string> {
  return useMutation({ mutationFn: (id: string) => api.tasks.cancel(id), retry: false });
}

export function useTaskRemove(): UseMutationResult<boolean, unknown, string> {
  return useMutation({ mutationFn: (id: string) => api.tasks.remove(id), retry: false });
}

export function useTaskRetry(): UseMutationResult<WorkTask | null, unknown, string> {
  return useMutation({ mutationFn: (id: string) => api.tasks.retry(id), retry: false });
}
