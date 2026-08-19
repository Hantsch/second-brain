/* A project row in the list: scope, title, status, open todos, deadline,
   age.

   The next step is deliberately **not** shown here: it's the large line in
   the detail view. In the list it would be the same sentence twice and
   would take up the space the numbers need.

   The status dot is color **and** word. Whoever can't distinguish the
   color still reads the status. */

import type { Project } from '@shared/types';
import { Icon } from '../atoms/Icon';
import { useLanguage, useT } from '../i18n';
import { formatAge } from '../lib/format';
import { DeadlineChip } from './DeadlineChip';

/* The dot uses the shared tones from shell.css; without a tone it stays gray. */
const DOT_TONE: Record<Project['status'], string> = {
  idea: '',
  active: 'sb-dot--ok',
  waiting: 'sb-dot--warn',
  paused: '',
  done: 'sb-dot--busy',
  dropped: '',
};

export interface ProjectCardProps {
  project: Project;
  active: boolean;
  onSelect: () => void;
  /** Whether this is the top row under the default sort — the "last worked
      on" re-entry point. Computed by the caller against `visibleProjects`'s
      `latest`, not here. */
  latest: boolean;
  onToggleFavorite: () => void;
  /** For the keyboard path: the row must be able to accept focus. */
  buttonRef?: (element: HTMLButtonElement | null) => void;
  now?: Date;
}

export function ProjectCard({
  project,
  active,
  onSelect,
  latest,
  onToggleFavorite,
  buttonRef,
  now,
}: ProjectCardProps) {
  const t = useT();
  const language = useLanguage();
  const waiting = project.waitingOn.filter((entry) => entry.resolved !== true);

  return (
    <li className="sb-projectitem-wrap">
      <button
        type="button"
        ref={buttonRef}
        className={`sb-projectitem${active ? ' sb-projectitem--active' : ''}`}
        aria-current={active}
        onClick={onSelect}
      >
        <span className="sb-projectitem-head">
          <span className={`sb-dot ${DOT_TONE[project.status]}`.trim()} aria-hidden="true" />
          <span className="sb-projectitem-title">{project.title}</span>
          <span className="sb-projectitem-count sb-mono">
            {t('projects.openTodos', { count: project.openTodoCount })}
          </span>
        </span>
        <span className="sb-projectitem-meta">
          {/* The scope is shown on the row, not only in the heading above
              it: whoever looks at a single card (search, jump from outside)
              should know without scrolling whether it's work or private.
              Calm, no color accent. */}
          <span className="sb-projectitem-scope">{t(`scope.${project.scope}`)}</span>
          <span className="sb-projectitem-status">{t(`project.status.${project.status}`)}</span>
          <DeadlineChip date={project.deadline} {...(now === undefined ? {} : { now })} />
          <span className="sb-projectitem-age">
            <Icon name="history" size={11} />
            {formatAge(project.lastTouch, language, now)}
          </span>
          {waiting.length > 0 ? (
            <span className="sb-projectitem-wait">
              <Icon name="users" size={11} />
              {t('projects.waitingMark')}
            </span>
          ) : null}
          {latest ? (
            <span className="sb-projectitem-latest">{t('projects.lastWorkedOn')}</span>
          ) : null}
          {project.stale ? (
            <span className="sb-projectitem-stale">{t('projects.stale')}</span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        className={`sb-projectitem-star${project.favorite ? ' sb-projectitem-star--on' : ''}`}
        aria-pressed={project.favorite}
        aria-label={t(project.favorite ? 'projects.favorite.remove' : 'projects.favorite.add', {
          title: project.title,
        })}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite();
        }}
      >
        <Icon name="star" size={14} />
      </button>
    </li>
  );
}
