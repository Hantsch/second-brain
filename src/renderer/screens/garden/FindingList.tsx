/* Die Befundliste: Filter, Gruppen nach Art, eine Karte je Befund.

   Getrennt vom Screen, weil das zwei Verantwortungen sind — der Screen hält die
   Schreibwege und ihre Bestätigungen zusammen, hier steht die Ordnung der Liste.

   Zwei Festlegungen:
   - **Die Reihenfolge der Gruppen ist die des Berichts** (der Kern sortiert
     schwerste zuerst). Es gibt keine zweite Sortierung.
   - **Der Widerspruch bekommt seine eigene Karte.** Er ist der einzige Befund, bei
     dem man beide Seiten lesen muss, um zu entscheiden. */

import type { GardenerFinding } from '@shared/types';
import { FindingCard } from '../../components/FindingCard';
import { FindingFilter } from '../../components/FindingFilter';
import { Panel } from '../../components/Panel';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';
import type { DiscardPageResult } from '../../lib/queries/gardener';
import { ContradictionCard } from './ContradictionCard';
import type { SupersedeWrite } from './ContradictionCard';
import { NearDuplicateCard } from './NearDuplicateCard';
import type { NearDuplicateSupersedeWrite } from './NearDuplicateCard';
import {
  ALL_FILTERS,
  applyFilter,
  groupByKind,
  isFiltered,
  kindCounts,
  moduleCounts,
  severityCounts,
} from './filter';
import type { FindingFilterState } from './filter';

export interface FindingListProps {
  findings: readonly GardenerFinding[];
  filter: FindingFilterState;
  onFilter: (next: FindingFilterState) => void;
  /** Welcher Befund arbeitet gerade? */
  busyId: string | null;
  onFix: (finding: GardenerFinding) => void;
  onDismiss: (finding: GardenerFinding) => void;
  onOpenPath: (path: string) => void;
  onOpenFile: (path: string) => void;
  onSupersede: (write: SupersedeWrite) => void;
  onSupersedeDuplicate: (write: NearDuplicateSupersedeWrite) => void;
  onDiscarded: (result: DiscardPageResult) => void;
}

export function FindingList({
  findings,
  filter,
  onFilter,
  busyId,
  onFix,
  onDismiss,
  onOpenPath,
  onOpenFile,
  onSupersede,
  onSupersedeDuplicate,
  onDiscarded,
}: FindingListProps) {
  const t = useT();
  const shown = applyFilter(findings, filter);
  const groups = groupByKind(shown);
  const modules = [...moduleCounts(findings, filter).entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([module, count]) => ({ module, count }));
  const kinds = [...kindCounts(findings, filter).entries()].map(([kind, count]) => ({
    kind,
    count,
  }));

  return (
    <Panel
      title={t('garden.findings.label')}
      meta={
        shown.length === findings.length
          ? plural(findings.length, 'garden.findings.totalOne', 'garden.findings.total')
          : t('garden.findings.shown', { shown: shown.length, total: findings.length })
      }
    >
      <FindingFilter
        filter={filter}
        onChange={onFilter}
        kinds={kinds}
        modules={modules}
        severities={severityCounts(findings, filter)}
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
              {group.findings.map((finding) => (
                <li key={finding.id}>
                  {finding.kind === 'contradiction' ? (
                    <ContradictionCard
                      finding={finding}
                      busy={busyId === finding.id}
                      onFix={onFix}
                      onDismiss={onDismiss}
                      onOpenPath={onOpenPath}
                      onOpenFile={onOpenFile}
                      onSupersede={onSupersede}
                    />
                  ) : finding.kind === 'near-duplicate' ? (
                    <NearDuplicateCard
                      finding={finding}
                      busy={busyId === finding.id}
                      onFix={onFix}
                      onDismiss={onDismiss}
                      onOpenPath={onOpenPath}
                      onOpenFile={onOpenFile}
                      onSupersede={onSupersedeDuplicate}
                      onDiscarded={onDiscarded}
                    />
                  ) : (
                    <FindingCard
                      finding={finding}
                      busy={busyId === finding.id}
                      onFix={onFix}
                      onDismiss={onDismiss}
                      onOpenPath={onOpenPath}
                      onOpenFile={onOpenFile}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Panel>
  );
}
