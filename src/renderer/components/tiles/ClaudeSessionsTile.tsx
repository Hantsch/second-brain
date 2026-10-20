/* The agent CLI's work trails: project, branch, when, and what.

   Three states, all made explicit:
   - **Off**: the toggle in the Behavior tab is switched off. Then that's
     what's shown, with the path to get there — not "no sessions".
   - **Empty**: there's no session nearby. That too is a statement.
   - **Unlinked**: the session sits in a directory that no project knows
     about. Then it shows "link project" — and linking writes the path into
     `repos` of the project file, where it belongs.

   After linking, a toast says which project the path was written to, and
   offers to undo it: `repos` gets back exactly the list that was in the
   file before. Without this path, a mistaken link would require cleaning up
   the Markdown file by hand.

   The branch is shown in mono: it's data, not prose. */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AgentWorkSession } from '@shared/types';
import { useT } from '../../i18n';
import { useProjects } from '../../lib/queries/data';
import { useDashboardData, useLinkSession, useOverviewSettings } from '../../lib/queries/dashboard';
import { useLinkAgentProject } from '../../lib/queries/agents';
import { useProjectMutations } from '../../lib/queries/projects';
import { pushToast } from '../../lib/toast';
import { RelativeTime } from '../RelativeTime';
import { TileFrame } from '../TileFrame';
import { SessionLink } from './SessionLink';

const LIMIT = 6;

/** Agent name, mono like the rest of a row's data. Reuses the switch labels
    the session browser already carries — one place names each CLI. */
const AGENT_LABEL_KEY: Record<AgentWorkSession['agent'], string> = {
  claude: 'agents.switch.claude',
  codex: 'agents.switch.codex',
};

export function ClaudeSessionsTile() {
  const t = useT();
  const navigate = useNavigate();
  const overview = useOverviewSettings();
  const dashboard = useDashboardData();
  const projects = useProjects();
  const link = useLinkSession();
  const linkAgent = useLinkAgentProject();
  const { patch } = useProjectMutations();
  const [linking, setLinking] = useState<string | null>(null);
  /* Off is a statement about both CLIs, not either one: a row from the CLI
     that's still on must keep showing while the other is switched off. */
  const off = overview !== undefined && !overview.useClaudeSessions && !overview.useCodexSessions;
  const rows: AgentWorkSession[] = off ? [] : (dashboard.data?.sessions ?? []).slice(0, LIMIT);

  /* The state of `repos` **before** the write is the undo. It's captured
     here before the queries re-run. */
  const linkTo = (session: AgentWorkSession, slug: string): void => {
    const target = (projects.data ?? []).find((project) => project.slug === slug);
    const before = target?.repos ?? [];
    link.mutate(
      { sessionId: session.id, project: slug },
      {
        onSuccess: () =>
          pushToast('success', {
            message: 'tile.claude.linkedTo',
            values: { name: target?.title ?? slug },
            description: 'tile.claude.linkHint',
            action: {
              label: 'common.undo',
              run: () => patch.mutate({ slug, patch: { repos: [...before] } }),
            },
          }),
      },
    );
  };

  /* Same write as `linkTo`, through `agents:link` — the channel every Codex
     project row goes through, session browser included. */
  const linkAgentTo = (session: AgentWorkSession, slug: string): void => {
    const target = (projects.data ?? []).find((project) => project.slug === slug);
    const before = target?.repos ?? [];
    linkAgent.mutate(
      { agent: session.agent, projectKey: session.projectKey, project: slug },
      {
        onSuccess: () =>
          pushToast('success', {
            message: 'agents.link.done',
            values: { name: target?.title ?? slug },
            description: 'agents.link.hint',
            action: {
              label: 'common.undo',
              run: () => patch.mutate({ slug, patch: { repos: [...before] } }),
            },
          }),
        onError: () => pushToast('error', 'agents.link.failed'),
      },
    );
  };

  return (
    <TileFrame
      id="claude-sessions"
      title={t('module.claude-sessions.name')}
      pending={!off && dashboard.isPending}
      error={dashboard.error ?? link.error ?? linkAgent.error ?? patch.error}
      onRetry={() => void dashboard.refetch()}
      isEmpty={off || rows.length === 0}
      empty={
        off
          ? {
              body: t('tile.claude.off'),
              action: {
                label: t('tile.claude.settings'),
                onClick: () => void navigate('/settings?tab=behavior'),
              },
            }
          : { body: t('tile.claude.empty') }
      }
      foot={
        <button
          type="button"
          className="sb-textlink"
          onClick={() => void navigate('/projects/sessions')}
        >
          {t('tile.claude.openBrowser')}
        </button>
      }
    >
      <ul className="sb-lines">
        {rows.map((session) => {
          /* A Codex session without a known working directory can't be
             written into `repos` — `agents:link` has no cwd to resolve, the
             same reason the session browser's project list drops it. */
          const canLink = session.agent === 'claude' || session.cwd.length > 0;
          const detail = session.summary ?? session.firstPrompt;
          return (
            <li key={session.id} className="sb-line sb-line--stack">
              <span className="sb-line-top">
                <span className="sb-mono">{t(AGENT_LABEL_KEY[session.agent])}</span>
                <span className="sb-line-name">
                  {session.vaultProject === null
                    ? session.projectName
                    : (projects.data?.find((project) => project.slug === session.vaultProject)
                        ?.title ?? session.projectName)}
                </span>
                {session.gitBranch === null ? null : (
                  <span className="sb-mono sb-line-branch">{session.gitBranch}</span>
                )}
                <RelativeTime at={session.lastActivity} className="sb-line-meta" />
              </span>
              {detail.length === 0 ? null : (
                <span className="sb-line-detail" title={detail}>
                  {detail}
                </span>
              )}
              <span className="sb-line-bottom">
                <span className="sb-line-count">
                  {t('tile.claude.messages', { count: session.messageCount })}
                </span>
                {session.vaultProject !== null || !canLink ? null : linking === session.id ? (
                  <SessionLink
                    name={session.projectName}
                    projects={projects.data ?? []}
                    onPick={(slug) => {
                      setLinking(null);
                      if (session.agent === 'claude') linkTo(session, slug);
                      else linkAgentTo(session, slug);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="sb-textlink"
                    onClick={() => setLinking(session.id)}
                  >
                    {t('tile.claude.link')}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </TileFrame>
  );
}
