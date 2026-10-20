/* D12: the project list — the rows the Claude/Codex switch (`AllSessionsScreen`,
   D11) leads into. Mirrors `ModuleCards.tsx`'s card-and-button shape, but
   carries six facts instead of three: name, path, session count, last and
   first activity, and — only when known — the linked vault project.

   The list arrives already sorted newest-`lastActivity`-first by
   `aggregateAgentProjects` (src/core/agents/projects.ts); this component
   only renders what it's handed, it never re-sorts.

   A project without a linked vault project shows nothing extra for it —
   guessing one would be exactly the kind of claim guardrail 3 rules out.

   Story 008 adds dismissal on top, and it stays a pure view: the dismissed
   keys arrive as a prop and every dismiss goes back out as a callback — the
   host owns the preference, this component owns only the local "show all"
   toggle. A host that hands over none of the three props gets exactly the
   list D12 built. */

import { useState } from 'react';
import type { AgentProject } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import { IconButton } from '../../atoms/IconButton';
import { useT, useLanguage } from '../../i18n';
import { formatAge, formatDate, plural } from '../../lib/format';

/**
 * The key one dismissal is stored under: agent kind plus project key, e.g.
 * `claude:c:/repos/second-brain`. Two agents can see the same working
 * directory, and dismissing it for one of them says nothing about the other.
 */
export function dismissalKey(project: AgentProject): string {
  return `${project.agent}:${project.key}`;
}

export interface ProjectListProps {
  projects: readonly AgentProject[];
  onOpen: (projectKey: string) => void;
  /** Dismissal keys the host has stored, see `dismissalKey`. */
  dismissed?: readonly string[];
  /** Hide a project. Omitted where dismissal doesn't apply — no control then. */
  onDismiss?: (key: string) => void;
  /** Bring a dismissed project back for good. */
  onUndismiss?: (key: string) => void;
}

export function ProjectList({
  projects,
  onOpen,
  dismissed,
  onDismiss,
  onUndismiss,
}: ProjectListProps) {
  const t = useT();
  const language = useLanguage();
  /* Local, deliberately not persisted: "show all" is a look at what's
     hidden, not a change to what's hidden. */
  const [showAll, setShowAll] = useState(false);

  const keys = dismissed ?? [];
  /* A linked project is never hidden, even with a stale key in the setting:
     it belongs to a vault project and must not be able to vanish from it. */
  const isDismissed = (project: AgentProject): boolean =>
    project.vaultProject === null && keys.includes(dismissalKey(project));

  const hiddenCount = projects.filter(isDismissed).length;
  const shown = showAll ? projects : projects.filter((project) => !isDismissed(project));

  return (
    <>
      <ul className="sb-agentgrid">
        {shown.map((project) => {
          const hidden = isDismissed(project);
          const dismissable = project.vaultProject === null;
          return (
            <li key={project.key}>
              <Card
                padded={false}
                interactive
                className={`sb-agentcard${dismissable ? ' sb-agentcard--dismissable' : ''}`}
              >
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
                  {hidden ? (
                    <span className="sb-agentcard-marker sb-mono">
                      {t('agents.dismiss.marker')}
                    </span>
                  ) : null}
                </button>
                {/* Sibling of the card button, never inside it: a button in a
                    button is broken for keyboard and screen reader alike. */}
                {hidden && onUndismiss !== undefined ? (
                  <IconButton
                    icon="eye"
                    size="sm"
                    className="sb-agentcard-dismiss"
                    label={t('agents.dismiss.undo', { name: project.name })}
                    onClick={() => onUndismiss(dismissalKey(project))}
                  />
                ) : dismissable && onDismiss !== undefined ? (
                  <IconButton
                    icon="eye-off"
                    size="sm"
                    className="sb-agentcard-dismiss"
                    label={t('agents.dismiss.action', { name: project.name })}
                    onClick={() => onDismiss(dismissalKey(project))}
                  />
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
      {/* Nothing is hidden silently: the list says how many it is holding
          back and offers the way to look at them — including the case where
          that leaves the grid empty, which is "hidden", not "none". */}
      {hiddenCount === 0 ? null : (
        <div className="sb-agentdismissed">
          <Icon name="eye-off" size={14} />
          <span className="sb-agentdismissed-text sb-mono">
            {plural(hiddenCount, 'agents.dismiss.hiddenOne', 'agents.dismiss.hidden')}
          </span>
          {shown.length === 0 ? (
            <span className="sb-agentdismissed-text">{t('agents.dismiss.allHidden')}</span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            icon={showAll ? 'eye-off' : 'eye'}
            onClick={() => setShowAll(!showAll)}
          >
            {t(showAll ? 'agents.dismiss.hideAgain' : 'agents.dismiss.showAll')}
          </Button>
        </div>
      )}
    </>
  );
}
