/* The body of the agent session browser, without a screen around it: the
   Claude/Codex switch, the five honest states (loading, error, missing
   session directory, off, empty) and the drill-down project list ->
   project detail -> transcript.

   The panel renders no `ScreenHeader` and no `.sb-screen` wrapper — it is
   meant to be one body among others on a screen that already brings its own
   header (same shape as `screens/sources/SourcesTab`).

   Its URL state arrives as props (`agent`, `projectKey`, `sessionId`) plus a
   `go` callback, never from `useSearchParams`: which query parameters carry
   that state is the host's business, so a second host can drive the same
   panel with its own address scheme. */

import type { AgentKind } from '@shared/types';
import { Tabs } from '../../atoms/Tabs';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { useAgentProjects, useAgentSessions } from '../../lib/queries/agents';
import { useAgentLabel, useAgentState } from './AgentStates';
import { ProjectDetail } from './ProjectDetail';
import { ProjectLinkPicker } from './ProjectLinkPicker';
import { ProjectList } from './ProjectList';
import { Transcript } from './Transcript';

/** The state the panel reads; the host decides where it lives. */
export interface AgentSessionsPanelProps {
  agent: AgentKind;
  /** Chosen working directory, or null while the project list is showing. */
  projectKey: string | null;
  /** Chosen session, or null while the project detail is showing. */
  sessionId: string | null;
  /**
   * Moves the state on. An omitted field keeps its current value, `null`
   * clears it — the host translates that into its own address.
   */
  go: (next: { a?: AgentKind; p?: string | null; s?: string | null }) => void;
  /**
   * Dismissed agent projects (`<agent kind>:<project key>`), straight from
   * the host's preference. Together with `onDismiss`/`onUndismiss` these are
   * forwarded to `ProjectList` untouched — the panel neither reads nor writes
   * the setting itself. A host that leaves them out gets a list without any
   * dismissal, which is what a project-scoped view wants.
   */
  dismissed?: readonly string[];
  onDismiss?: (key: string) => void;
  onUndismiss?: (key: string) => void;
}

export function AgentSessionsPanel({
  agent,
  projectKey,
  sessionId,
  go,
  dismissed,
  onDismiss,
  onUndismiss,
}: AgentSessionsPanelProps) {
  const t = useT();

  const { data, error, isPending, refetch } = useAgentProjects(agent);
  /* Disabled by the hook itself while `projectKey` is null (D10's own
     guard) — no extra `enabled` check needed here. */
  const sessions = useAgentSessions(agent, projectKey ?? '');

  const agentLabel = useAgentLabel(agent);

  const switcher = (
    <Tabs
      aria-label={t('agents.switch.label')}
      items={[
        { id: 'claude', label: t('agents.switch.claude') },
        { id: 'codex', label: t('agents.switch.codex') },
      ]}
      value={agent}
      /* Switching agents starts over at the top of that agent's projects —
         a project key from the other agent would point nowhere. */
      onChange={(id) => go({ a: id as AgentKind, p: null, s: null })}
    />
  );

  /* Missing directory, error, loading and "switched off" — the ladder the
     Sessions tab of a project renders too, hence `AgentStates`. Only "empty"
     stays here: what nothing means is this view's own statement. */
  const state = useAgentState({
    agent,
    error,
    loading: isPending || data === undefined,
    onRetry: () => void refetch(),
  });
  if (state !== null) {
    return (
      <>
        {switcher}
        {state}
      </>
    );
  }

  /* Unreachable while `state` is null — the loading branch above covers it;
     the fallback keeps the list below free of a non-null assertion. */
  const projects = data ?? [];

  if (projects.length === 0) {
    return (
      <>
        {switcher}
        <EmptyState
          icon="workflow"
          title={t('agents.empty.title', { agent: agentLabel })}
          body={t('agents.empty.body', { agent: agentLabel })}
        />
      </>
    );
  }

  if (projectKey !== null) {
    const project = projects.find((entry) => entry.key === projectKey) ?? null;

    /* A stale or hand-edited deep link points at a project that doesn't
       exist (any more) for this agent — an honest state, not a crash. */
    if (project === null) {
      return (
        <>
          {switcher}
          <EmptyState
            icon="circle-alert"
            title={t('agents.detail.notFound.title')}
            body={t('error.about.not-found', { subject: projectKey })}
          />
        </>
      );
    }

    /* Once `s` carries a session id, the transcript replaces `ProjectDetail`
       above — the switch stays put, the same transition as the `p` branch
       above it. `key={sessionId}` forces a fresh `Transcript` instance per
       session so its own paging state (its local `requestedCursors`) never
       survives into a different session. */
    if (sessionId !== null) {
      return (
        <>
          {switcher}
          <Transcript
            key={sessionId}
            agent={agent}
            sessionId={sessionId}
            projectKey={projectKey}
            onBack={() => go({ s: null })}
          />
        </>
      );
    }

    return (
      <>
        {switcher}
        {sessions.error ? (
          <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
        ) : sessions.isPending || sessions.data === undefined ? (
          <Skeleton lines={4} height={44} />
        ) : (
          <ProjectDetail
            project={project}
            sessions={sessions.data}
            /* Only mounted while the project has no vault project — the
               picker's own queries then don't run for a linked one. */
            link={<ProjectLinkPicker project={project} />}
            onBack={() => go({ p: null, s: null })}
            onOpenSession={(id) => go({ s: id })}
          />
        )}
      </>
    );
  }

  return (
    <>
      {switcher}
      <ProjectList
        projects={projects}
        onOpen={(key) => go({ p: key })}
        dismissed={dismissed}
        onDismiss={onDismiss}
        onUndismiss={onUndismiss}
      />
    </>
  );
}
