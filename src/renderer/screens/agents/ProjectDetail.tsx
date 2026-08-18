/* D13: the project detail — a project's sessions, the level between the
   project list (D12) and a single transcript (D14). Mirrors `ProjectList`'s
   card-and-button shape (same `sb-agentgrid`/`sb-agentcard-*` classes): the
   screen keeps one visual language throughout, only the facts per card
   change.

   The list arrives already sorted newest-first from `agents:sessions`
   (the hosting screen owns the query); this component only renders what it's
   handed, it never re-sorts — same contract as `ProjectList`.

   The header carries the vault link (AC8): a known one is stated, a missing
   one is offered as an action. The picker itself arrives as `link` from the
   caller — this component stays a pure view and asks nothing of the main
   process, same as `ProjectList`.

   The cards themselves live in `SessionList`: since story 008 the Sessions
   tab of a vault project lists sessions too, and one card shape for both is
   the only way the two stay the same thing. */

import type { ReactNode } from 'react';
import type { AgentProject, AgentSessionSummary } from '@shared/types';
import { Button } from '../../atoms/Button';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';
import { SessionList } from './SessionList';

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
        <SessionList sessions={sessions} onOpen={onOpenSession} />
      )}
    </div>
  );
}
