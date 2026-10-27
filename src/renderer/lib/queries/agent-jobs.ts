/* The jobs handed to the agent: the list, kept fresh by `event:agent-jobs`, and the two
   actions a person has on a source (hand it over, take it back). The files under
   `.secondbrain/agent/jobs/` are the truth; this is a mirror of what main last read. */

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest, IpcResponse } from '@shared/ipc';
import type { AgentJobView } from '@shared/types';
import { api } from '../api';
import { bridge } from '../bridge';
import { useVaultReady } from './data';
import { qk } from './keys';

/** The open condense-source job for a raw source, if the agent holds one. */
export function openSourceJob(
  jobs: readonly AgentJobView[] | undefined,
  rawPath: string,
): AgentJobView | null {
  return (
    (jobs ?? []).find(
      (job) =>
        job.kind === 'condense-source' && job.state === 'with-agent' && job.subject === rawPath,
    ) ?? null
  );
}

/** The agent has condensed this raw source: a finished `done` job names it. */
export function isSourceCondensedByAgent(
  jobs: readonly AgentJobView[] | undefined,
  rawPath: string,
): boolean {
  return (jobs ?? []).some(
    (job) => job.kind === 'condense-source' && job.state === 'done' && job.subject === rawPath,
  );
}

export function useAgentJobs(): UseQueryResult<AgentJobView[]> {
  const client = useQueryClient();
  const ready = useVaultReady();
  const result = useQuery({
    queryKey: qk.agent.jobs(),
    queryFn: api.agent.jobs,
    enabled: ready,
    retry: false,
    /* The agent settles jobs while the app is open. */
    staleTime: 0,
  });

  useEffect(() => {
    return bridge().on('event:agent-jobs', (jobs) => {
      client.setQueryData<AgentJobView[]>(qk.agent.jobs(), jobs);
    });
  }, [client]);

  return result;
}

export interface AgentJobMutations {
  handOver: UseMutationResult<
    IpcResponse<'agent:handOverSource'>,
    unknown,
    IpcRequest<'agent:handOverSource'>
  >;
  withdraw: UseMutationResult<AgentJobView[], unknown, string>;
}

export function useAgentJobMutations(): AgentJobMutations {
  const client = useQueryClient();
  return {
    handOver: useMutation({
      mutationFn: ({ rawPath, module }: IpcRequest<'agent:handOverSource'>) =>
        api.agent.handOverSource(rawPath, module),
      /* `exists` answers with the open job too — either way the list has it now. */
      onSuccess: () => client.invalidateQueries({ queryKey: qk.agent.jobs() }),
    }),
    withdraw: useMutation({
      mutationFn: api.agent.withdrawJob,
      onSuccess: (jobs) => client.setQueryData(qk.agent.jobs(), jobs),
    }),
  };
}
