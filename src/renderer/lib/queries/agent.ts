/* Whether the `claude` CLI is installed — asked, never installed from here. */

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { IpcResponse } from '@shared/ipc';
import { api } from '../api';
import { qk } from './keys';

export type AgentCliStatusResult = IpcResponse<'agent:cliStatus'>;

export function useAgentCliStatus(): UseQueryResult<AgentCliStatusResult> {
  return useQuery({
    queryKey: qk.agent.cliStatus(),
    queryFn: api.agent.cliStatus,
    retry: false,
    /* Whether the CLI is present is decided outside the app. */
    staleTime: 0,
  });
}
