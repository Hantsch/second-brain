/* D13: the project detail — a project's sessions, the level between the
   project list (D12) and a single transcript (D14). Mirrors `ProjectList`'s
   card-and-button shape (same `sb-agentgrid`/`sb-agentcard-*` classes): the
   screen keeps one visual language throughout, only the facts per card
   change.

   The list arrives already sorted newest-first from `agents:sessions`
   (`AgentsScreen` owns the query); this component only renders what it's
   handed, it never re-sorts — same contract as `ProjectList`.

   The header carries the vault link (AC8): a known one is stated, a missing
   one is offered as an action. The picker itself arrives as `link` from the
   caller — this component stays a pure view and asks nothing of the main
   process, same as `ProjectList`.

   Every fact that the trail may not record (`durationMs`, `gitBranch`,
   `model`, `subagents`, `contextTokens`) is null-checked individually and
   rendered as an honest "unknown" — guardrail 3, and the exact wording of
   this deliverable's acceptance criterion. `subagents: []` is kept visually
   distinct from `subagents: null`: an empty array is a recorded fact (no
   subagent ran), null means the format never captured the field at all — the
   first renders an explicit zero, the second renders "unknown". Collapsing
   either into the other would silently turn "the trail doesn't know" into a
   number, or a real zero into a shrug. */

import type { ReactNode } from 'react';
import type { AgentProject, AgentSessionSummary } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import { useT, useLanguage } from '../../i18n';
import { formatAge, formatDate, formatDuration, formatNumber, plural } from '../../lib/format';

export interface ProjectDetailProps {
  /** The project this session list belongs to — for the header context. */
  project: AgentProject;
  /** Already fetched by the caller, newest first; this component never re-sorts. */
  sessions: readonly AgentSessionSummary[];
  /**
   * The way to link this project to a vault project, shown in the header while
   * `project.vaultProject` is null (AC8). A slot, not a query: who writes stays
   * outside this view.
   */
  link: ReactNode;
  onBack: () => void;
  onOpenSession: (sessionId: string) => void;
}

export function ProjectDetail({
  project,
  sessions,
  link,
  onBack,
  onOpenSession,
}: ProjectDetailProps) {
  const t = useT();
  const language = useLanguage();

  return (
    <div className="sb-projectdetail">
      <div className="sb-projectdetail-head">
        <Button variant="ghost" size="sm" icon="chevron-left" onClick={onBack}>
          {t('agents.detail.back')}
        </Button>
        <div className="sb-projectdetail-title">
          <span className="sb-projectdetail-name">{project.name}</span>
          <span className="sb-projectdetail-path sb-mono" title={project.path}>
            {project.path}
          </span>
          <span className="sb-projectdetail-meta sb-mono">
            {plural(sessions.length, 'agents.projects.sessionsOne', 'agents.projects.sessions')}
          </span>
          <span className="sb-projectdetail-link">
            {project.vaultProject === null ? (
              link
            ) : (
              <span className="sb-projectdetail-meta sb-mono">
                {t('agents.projects.vaultProject', { project: project.vaultProject })}
              </span>
            )}
          </span>
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="sb-panel-empty">{t('agents.sessions.empty')}</p>
      ) : (
        <ul className="sb-agentgrid">
          {sessions.map((session) => (
            <li key={session.id}>
              <Card padded={false} interactive className="sb-agentcard">
                <button
                  type="button"
                  className="sb-agentcard-button"
                  aria-label={t('agents.sessions.open', {
                    title:
                      session.title !== null && session.title.length > 0
                        ? session.title
                        : formatDate(session.startedAt, language),
                  })}
                  onClick={() => onOpenSession(session.id)}
                >
                  <span className="sb-agentcard-head">
                    <Icon name="message-square" size={16} />
                    <span className="sb-agentcard-title">
                      {session.title !== null && session.title.length > 0
                        ? session.title
                        : formatDate(session.startedAt, language)}
                    </span>
                  </span>
                  {/* Start and last activity sit on one line: they are the same
                      kind of fact, and two lines for them would push every
                      other fact further down for nothing. */}
                  <span className="sb-agentcard-path sb-mono">
                    {t('agents.sessions.start', { time: formatAge(session.startedAt, language) })}
                    {' · '}
                    {t('agents.sessions.lastActivity', {
                      time: formatAge(session.lastActivity, language),
                    })}
                  </span>
                  <span className="sb-agentcard-meta sb-mono">
                    {session.durationMs === null
                      ? t('agents.sessions.durationUnknown')
                      : t('agents.sessions.duration', {
                          duration: formatDuration(session.durationMs),
                        })}
                    {' · '}
                    {t('agents.sessions.messages', { count: session.messageCount })}
                  </span>
                  <span className="sb-agentcard-meta sb-mono">
                    {session.gitBranch === null
                      ? t('agents.sessions.branchUnknown')
                      : t('agents.sessions.branch', { branch: session.gitBranch })}
                    {' · '}
                    {session.model === null
                      ? t('agents.sessions.modelUnknown')
                      : t('agents.sessions.model', { model: session.model })}
                  </span>
                  <span className="sb-agentcard-meta sb-mono">
                    {session.subagents === null
                      ? t('agents.sessions.subagentsUnknown')
                      : session.subagents.length === 0
                        ? t('agents.sessions.subagentsNone')
                        : `${plural(session.subagents.length, 'agents.sessions.subagentsOne', 'agents.sessions.subagents')} · ${session.subagents.join(', ')}`}
                  </span>
                  <span className="sb-agentcard-meta sb-mono">
                    {session.contextTokens === null
                      ? t('agents.sessions.contextUnknown')
                      : t('agents.sessions.context', {
                          count: formatNumber(session.contextTokens, language),
                        })}
                  </span>
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
