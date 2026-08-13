/* Die Steuerung der Liste: Bereich, Status, Sortierung, Suche.

   Der Bereich ist ein Segment aus drei Knöpfen mit `aria-pressed` — kein
   Tab-Reiter: er filtert eine Liste, er wechselt keine Ansicht. Status und
   Sortierung sind Felder, weil sie mehr als drei Werte haben. */

import { Button } from '../../atoms/Button';
import { Input } from '../../atoms/Input';
import { Select } from '../../atoms/Select';
import { PROJECT_STATUSES } from '@shared/types';
import { useT } from '../../i18n';
import { PROJECT_SORTS } from './filter';
import type { ProjectFilter, ProjectSort, ScopeFilter, StatusFilter } from './filter';

const SCOPE_CHOICES: readonly ScopeFilter[] = ['work', 'private', 'all'];

function scopeLabel(scope: ScopeFilter): string {
  return scope === 'all' ? 'projects.scope.all' : `scope.${scope}`;
}

export interface ProjectFiltersProps {
  filter: ProjectFilter;
  onChange: (next: ProjectFilter) => void;
}

export function ProjectFilters({ filter, onChange }: ProjectFiltersProps) {
  const t = useT();
  return (
    <div className="sb-pfilters">
      <div className="sb-segment" role="group" aria-label={t('projects.filter.scope')}>
        {SCOPE_CHOICES.map((scope) => (
          <Button
            key={scope}
            size="sm"
            variant={filter.scope === scope ? 'secondary' : 'ghost'}
            aria-pressed={filter.scope === scope}
            onClick={() => onChange({ ...filter, scope })}
          >
            {t(scopeLabel(scope))}
          </Button>
        ))}
      </div>

      <Input
        className="sb-pfilters-search"
        icon="search"
        label={t('projects.search')}
        value={filter.query}
        onChange={(event) => onChange({ ...filter, query: event.target.value })}
      />

      <div className="sb-pfilters-row">
        <Select
          label={t('projects.filter.status')}
          value={filter.status}
          options={[
            { value: 'all', label: t('projects.filter.statusAll') },
            { value: 'open', label: t('projects.filter.statusOpen') },
            ...PROJECT_STATUSES.map((status) => ({
              value: status,
              label: t(`project.status.${status}`),
            })),
          ]}
          onChange={(event) => onChange({ ...filter, status: event.target.value as StatusFilter })}
        />
        <Select
          label={t('projects.filter.sort')}
          value={filter.sort}
          options={PROJECT_SORTS.map((sort) => ({
            value: sort,
            label: t(`projects.sort.${sort}`),
          }))}
          onChange={(event) => onChange({ ...filter, sort: event.target.value as ProjectSort })}
        />
      </div>
    </div>
  );
}
