/* What's running: active projects with next step and deadline.

   The source is the index's project list, filtered to `active` and sorted
   by priority and most recent trail. `waiting` is not shown here: that's
   what the "Waiting on" tile is for, and showing a project in two places
   makes the list longer, not clearer. */

import { useNavigate } from 'react-router-dom';
import type { Project } from '@shared/types';
import { useT } from '../../i18n';
import { useProjects } from '../../lib/queries/data';
import { DeadlineChip } from '../DeadlineChip';
import { TileFrame } from '../TileFrame';

const LIMIT = 4;

/** Most important first: priority, then most recent trail. */
function byPriority(a: Project, b: Project): number {
  return a.priority - b.priority || (a.lastTouch < b.lastTouch ? 1 : -1);
}

export function ActiveProjectsTile() {
  const t = useT();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useProjects();
  const active = (data ?? []).filter((project) => project.status === 'active');
  const rows = [...active].sort(byPriority).slice(0, LIMIT);

  return (
    <TileFrame
      id="active-projects"
      title={t('module.active-projects.name')}
      count={active.length > 0 ? active.length : null}
      pending={isPending}
      error={error}
      onRetry={() => void refetch()}
      isEmpty={rows.length === 0}
      empty={{
        body: t('tile.active.empty'),
        action: { label: t('tile.projects.all'), onClick: () => void navigate('/projects') },
      }}
      foot={
        active.length > LIMIT ? (
          <button type="button" className="sb-textlink" onClick={() => void navigate('/projects')}>
            {t('common.showAll', { count: active.length })}
          </button>
        ) : undefined
      }
    >
      <ul className="sb-lines">
        {rows.map((project) => (
          <li key={project.slug} className="sb-line">
            <button
              type="button"
              className="sb-line-open"
              title={t('tile.project.open', { title: project.title })}
              onClick={() => void navigate(`/projects?p=${encodeURIComponent(project.slug)}`)}
            >
              {project.title}
            </button>
            <span
              className={`sb-line-detail${project.nextStep === null ? ' sb-line-missing' : ''}`}
            >
              {project.nextStep ?? t('projects.noNextStep')}
            </span>
            <span className="sb-line-meta">
              <DeadlineChip date={project.deadline} />
            </span>
          </li>
        ))}
      </ul>
    </TileFrame>
  );
}
