/* Projekte, die liegen. Mit der Zahl der Tage und dem nächsten Schritt — oder
   dem Hinweis, dass keiner festgelegt ist.

   Die Slugs kommen aus `dashboard:data` (dort ist die Schwelle aus den
   Einstellungen schon angewandt), Titel und nächster Schritt aus der Projektliste.
   Fehlt der nächste Schritt, steht das da: er ist der Wiedereinstiegspunkt, und
   sein Fehlen ist der Grund, warum ein Projekt liegen bleibt. */

import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { useProjects } from '../../lib/queries/data';
import { useDashboardData } from '../../lib/queries/dashboard';
import { TileFrame } from '../TileFrame';

const LIMIT = 6;

export function StaleProjectsTile() {
  const t = useT();
  const navigate = useNavigate();
  const dashboard = useDashboardData();
  const projects = useProjects();

  const slugs = dashboard.data?.staleProjects ?? [];
  const rows = slugs
    .map((slug) => projects.data?.find((project) => project.slug === slug))
    .filter((project): project is NonNullable<typeof project> => project !== undefined)
    .slice(0, LIMIT);

  return (
    <TileFrame
      id="stale-projects"
      title={t('module.stale-projects.name')}
      count={slugs.length > 0 ? slugs.length : null}
      pending={dashboard.isPending || projects.isPending}
      error={dashboard.error}
      onRetry={() => void dashboard.refetch()}
      isEmpty={rows.length === 0}
      empty={{
        body: t('tile.stale.empty'),
        action: { label: t('tile.projects.all'), onClick: () => void navigate('/projects') },
      }}
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
            <span className="sb-line-meta">{t('tile.stale.days', { count: project.ageDays })}</span>
          </li>
        ))}
      </ul>
    </TileFrame>
  );
}
