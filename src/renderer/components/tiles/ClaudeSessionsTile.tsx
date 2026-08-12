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
import type { ClaudeSession } from '@shared/types';
import { useT } from '../../i18n';
import { useProjects } from '../../lib/queries/data';
import {
  useClaudeSessions,
  useLinkSession,
  useOverviewSettings,
} from '../../lib/queries/dashboard';
import { useProjectMutations } from '../../lib/queries/projects';
import { pushToast } from '../../lib/toast';
import { RelativeTime } from '../RelativeTime';
import { TileFrame } from '../TileFrame';
import { SessionLink } from './SessionLink';

const LIMIT = 6;

export function ClaudeSessionsTile() {
  const t = useT();
  const navigate = useNavigate();
  const overview = useOverviewSettings();
  const sessions = useClaudeSessions();
  const projects = useProjects();
  const link = useLinkSession();
  const { patch } = useProjectMutations();
  const [linking, setLinking] = useState<string | null>(null);
  const off = overview !== undefined && !overview.useClaudeSessions;
  const rows: ClaudeSession[] = off ? [] : (sessions.data ?? []).slice(0, LIMIT);

  /* The state of `repos` **before** the write is the undo. It's captured
     here before the queries re-run. */
  const linkTo = (session: ClaudeSession, slug: string): void => {
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

  return (
    <TileFrame
      id="claude-sessions"
      title={t('module.claude-sessions.name')}
      pending={!off && sessions.isPending}
      error={sessions.error ?? link.error ?? patch.error}
      onRetry={() => void sessions.refetch()}
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
        <button type="button" className="sb-textlink" onClick={() => void navigate('/agents')}>
          {t('tile.claude.openBrowser')}
        </button>
      }
    >
      <ul className="sb-lines">
        {rows.map((session) => (
          <li key={session.id} className="sb-line sb-line--stack">
            <span className="sb-line-top">
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
            {session.firstPrompt.length === 0 ? null : (
              <span className="sb-line-detail" title={session.firstPrompt}>
                {session.firstPrompt}
              </span>
            )}
            <span className="sb-line-bottom">
              <span className="sb-line-count">
                {t('tile.claude.messages', { count: session.messageCount })}
              </span>
              {session.vaultProject !== null ? null : linking === session.id ? (
                <SessionLink
                  name={session.projectName}
                  projects={projects.data ?? []}
                  onPick={(slug) => {
                    setLinking(null);
                    linkTo(session, slug);
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
        ))}
      </ul>
    </TileFrame>
  );
}
