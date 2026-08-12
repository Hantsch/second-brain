/* Was läuft: aktive Projekte mit nächstem Schritt und Frist.

   Quelle ist die Projektliste des Index, gefiltert auf `active` und nach
   Priorität und jüngster Spur sortiert. `waiting` steht hier nicht: darauf wartet
   die Kachel „Warte auf", und ein Projekt an zwei Stellen zu zeigen macht die
   Liste länger, nicht klarer. */

import { useNavigate } from 'react-router-dom';
import type { Project } from '@shared/types';
import { useT } from '../../i18n';
import { useProjects } from '../../lib/queries/data';
import { DeadlineChip } from '../DeadlineChip';
import { TileFrame } from '../TileFrame';

const LIMIT = 4;

/** Wichtigstes zuerst: Priorität, dann jüngste Spur. */
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
