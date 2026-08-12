/* Agents — the work trails of the agent CLIs (Claude Code, Codex), unified.
   Story 001, D11: this file builds the shell and the state machine only —
   the Claude/Codex switch and the four honest states (loading, error, off,
   empty). The project rows themselves are `ProjectList` (D12), which slots
   into the `else` branch below without touching anything above it. D13 adds
   the project-detail branch: once `p` carries a project key, the list is
   replaced by `ProjectDetail` with that project's sessions — the switch and
   header stay visible above both, unchanged. D14 adds the innermost branch:
   once `s` also carries a session id, `Transcript` replaces `ProjectDetail`
   the same way, still above the same switch and header.

   Mirrors `screens/modules/ModulesScreen.tsx`: the address is the state
   (`#/agents?a=codex&p=<key>&s=<id>`), so a deep link and the back path
   come for free. */

import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AgentKind } from '@shared/types';
import { Tabs } from '../../atoms/Tabs';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { decodeIpcError } from '../../lib/ipc-error';
import { useAgentProjects, useAgentSessions } from '../../lib/queries/agents';
import { useOverviewSettings } from '../../lib/queries/dashboard';
import { ProjectDetail } from './ProjectDetail';
import { ProjectLinkPicker } from './ProjectLinkPicker';
import { ProjectList } from './ProjectList';
import { Transcript } from './Transcript';

function isAgentKind(value: string | null): value is AgentKind {
  return value === 'claude' || value === 'codex';
}

/**
 * The path of a configured session directory that does not exist, if that is
 * what went wrong. The main process names it in `IpcError.detail` — a
 * misconfiguration only the user can fix, so the screen has to be able to
 * repeat the path rather than turn it into a generic failure (AC10).
 */
function missingDirOf(error: unknown): string | null {
  const detail = decodeIpcError(error).detail;
  if (typeof detail !== 'object' || detail === null) return null;
  const path = (detail as { missingDir?: unknown }).missingDir;
  return typeof path === 'string' && path.length > 0 ? path : null;
}

export function AgentsScreen() {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const overview = useOverviewSettings();

  const agent: AgentKind = isAgentKind(params.get('a')) ? (params.get('a') as AgentKind) : 'claude';
  const projectKey = params.get('p');
  const sessionId = params.get('s');

  const { data, error, isPending, refetch } = useAgentProjects(agent);
  /* Disabled by the hook itself while `projectKey` is null (D10's own
     guard) — no extra `enabled` check needed here. */
  const sessions = useAgentSessions(agent, projectKey ?? '');

  /* The address is the state: D12/D13/D14 read `p`/`s` and call `go` without
     needing to know anything else in this file — the same contract as
     `ModulesScreen`'s `go`. */
  const go = (next: { a?: AgentKind; p?: string | null; s?: string | null }): void => {
    const merged = new URLSearchParams();
    const nextAgent = next.a ?? agent;
    const nextProject = next.p === undefined ? projectKey : next.p;
    const nextSession = next.s === undefined ? sessionId : next.s;
    if (nextAgent !== 'claude') merged.set('a', nextAgent);
    if (nextProject !== null) merged.set('p', nextProject);
    if (nextProject !== null && nextSession !== null) merged.set('s', nextSession);
    setParams(merged, { replace: true });
  };

  const agentLabel = t(agent === 'claude' ? 'agents.switch.claude' : 'agents.switch.codex');

  const header = (
    <ScreenHeader overline={t('screen.agents.overline')} title={t('screen.agents.title')} />
  );

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

  /* Off vs. empty, per guardrail 1: "off" is a statement about the setting,
     never collapsed into "nothing found". Undefined settings (still
     loading) never claim "off" — that would flash a wrong state. */
  const off =
    overview !== undefined &&
    (agent === 'claude' ? !overview.useClaudeSessions : !overview.useCodexSessions);

  /* A configured directory that isn't there is not the same failure as a
     broken read: it says which path is wrong and offers the setting where it
     can be corrected. Checked before the generic error branch, otherwise the
     screen would answer a question the user can act on with "something went
     wrong". */
  const missingDir = error === null ? null : missingDirOf(error);
  if (missingDir !== null) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        {switcher}
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
      </div>
    );
  }

  if (error) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        {switcher}
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (isPending || data === undefined) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        {switcher}
        <Skeleton lines={4} height={44} />
      </div>
    );
  }

  if (off) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        {switcher}
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
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        {switcher}
        <EmptyState
          icon="workflow"
          title={t('agents.empty.title', { agent: agentLabel })}
          body={t('agents.empty.body', { agent: agentLabel })}
        />
      </div>
    );
  }

  if (projectKey !== null) {
    const project = data.find((entry) => entry.key === projectKey) ?? null;

    /* A stale or hand-edited deep link points at a project that doesn't
       exist (any more) for this agent — an honest state, not a crash. */
    if (project === null) {
      return (
        <div className="sb-screen sb-screen--wide">
          {header}
          {switcher}
          <EmptyState
            icon="circle-alert"
            title={t('agents.detail.notFound.title')}
            body={t('error.about.not-found', { subject: projectKey })}
          />
        </div>
      );
    }

    /* D14: once `s` carries a session id, the transcript replaces
       `ProjectDetail` above — the switch and header stay put, same
       transition as the `p` branch above it. `key={sessionId}` forces a
       fresh `Transcript` instance per session so its own paging state (D14's
       local `requestedCursors`) never survives into a different session. */
    if (sessionId !== null) {
      return (
        <div className="sb-screen sb-screen--wide">
          {header}
          {switcher}
          <Transcript
            key={sessionId}
            agent={agent}
            sessionId={sessionId}
            projectKey={projectKey}
            onBack={() => go({ s: null })}
          />
        </div>
      );
    }

    return (
      <div className="sb-screen sb-screen--wide">
        {header}
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
      </div>
    );
  }

  return (
    <div className="sb-screen sb-screen--wide">
      {header}
      {switcher}
      <ProjectList projects={data} onOpen={(key) => go({ p: key })} />
    </div>
  );
}
