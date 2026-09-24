/* Scope and type-group filter chips for the full search result view (059,
   D5). Ten raw `DocType`s would be noise in a chip row — `TYPE_GROUPS` is the
   six user-facing groups the story names, each mapping to the `DocType`s
   `SearchQuery.types` actually filters on. Reuses `.sb-chip` (ask.css) rather
   than inventing new chip markup, same as the command palette's mode chips. */

import type { DocType, Scope } from '@shared/types';
import { useT } from '../../i18n';

export type TypeGroup = 'journal' | 'projects' | 'areas' | 'knowledge' | 'notes' | 'condensed';

/** The one mapping between a user-facing group and the raw `DocType`s it
    stands for — every `DocType` appears in exactly one group. */
export const TYPE_GROUPS: Record<TypeGroup, readonly DocType[]> = {
  journal: ['journal'],
  projects: ['project'],
  areas: ['area'],
  knowledge: ['source', 'entity', 'concept', 'overview'],
  notes: ['note', 'dump'],
  condensed: ['condensed'],
};

/** Chip order — journal/projects/areas/knowledge/notes/condensed, the same
    order the story's own Decisions list names them in. */
const GROUP_ORDER: readonly TypeGroup[] = [
  'journal',
  'projects',
  'areas',
  'knowledge',
  'notes',
  'condensed',
];

const SCOPE_ORDER: readonly Scope[] = ['work', 'private'];

export interface SearchFiltersProps {
  scope: Scope | null;
  onScopeChange: (scope: Scope | null) => void;
  group: TypeGroup | null;
  onGroupChange: (group: TypeGroup | null) => void;
}

interface ChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

function Chip({ active, label, onClick }: ChipProps) {
  return (
    <button
      type="button"
      className={`sb-chip${active ? ' sb-chip--active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function SearchFilters({ scope, onScopeChange, group, onGroupChange }: SearchFiltersProps) {
  const t = useT();
  return (
    <div className="sb-searchfilters">
      <div
        className="sb-searchfilters-row"
        role="group"
        aria-label={t('search.filter.scope.label')}
      >
        <Chip
          active={scope === null}
          label={t('search.filter.all')}
          onClick={() => onScopeChange(null)}
        />
        {SCOPE_ORDER.map((value) => (
          <Chip
            key={value}
            active={scope === value}
            label={t(`scope.${value}`)}
            onClick={() => onScopeChange(value)}
          />
        ))}
      </div>
      <div className="sb-searchfilters-row" role="group" aria-label={t('search.filter.type.label')}>
        <Chip
          active={group === null}
          label={t('search.filter.all')}
          onClick={() => onGroupChange(null)}
        />
        {GROUP_ORDER.map((value) => (
          <Chip
            key={value}
            active={group === value}
            label={t(`search.filter.type.${value}`)}
            onClick={() => onGroupChange(value)}
          />
        ))}
      </div>
    </div>
  );
}
