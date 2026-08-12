/* D12: the project list — the rows the Claude/Codex switch (`AgentsScreen`,
   D11) leads into. Mirrors `ModuleCards.tsx`'s card-and-button shape, but
   carries six facts instead of three: name, path, session count, last and
   first activity, and — only when known — the linked vault project.

   The list arrives already sorted newest-`lastActivity`-first by
   `aggregateAgentProjects` (src/core/agents/projects.ts); this component
   only renders what it's handed, it never re-sorts.

   A project without a linked vault project shows nothing extra for it —
   guessing one would be exactly the kind of claim guardrail 3 rules out. */

import type { AgentProject } from '@shared/types';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import { useT, useLanguage } from '../../i18n';
import { formatAge, formatDate, plural } from '../../lib/format';

export interface ProjectListProps {
  projects: readonly AgentProject[];
  onOpen: (projectKey: string) => void;
}

export function ProjectList({ projects, onOpen }: ProjectListProps) {
  const t = useT();
  const language = useLanguage();

  return (
    <ul className="sb-agentgrid">
      {projects.map((project) => (
        <li key={project.key}>
          <Card padded={false} interactive className="sb-agentcard">
            <button
              type="button"
              className="sb-agentcard-button"
              aria-label={t('agents.projects.open', { name: project.name })}
              onClick={() => onOpen(project.key)}
            >
              <span className="sb-agentcard-head">
                <Icon name="workflow" size={16} />
                <span className="sb-agentcard-title">{project.name}</span>
              </span>
              <span className="sb-agentcard-path sb-mono" title={project.path}>
                {project.path}
              </span>
              <span className="sb-agentcard-meta sb-mono">
                {plural(
                  project.sessionCount,
                  'agents.projects.sessionsOne',
                  'agents.projects.sessions',
                )}
                {' · '}
                {t('agents.projects.lastActivity', {
                  time: formatAge(project.lastActivity, language),
                })}
              </span>
              <span className="sb-agentcard-meta sb-mono">
                {t('agents.projects.firstActivity', {
                  date: formatDate(project.firstActivity, language),
                })}
              </span>
              {project.vaultProject === null ? null : (
                <span className="sb-agentcard-vault sb-mono">
                  {t('agents.projects.vaultProject', { project: project.vaultProject })}
                </span>
              )}
            </button>
          </Card>
        </li>
      ))}
    </ul>
  );
}
