/* Die Befundliste: Filter, Gruppen nach Art, eine Karte je Befund.

   Getrennt vom Screen, weil das zwei Verantwortungen sind — der Screen hält die
   Schreibwege und ihre Bestätigungen zusammen, hier steht die Ordnung der Liste.

   Zwei Festlegungen:
   - **Die Reihenfolge der Gruppen ist die des Berichts** (der Kern sortiert
     schwerste zuerst). Es gibt keine zweite Sortierung.
   - **Der Widerspruch bekommt seine eigene Karte.** Er ist der einzige Befund, bei
     dem man beide Seiten lesen muss, um zu entscheiden. */

import type { ReactNode } from 'react';
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
  onAnswerLooseEnd: (finding: GardenerFinding, day: string, text: string) => void;
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
  onAnswerLooseEnd,
  onRestore,
}: FindingListProps) {
  const t = useT();
  const language = useLanguage();
  /* The state axis picks the pool first — open, one hidden state, or both —
     the other three axes then filter within it, exactly as before. */
  const pool = poolForState(findings, hidden, filter.state);
  const shown = applyFilter(pool, filter);
  const groups = groupByKind(shown);
  /* The loose-end group renders whenever a report exists, count or "no loose
     ends" line — unlike every other kind, whose group only appears when it has
     at least one match (`groupByKind` above). Handled on its own here rather
     than folded into `groups`, and hidden only when the kind axis itself has
     picked something else — the same restraint every other kind already gets
     from that filter. */
  const otherGroups = groups.filter((group) => group.kind !== 'loose-end');
  const looseEndVisible = filter.kind === 'all' || filter.kind === 'loose-end';
  const looseEndFindings = looseEndVisible
    ? applyFilter(pool, { ...filter, kind: 'loose-end' })
    : [];
  /* How many loose ends there are at all — open plus hidden, across every
     filter. Only this number may say "no loose ends" (AC 3); if there are some
     and the current filter shows none, the group says that instead, in the same
     words the list itself uses. An empty line that claims zero while a severity
     or module filter is hiding three would be the same kind of untruth the
     health score is careful about. */
  const looseEndTotal =
    findings.filter((finding) => finding.kind === 'loose-end').length +
    hidden.filter((entry) => entry.finding.kind === 'loose-end').length;
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

  /* One finding, one card — hidden or open, shared by every group below so
     the loose-end section and the generic per-kind groups never diverge on
     how a card is picked. */
  const renderFinding = (finding: GardenerFinding): ReactNode => {
    const hiddenEntry = hiddenById.get(finding.id);
    return hiddenEntry !== undefined ? (
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
        onAnswerLooseEnd={onAnswerLooseEnd}
      />
    );
  };

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
        otherGroups.map((group) => (
          <section key={group.kind} className="sb-ggroup">
            <h3 className="sb-ggroup-title">
              {t(`garden.kind.${group.kind}`)}
              <span className="sb-mono sb-ggroup-count">{group.findings.length}</span>
            </h3>
            <ul className="sb-glist">
              {group.findings.map((finding) => (
                <li key={finding.id}>{renderFinding(finding)}</li>
              ))}
            </ul>
          </section>
        ))
      )}

      {looseEndVisible ? (
        <section className="sb-ggroup">
          <h3 className="sb-ggroup-title">
            {t('garden.kind.loose-end')}
            <span className="sb-mono sb-ggroup-count">{looseEndFindings.length}</span>
          </h3>
          {looseEndFindings.length === 0 ? (
            <div className="sb-panel-empty">
              <p>{t(looseEndTotal === 0 ? 'garden.looseEnd.empty' : 'garden.findings.filtered')}</p>
            </div>
          ) : (
            <ul className="sb-glist">
              {looseEndFindings.map((finding) => (
                <li key={finding.id}>{renderFinding(finding)}</li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </Panel>
  );
}
