/* The update check's state. Main owns it and pushes every change through
   `event:update` (wired in `events.ts` into this query's cache entry); the
   query only supplies the first value. The renderer never decides whether a
   version is newer — it shows what main reports. */

import { useMutation, useQuery } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { UpdateState } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';

export function useUpdateState(): UseQueryResult<UpdateState> {
  return useQuery({ queryKey: qk.update.state(), queryFn: api.update.state });
}

export function useCheckForUpdates(): UseMutationResult<UpdateState, unknown, void> {
  return useMutation({ mutationFn: () => api.update.check(), retry: false });
}
