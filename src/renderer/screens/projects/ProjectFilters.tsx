/* Die Steuerung der Liste: Bereich, Status, Sortierung, Suche.

   Der Bereich ist ein Segment aus drei Knöpfen mit `aria-pressed` — kein
   Tab-Reiter: er filtert eine Liste, er wechselt keine Ansicht. Status und
   Sortierung sind Felder, weil sie mehr als drei Werte haben.

   Ganz unten steht etwas, das kein Filter ist: der Schalter für den
   Sitzungen-Tab. Er gehört hierher, weil er die Projektansicht einstellt —
   aber er steht nicht in `ProjectFilter`, denn der ist flüchtiger
   Listenzustand, und dieser Schalter überlebt den Neustart. */

import { Button } from '../../atoms/Button';
import { Checkbox } from '../../atoms/Checkbox';
import { Input } from '../../atoms/Input';
import { Select } from '../../atoms/Select';
import { PROJECT_STATUSES } from '@shared/types';
import { useT } from '../../i18n';
import { useOverviewSettings, useSaveOverview } from '../../lib/queries/dashboard';
import { pushToast } from '../../lib/toast';
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
  /* Gelesen und geschrieben wird hier, nicht durchgereicht: sonst trügen
     `ProjectsScreen` und `ProjectList` eine Einstellung, die keiner von beiden
     benutzt. Geschrieben wird über `settings:setVault` — dieselbe Einstellung
     wie überall, also auch nach dem Neustart noch da. */
  const overview = useOverviewSettings();
  const saveOverview = useSaveOverview();
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

      <Checkbox
        label={t('projects.filter.showEmptySessions')}
        checked={overview?.showEmptySessionsTab ?? false}
        /* Solange die Einstellungen fehlen, gibt es nichts umzuschalten — ein
           Häkchen, das den ungelesenen Wert überschriebe, wäre schlimmer. */
        disabled={overview === undefined}
        onChange={(event) =>
          saveOverview.mutate(
            { showEmptySessionsTab: event.target.checked },
            /* Kein stiller Fehlschlag: das Häkchen zeigt weiter den
               gespeicherten Wert, und die Meldung sagt, warum. */
            { onError: () => pushToast('error', 'projects.filter.showEmptySessionsFailed') },
          )
        }
      />
    </div>
  );
}
