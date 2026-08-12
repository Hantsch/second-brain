/* Die linke Spalte: Steuerung, Liste, und am Ende die stagnierenden Projekte.

   Stagnierendes bekommt einen eigenen, einklappbaren Abschnitt. Es soll
   sichtbar bleiben — aber nicht zwischen der Arbeit stehen, die läuft.

   Steht der Bereichsfilter auf „Alle", trägt die Liste zwei Überschriften —
   Arbeit und Privat, wie die zwei Todo-Kacheln des Dashboards. Die Trennung der
   Bereiche ist eine Anforderung, kein Filter. */

import { Fragment } from 'react';
import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import type { Project, Scope } from '@shared/types';
import { ProjectCard } from '../../components/ProjectCard';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';
import { ProjectFilters } from './ProjectFilters';
import { scopeRank } from './filter';
import type { ProjectFilter } from './filter';

export interface ProjectListProps {
  current: readonly Project[];
  stalled: readonly Project[];
  selected: string | null;
  filter: ProjectFilter;
  /** Bei „Alle": nach Bereich gruppiert, mit Überschrift je Bereich. */
  grouped: boolean;
  stalledOpen: boolean;
  onFilter: (next: ProjectFilter) => void;
  onSelect: (project: Project) => void;
  onStalledOpen: (open: boolean) => void;
  rowRef: (slug: string, element: HTMLButtonElement | null) => void;
  now?: Date;
}

export function ProjectList({
  current,
  stalled,
  selected,
  filter,
  grouped,
  stalledOpen,
  onFilter,
  onSelect,
  onStalledOpen,
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

      {/* Eine Liste, zwei Überschriften: die Bereichszeile ist ein eigener
          Listeneintrag, damit auch ein Screenreader die Trennung hört. Zwei
          getrennte Listen wären zwei Listen mit einem Namen. */}
      <ul className="sb-projectlist" aria-label={t('projects.list.aria')}>
        {(grouped ? scopeGroups(current) : [{ scope: null, rows: [...current] }]).map((group) => (
          <Fragment key={group.scope ?? 'all'}>
            {group.scope === null ? null : (
              <li className="sb-pgroup-title">{t(`scope.${group.scope}`)}</li>
            )}
            {group.rows.map(row)}
          </Fragment>
        ))}
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

/** Die Bereiche in fester Reihenfolge, leere Bereiche fallen weg. */
function scopeGroups(projects: readonly Project[]): { scope: Scope; rows: Project[] }[] {
  const scopes = [...new Set(projects.map((project) => project.scope))].sort(
    (a, b) => scopeRank(a) - scopeRank(b),
  );
  return scopes.map((scope) => ({
    scope,
    rows: projects.filter((project) => project.scope === scope),
  }));
}
