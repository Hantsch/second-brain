/* Der Filter der Befundliste: Art, Modul, Schwere, Zustand — jede Wahl mit
   ihrer Zahl.

   Die Zahlen stehen in den Auswahllisten, weil eine Wahl ohne Zahl eine Wahl ins
   Dunkle ist: „Kaputte Wikilinks (0)" spart den Klick. Gerechnet wird in
   `screens/garden/filter.ts`, jeweils ohne den eigenen Filter — sonst stünde
   überall (0), sobald etwas gewählt ist.

   Vier Felder und kein Segment: jede Achse hat mehr als drei Werte, und der
   Modul-Filter wächst mit dem Vault. */

import type { FindingSeverity, GardenerFindingKind } from '@shared/types';
import { Button } from '../atoms/Button';
import { Select } from '../atoms/Select';
import { useT } from '../i18n';
import type { FindingFilterState, FindingStateFilter } from '../screens/garden/filter';
import { ALL_FILTERS, isFiltered } from '../screens/garden/filter';

/** Schwere von schwer nach leicht — dieselbe Reihenfolge wie im Kern. */
const SEVERITIES: readonly FindingSeverity[] = ['high', 'warn', 'info'];

/** Zustand, in der Reihenfolge, in der die Story sie nennt — offen zuerst.
    `all` teilt sich den Text mit den anderen Achsen: „Alle" heißt dort wie
    hier dasselbe. */
const STATE_LABEL: Record<FindingStateFilter, string> = {
  open: 'garden.filter.stateOpen',
  dismissed: 'garden.filter.stateDismissed',
  snoozed: 'garden.filter.stateSnoozed',
  all: 'garden.filter.all',
};
const STATES: readonly FindingStateFilter[] = ['open', 'dismissed', 'snoozed', 'all'];

export interface FindingFilterProps {
  filter: FindingFilterState;
  onChange: (next: FindingFilterState) => void;
  /** Arten mit ihrer Zahl, schwerste zuerst. */
  kinds: readonly { kind: GardenerFindingKind; count: number }[];
  /** Module mit ihrer Zahl; `'none'` steht für Befunde ohne Modul. */
  modules: readonly { module: string; count: number }[];
  severities: ReadonlyMap<FindingSeverity, number>;
  /** Wie viele Befunde je Zustand — offen, weggelegt (je Art), oder alle. */
  states: ReadonlyMap<FindingStateFilter, number>;
}

export function FindingFilter({
  filter,
  onChange,
  kinds,
  modules,
  severities,
  states,
}: FindingFilterProps) {
  const t = useT();
  const total = kinds.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="sb-gfilter" role="group" aria-label={t('garden.filter.label')}>
      <Select
        label={t('garden.filter.kind')}
        value={filter.kind}
        options={[
          { value: 'all', label: `${t('garden.filter.all')} (${total})` },
          ...kinds.map((entry) => ({
            value: entry.kind,
            label: `${t(`garden.kind.${entry.kind}`)} (${entry.count})`,
          })),
        ]}
        onChange={(event) =>
          onChange({ ...filter, kind: event.target.value as FindingFilterState['kind'] })
        }
      />
      {modules.length === 0 ? null : (
        <Select
          label={t('garden.filter.module')}
          value={filter.module}
          options={[
            { value: 'all', label: t('garden.filter.all') },
            ...modules.map((entry) => ({
              value: entry.module,
              label:
                entry.module === 'none'
                  ? `${t('garden.filter.noModule')} (${entry.count})`
                  : `${entry.module} (${entry.count})`,
            })),
          ]}
          onChange={(event) => onChange({ ...filter, module: event.target.value })}
        />
      )}
      <Select
        label={t('garden.filter.severity')}
        value={filter.severity}
        options={[
          { value: 'all', label: t('garden.filter.all') },
          ...SEVERITIES.filter((severity) => (severities.get(severity) ?? 0) > 0).map(
            (severity) => ({
              value: severity,
              label: `${t(`garden.severity.${severity}`)} (${severities.get(severity) ?? 0})`,
            }),
          ),
        ]}
        onChange={(event) =>
          onChange({ ...filter, severity: event.target.value as FindingFilterState['severity'] })
        }
      />
      <Select
        label={t('garden.filter.state')}
        value={filter.state}
        options={STATES.map((state) => ({
          value: state,
          label: `${t(STATE_LABEL[state])} (${states.get(state) ?? 0})`,
        }))}
        onChange={(event) =>
          onChange({ ...filter, state: event.target.value as FindingFilterState['state'] })
        }
      />
      {isFiltered(filter) ? (
        <Button size="sm" variant="ghost" icon="x" onClick={() => onChange(ALL_FILTERS)}>
          {t('garden.filter.reset')}
        </Button>
      ) : null}
    </div>
  );
}
