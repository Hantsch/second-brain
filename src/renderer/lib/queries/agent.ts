/* Agent tab data: whether the `claude` CLI is installed (asked, never installed
   from here) and what state the vault's agent setup is in. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest, IpcResponse } from '@shared/ipc';
import { api } from '../api';
import { useVaultReady } from './data';
import { qk } from './keys';

export type AgentCliStatusResult = IpcResponse<'agent:cliStatus'>;
export type AgentSetupStateResult = IpcResponse<'agent:setupStatus'>;
export type AgentProtectionStateResult = IpcResponse<'agent:protectionStatus'>;
export type AgentSetupApplyResponse = IpcResponse<'agent:setupApply'>;

export function useAgentCliStatus(): UseQueryResult<AgentCliStatusResult> {
  return useQuery({
    queryKey: qk.agent.cliStatus(),
    queryFn: api.agent.cliStatus,
    retry: false,
    /* Whether the CLI is present is decided outside the app. */
    staleTime: 0,
  });
}

export function useAgentSetupState(): UseQueryResult<AgentSetupStateResult> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.agent.setupState(),
    queryFn: api.agent.setupStatus,
    enabled: ready,
    retry: false,
    /* The files may be edited outside the app at any time. */
    staleTime: 0,
  });
}

export function useAgentProtection(): UseQueryResult<AgentProtectionStateResult> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.agent.protection(),
    queryFn: api.agent.protectionStatus,
    enabled: ready,
    retry: false,
    /* The settings file may be edited outside the app at any time. */
    staleTime: 0,
  });
}

/** Writes the confirmed part of a plan. The state is refetched even when some files were
    refused or in conflict: what is on disk now is what the panel must show. */
export function useApplyAgentSetup(): UseMutationResult<
  AgentSetupApplyResponse,
  unknown,
  IpcRequest<'agent:setupApply'>
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.agent.setupApply,
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: qk.agent.setupState() }),
        /* Applying can write the settings file the protection state is read from. */
        client.invalidateQueries({ queryKey: qk.agent.protection() }),
      ]),
  });
}
