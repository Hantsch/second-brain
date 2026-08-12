/* Hooks for the agent session browser (story 001): projects and sessions per
   `AgentKind` (Claude Code, Codex CLI). The transcript itself stays a plain
   per-page fetch — D14 (the transcript view) composes paging out of it once
   it exists; building an infinite-query abstraction here ahead of that
   screen would be scope no one has asked for yet. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { AgentKind, AgentProject, AgentSessionSummary, TranscriptPage } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';
import { useVaultReady } from './data';

/** Working directories with at least one session, for the given CLI. */
export function useAgentProjects(agent: AgentKind): UseQueryResult<AgentProject[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.agents.projects(agent),
    queryFn: () => api.agents.projects(agent),
    enabled: ready,
  });
}

/**
 * Sessions of one project, newest first. Without a chosen project there is
 * nothing to ask for — the query stays disabled rather than fetching an
 * empty `projectKey`.
 */
export function useAgentSessions(
  agent: AgentKind,
  projectKey: string,
): UseQueryResult<AgentSessionSummary[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.agents.sessions(agent, projectKey),
    queryFn: () => api.agents.sessions(agent, projectKey),
    enabled: ready && projectKey.length > 0,
  });
}

/**
 * One page of a session's transcript. `cursor` is part of the query key on
 * purpose: paging forward is a new page, not a refetch of the same one — the
 * view that composes these into a scroll (D14) decides when to ask for the
 * next `cursor`.
 */
export function useAgentTranscript(
  agent: AgentKind,
  sessionId: string,
  projectKey: string,
  cursor: string | null = null,
): UseQueryResult<TranscriptPage> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.agents.transcript(agent, sessionId, cursor),
    queryFn: () => api.agents.transcript({ agent, sessionId, projectKey, cursor }),
    enabled: ready && sessionId.length > 0,
  });
}

export interface LinkAgentProject {
  agent: AgentKind;
  projectKey: string;
  /** Slug of the vault project the working directory should belong to. */
  project: string;
}

/**
 * Link an agent project to a vault project — this writes into the project file,
 * the same write the dashboard tile's `useLinkSession` triggers.
 *
 * Invalidated afterwards: this agent's project list (its `vaultProject` has
 * changed), the projects themselves (their `repos` grew) and the dashboard
 * (its tiles show the link). `claude:sessions` only when a Claude project was
 * linked — that is the one list whose `vaultProject` the write changed too.
 */
export function useLinkAgentProject(): UseMutationResult<void, unknown, LinkAgentProject> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ agent, projectKey, project }: LinkAgentProject) =>
      api.agents.link(agent, projectKey, project),
    onSuccess: (_result, { agent }) => {
      void client.invalidateQueries({ queryKey: qk.agents.projects(agent) });
      void client.invalidateQueries({ queryKey: qk.dashboard.data() });
      void client.invalidateQueries({ queryKey: ['projects'] });
      if (agent === 'claude') void client.invalidateQueries({ queryKey: qk.claude.sessions() });
    },
  });
}
