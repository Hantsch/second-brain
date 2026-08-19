/* Die linke Spalte: Steuerung, Liste, und am Ende die stagnierenden Projekte.

   Stagnierendes bekommt einen eigenen, einklappbaren Abschnitt. Es soll
   sichtbar bleiben — aber nicht zwischen der Arbeit stehen, die läuft.

   Eine einzige Liste, kein Bereichs-Absatz mehr: Arbeit und Privat werden
   ausschließlich vom Bereichsfilter getrennt, nicht durch eine Überschrift in
   der Liste selbst. Stattdessen sortiert die Liste nach Aufmerksamkeit — die
   zuletzt berührte Zeile zuerst, dann die markierten Projekte (`filter.ts`
   erklärt das genauer). Das ist die dokumentierte Ausnahme von der sonst
   strikten Bereichstrennung (VAULT-FORMAT.md). */

import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import type { Project } from '@shared/types';
import { ProjectCard } from '../../components/ProjectCard';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';
import { ProjectFilters } from './ProjectFilters';
import type { ProjectFilter } from './filter';

export interface ProjectListProps {
  current: readonly Project[];
  stalled: readonly Project[];
  selected: string | null;
  filter: ProjectFilter;
  /** Slug der obersten Zeile unter der Sortierung „Zuletzt berührt" — sonst
      `null`. Markiert genau diese Zeile als Wiedereinstiegspunkt. */
  latest: string | null;
  stalledOpen: boolean;
  onFilter: (next: ProjectFilter) => void;
  onSelect: (project: Project) => void;
  onStalledOpen: (open: boolean) => void;
  onToggleFavorite: (project: Project) => void;
  rowRef: (slug: string, element: HTMLButtonElement | null) => void;
  now?: Date;
}

export function ProjectList({
  current,
  stalled,
  selected,
  filter,
  latest,
  stalledOpen,
  onFilter,
  onSelect,
  onStalledOpen,
  onToggleFavorite,
  rowRef,
  now,
}: ProjectListProps) {
  const t = useT();
  const total = current.length + stalled.length;

  const row = (project: Project) => (
    <ProjectCard
      key={project.path}
      project={project}
      active={project.slug === selected}
      onSelect={() => onSelect(project)}
      latest={project.slug === latest}
      onToggleFavorite={() => onToggleFavorite(project)}
      buttonRef={(element) => rowRef(project.slug, element)}
      {...(now === undefined ? {} : { now })}
    />
  );

  return (
    <div className="sb-plist">
      <ProjectFilters filter={filter} onChange={onFilter} />

      <p className="sb-plist-count sb-mono">
        {plural(total, 'projects.countOne', 'projects.count')}
      </p>

      {total === 0 ? (
        <p className="sb-panel-empty">
          {filter.query.trim().length > 0
            ? t('projects.searchEmpty', { query: filter.query.trim() })
            : t('projects.filterEmpty')}
        </p>
      ) : null}

      <ul className="sb-projectlist" aria-label={t('projects.list.aria')}>
        {current.map(row)}
      </ul>

      {stalled.length === 0 ? null : (
        <div className="sb-stalled">
          <Button
            variant="ghost"
            size="sm"
            className="sb-stalled-toggle"
            aria-expanded={stalledOpen}
            onClick={() => onStalledOpen(!stalledOpen)}
          >
            <Icon name={stalledOpen ? 'chevron-down' : 'chevron-right'} size={14} />
            {t('projects.stalled.title', { count: stalled.length })}
          </Button>
          {stalledOpen ? (
            <ul
              className="sb-projectlist"
              aria-label={t('projects.stalled.title', { count: stalled.length })}
            >
              {stalled.map(row)}
            </ul>
          ) : null}
        </div>
      )}

      <p className="sb-plist-keys">{t('projects.keys')}</p>
    </div>
  );
}
