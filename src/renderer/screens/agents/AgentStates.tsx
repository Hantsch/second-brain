/* The honest states of an agent session view — in one place, for every view
   that reads `agents:*`.

   There are two of those now: the all-sessions panel (`AgentSessionsPanel`)
   and the Sessions tab of a project (`projects/ProjectSessionsTab`). They ask
   different questions of the same channels, but they must answer a failure
   identically: a configured directory that isn't there names the path and
   offers the setting, a broken read offers a retry, a pending read shows a
   skeleton, and reading that is switched off says so instead of claiming
   "nothing found" (guardrail 1). Two copies of that ladder would drift, and
   the copy that drifts is the one that lies.

   `useAgentState` is a hook that returns a node because the order of these
   states is the substance: `missing directory` before the generic error,
   `off` only after the data is in. Handing the caller a ready-made node
   keeps that order in one file; the caller only decides where it goes and
   what "there is data" looks like for its own question. */

import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AgentKind } from '@shared/types';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { decodeIpcError } from '../../lib/ipc-error';
import { useOverviewSettings } from '../../lib/queries/dashboard';

/**
 * The path of a configured session directory that does not exist, if that is
 * what went wrong. The main process names it in `IpcError.detail` — a
 * misconfiguration only the user can fix, so a view has to be able to repeat
 * the path rather than turn it into a generic failure.
 */
export function missingDirOf(error: unknown): string | null {
  const detail = decodeIpcError(error).detail;
  if (typeof detail !== 'object' || detail === null) return null;
  const path = (detail as { missingDir?: unknown }).missingDir;
  return typeof path === 'string' && path.length > 0 ? path : null;
}

/** The CLI's name as the user reads it. */
export function useAgentLabel(agent: AgentKind): string {
  const t = useT();
  return t(agent === 'claude' ? 'agents.switch.claude' : 'agents.switch.codex');
}

export interface AgentStateInput {
  agent: AgentKind;
  /** What the read failed with, or `null`/`undefined` if it didn't. */
  error: unknown;
  /** True as long as the view has no data to show yet. */
  loading: boolean;
  onRetry: () => void;
}

/**
 * The state a view has to render instead of its content — or `null` when
 * there is nothing in the way and the caller can show its data.
 *
 * "Empty" is deliberately not part of this: what nothing means differs per
 * view (no project of this CLI at all vs. no session in this project), and a
 * shared empty state would have to lie about one of them.
 */
export function useAgentState({
  agent,
  error,
  loading,
  onRetry,
}: AgentStateInput): ReactNode | null {
  const t = useT();
  const navigate = useNavigate();
  const overview = useOverviewSettings();
  const agentLabel = useAgentLabel(agent);

  /* A configured directory that isn't there is not the same failure as a
     broken read: it says which path is wrong and offers the setting where it
     can be corrected. Checked before the generic error branch, otherwise a
     question the user can act on would be answered with "something went
     wrong". */
  const missingDir = error === null || error === undefined ? null : missingDirOf(error);
  if (missingDir !== null) {
    return (
      <EmptyState
        icon="circle-alert"
        title={t('agents.missingDir.title')}
        body={t('agents.missingDir.body', { agent: agentLabel, path: missingDir })}
        action={{
          label: t('agents.missingDir.action'),
          icon: 'settings',
          onClick: () => void navigate('/settings?tab=behavior'),
        }}
      />
    );
  }

  if (error !== null && error !== undefined) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (loading) return <Skeleton lines={4} height={44} />;

  /* Off vs. empty, per guardrail 1: "off" is a statement about the setting,
     never collapsed into "nothing found". Undefined settings (still loading)
     never claim "off" — that would flash a wrong state. */
  const off =
    overview !== undefined &&
    (agent === 'claude' ? !overview.useClaudeSessions : !overview.useCodexSessions);
  if (off) {
    return (
      <EmptyState
        icon="sliders-horizontal"
        title={t('agents.off.title')}
        body={t('agents.off.body', { agent: agentLabel })}
        action={{
          label: t('agents.off.action'),
          icon: 'settings',
          onClick: () => void navigate('/settings?tab=behavior'),
        }}
      />
    );
  }

  return null;
}
