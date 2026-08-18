/* The Sessions tab: what actually happened on this project, and where.

   Three facts, from two sources. The work trail — the most recent file
   change in the project folder (`lastTouch`, `lastTouchSource`) and the
   `repos` the project claims — comes from the index and is always there,
   even when no session can be read at all. The sessions themselves come from
   the agent CLIs: `agents:projects` gives the working directories of the
   selected CLI, and every one of them whose `vaultProject` is this project
   contributes its `agents:sessions`.

   Why per CLI and not one filtered `claude:sessions` (which is what the old
   work trace did): a working directory belongs to a vault project or it
   doesn't, and the CLIs answer that question themselves. It also brings
   Codex into the project view at no extra cost — the switch is the same one
   the all-sessions view has.

   A vault project may list several `repos`, so there can be several agent
   projects per CLI; their sessions are merged into one list, newest first
   (`useMergedAgentSessions`).

   The honest states are not written here: `AgentStates` renders them, the
   same ladder the all-sessions panel renders, so the two can't drift apart.
   Nothing on this tab needs a model (guardrail 1) — it is file reading. */

import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AgentKind, Project } from '@shared/types';
import { Icon } from '../../atoms/Icon';
import { Tabs } from '../../atoms/Tabs';
import { EmptyState } from '../../components/EmptyState';
import { Panel } from '../../components/Panel';
import { useLanguage, useT } from '../../i18n';
import { formatAge } from '../../lib/format';
import { useAgentProjects, useMergedAgentSessions } from '../../lib/queries/agents';
import { useAgentLabel, useAgentState } from '../agents/AgentStates';
import { SessionList } from '../agents/SessionList';
import { Transcript } from '../agents/Transcript';

export interface ProjectSessionsTabProps {
  project: Project;
  /** Which CLI is selected — from the address, so a link keeps it. */
  agent: AgentKind;
  /** The open session, or null while the list is showing. */
  sessionId: string | null;
  /** Moves the tab's own state on; an omitted field keeps its value. */
  go: (next: { a?: AgentKind | undefined; s?: string | null | undefined }) => void;
  now?: Date;
}

export function ProjectSessionsTab({
  project,
  agent,
  sessionId,
  go,
  now,
}: ProjectSessionsTabProps) {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();
  const agentLabel = useAgentLabel(agent);

  const projects = useAgentProjects(agent);
  const linked = (projects.data ?? []).filter((entry) => entry.vaultProject === project.slug);
  const sessions = useMergedAgentSessions(
    agent,
    linked.map((entry) => entry.key),
  );

  const state = useAgentState({
    agent,
    error: projects.error ?? sessions.error,
    loading:
      projects.isPending ||
      projects.data === undefined ||
      sessions.isPending ||
      sessions.data === undefined,
    onRetry: () => {
      void projects.refetch();
      sessions.refetch();
    },
  });

  /* The trail stands above everything else: the index knows it even when no
     session can be read at all, and a failed read must not swallow it. */
  const trail = (
    <Panel title={t('project.trace.title')}>
      <div className="sb-trace">
        <p className="sb-trace-touch">
          <Icon name="history" size={13} />
          <span>
            {t('project.trace.lastTouch', { age: formatAge(project.lastTouch, language, now) })}
          </span>
          <span className="sb-trace-source">
            {t(`project.trace.source.${project.lastTouchSource}`)}
          </span>
        </p>
        {project.repos.length === 0 ? (
          <p className="sb-panel-empty">{t('project.trace.noRepos')}</p>
        ) : (
          <ul className="sb-trace-repos">
            {project.repos.map((repo) => (
              <li key={repo} className="sb-mono">
                {repo}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );

  const switcher = (
    <Tabs
      aria-label={t('agents.switch.label')}
      items={[
        { id: 'claude', label: t('agents.switch.claude') },
        { id: 'codex', label: t('agents.switch.codex') },
      ]}
      value={agent}
      /* Switching CLIs closes the open transcript: a session id of the other
         agent points nowhere. */
      onChange={(id) => go({ a: id as AgentKind, s: null })}
    />
  );

  const frame = (content: ReactNode) => (
    <>
      {trail}
      {switcher}
      {content}
    </>
  );

  if (state !== null) return frame(state);

  /* Past the state ladder the sessions are in; the fallback only keeps this
     free of a non-null assertion. */
  const merged = sessions.data ?? [];

  if (sessionId !== null) {
    /* The address carries only the session id, but the transcript needs the
       working directory it lives in — it comes from the merged list. A id
       that isn't in it (stale link, other CLI selected) is an honest state,
       not a blank page. */
    const open = merged.find((session) => session.id === sessionId) ?? null;
    if (open === null) {
      return frame(
        <EmptyState
          icon="circle-alert"
          title={t('project.sessions.notFound.title')}
          body={t('error.about.not-found', { subject: sessionId })}
        />,
      );
    }
    /* `key={sessionId}` forces a fresh `Transcript` per session so its own
       paging state never survives into a different one. */
    return frame(
      <Transcript
        key={sessionId}
        agent={agent}
        sessionId={sessionId}
        projectKey={open.projectKey}
        onBack={() => go({ s: null })}
      />,
    );
  }

  if (linked.length === 0) {
    /* Without a working directory the tab has nothing to show — so it says
       what belongs in it and offers the one place where a directory is
       assigned. `ProjectDetail` hides this tab entirely unless the project has
       a link or `overview.showEmptySessionsTab` reveals it; whoever gets here
       must not run into a dead end. */
    return frame(
      <EmptyState
        icon="link"
        title={t('project.sessions.unlinked.title')}
        body={`${t('project.sessions.noneLinked', { agent: agentLabel })} ${t('project.sessions.unlinked.where')}`}
        action={{
          label: t('project.sessions.unlinked.action'),
          icon: 'workflow',
          onClick: () => void navigate('/projects/sessions'),
        }}
      />,
    );
  }

  if (merged.length === 0) {
    return frame(
      <p className="sb-panel-empty">{t('project.sessions.empty', { agent: agentLabel })}</p>,
    );
  }

  return frame(<SessionList sessions={merged} onOpen={(id) => go({ s: id })} />);
}
