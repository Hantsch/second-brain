/* Die Befundliste: Filter, Gruppen nach Art, eine Karte je Befund.

   Getrennt vom Screen, weil das zwei Verantwortungen sind — der Screen hält die
   Schreibwege und ihre Bestätigungen zusammen, hier steht die Ordnung der Liste.

   Zwei Festlegungen:
   - **Die Reihenfolge der Gruppen ist die des Berichts** (der Kern sortiert
     schwerste zuerst). Es gibt keine zweite Sortierung.
   - **Der Widerspruch bekommt seine eigene Karte.** Er ist der einzige Befund, bei
     dem man beide Seiten lesen muss, um zu entscheiden. */

import type { GardenerFinding, GardenerHiddenFinding } from '@shared/types';
import { FindingFilter } from '../../components/FindingFilter';
import { Panel } from '../../components/Panel';
import { useLanguage, useT } from '../../i18n';
import { plural } from '../../lib/format';
import type { DiscardPageResult } from '../../lib/queries/gardener';
import type { SupersedeWrite } from './ContradictionCard';
import type { HiddenState } from './exits';
import { HiddenFindingCard, OpenFindingCard } from './FindingCards';
import type { NearDuplicateSupersedeWrite } from './NearDuplicateCard';
import type { OrphanLinkWrite } from './OrphanCard';
import {
  ALL_FILTERS,
  applyFilter,
  groupByKind,
  isFiltered,
  kindCounts,
  moduleCounts,
  poolForState,
  severityCounts,
  stateCounts,
} from './filter';
import type { FindingFilterState } from './filter';

export interface FindingListProps {
  findings: readonly GardenerFinding[];
  /** Dismissed and still-snoozed findings (017 D4) — carried along instead of
      dropped so the state filter can show them and "show it again" works. */
  hidden: readonly GardenerHiddenFinding[];
  filter: FindingFilterState;
  onFilter: (next: FindingFilterState) => void;
  /** Welcher Befund arbeitet gerade? */
  busyId: string | null;
  onFix: (finding: GardenerFinding) => void;
  onDismiss: (finding: GardenerFinding) => void;
  onSnooze: (finding: GardenerFinding, days: number, until: string) => void;
  onRecheck: (finding: GardenerFinding) => void;
  onOpenPath: (path: string) => void;
  onOpenFile: (path: string) => void;
  onSupersede: (write: SupersedeWrite) => void;
  onSupersedeDuplicate: (write: NearDuplicateSupersedeWrite) => void;
  onDiscarded: (result: DiscardPageResult) => void;
  onLinkOrphan: (write: OrphanLinkWrite) => void;
  /** The way back for a hidden finding — direct, no outcome strip involved. */
  onRestore: (finding: GardenerFinding, state: Exclude<HiddenState, null>) => void;
}

export function FindingList({
  findings,
  hidden,
  filter,
  onFilter,
  busyId,
  onFix,
  onDismiss,
  onSnooze,
  onRecheck,
  onOpenPath,
  onOpenFile,
  onSupersede,
  onSupersedeDuplicate,
  onDiscarded,
  onLinkOrphan,
  onRestore,
}: FindingListProps) {
  const t = useT();
  const language = useLanguage();
  /* The state axis picks the pool first — open, one hidden state, or both —
     the other three axes then filter within it, exactly as before. */
  const pool = poolForState(findings, hidden, filter.state);
  const shown = applyFilter(pool, filter);
  const groups = groupByKind(shown);
  const modules = [...moduleCounts(pool, filter).entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([module, count]) => ({ module, count }));
  const kinds = [...kindCounts(pool, filter).entries()].map(([kind, count]) => ({
    kind,
    count,
  }));
  /* The reason a shown card is hidden — `undefined` for a finding that is
     genuinely open. Keyed by id, not carried on `GardenerFinding` itself. */
  const hiddenById = new Map(hidden.map((entry) => [entry.finding.id, entry]));

  const totalMeta =
    shown.length === pool.length
      ? plural(pool.length, 'garden.findings.totalOne', 'garden.findings.total')
      : t('garden.findings.shown', { shown: shown.length, total: pool.length });
  /* Always the full hidden count, not the state-filtered one: this is what
     makes "everything is hidden" legible even while looking at the open
     (empty) pool. */
  const hiddenMeta =
    hidden.length === 0
      ? null
      : plural(hidden.length, 'garden.findings.hiddenOne', 'garden.findings.hidden');

  return (
    <Panel
      title={t('garden.findings.label')}
      meta={hiddenMeta === null ? totalMeta : `${totalMeta} · ${hiddenMeta}`}
    >
      <FindingFilter
        filter={filter}
        onChange={onFilter}
        kinds={kinds}
        modules={modules}
        severities={severityCounts(pool, filter)}
        states={stateCounts(findings, hidden, filter)}
      />

      {shown.length === 0 ? (
        <div className="sb-panel-empty">
          <p>{t('garden.findings.filtered')}</p>
          {isFiltered(filter) ? (
            <button type="button" className="sb-textlink" onClick={() => onFilter(ALL_FILTERS)}>
              {t('garden.filter.reset')}
            </button>
          ) : null}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.kind} className="sb-ggroup">
            <h3 className="sb-ggroup-title">
              {t(`garden.kind.${group.kind}`)}
              <span className="sb-mono sb-ggroup-count">{group.findings.length}</span>
            </h3>
            <ul className="sb-glist">
              {group.findings.map((finding) => {
                const hiddenEntry = hiddenById.get(finding.id);
                return (
                  <li key={finding.id}>
                    {hiddenEntry !== undefined ? (
                      <HiddenFindingCard
                        finding={finding}
                        entry={hiddenEntry}
                        language={language}
                        busy={busyId === finding.id}
                        onFix={onFix}
                        onDismiss={onDismiss}
                        onSnooze={onSnooze}
                        onRecheck={onRecheck}
                        onOpenPath={onOpenPath}
                        onOpenFile={onOpenFile}
                        onRestore={onRestore}
                      />
                    ) : (
                      <OpenFindingCard
                        finding={finding}
                        busy={busyId === finding.id}
                        onFix={onFix}
                        onDismiss={onDismiss}
                        onSnooze={onSnooze}
                        onRecheck={onRecheck}
                        onOpenPath={onOpenPath}
                        onOpenFile={onOpenFile}
                        onSupersede={onSupersede}
                        onSupersedeDuplicate={onSupersedeDuplicate}
                        onDiscarded={onDiscarded}
                        onLinkOrphan={onLinkOrphan}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </Panel>
  );
}
