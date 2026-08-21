/* The ordering of the findings list: filter, group, count.

   Pure functions without React — that way it's testable that the counts match
   the list shown next to them. The order of the groups is the order of the
   report (the core sorts most severe first, see
   `core/gardener/report.ts#sortFindings`): a second sort here would be a
   second truth.

   The counts in the selection lists are computed **before** their own filter
   is applied: "Kind: orphaned pages (3)" has to say how many there are, not
   how many remain after its own selection — otherwise everything would show
   (0) as soon as something else is selected. */

import type {
  FindingSeverity,
  GardenerFinding,
  GardenerFindingKind,
  GardenerHiddenFinding,
} from '@shared/types';

/** Open findings, one hidden state, or open and hidden together. */
export type FindingStateFilter = 'open' | 'dismissed' | 'snoozed' | 'all';

export interface FindingFilterState {
  kind: GardenerFindingKind | 'all';
  /** Module slug, `'none'` for findings without a module, `'all'` for all. */
  module: string | 'all' | 'none';
  severity: FindingSeverity | 'all';
  state: FindingStateFilter;
}

export const ALL_FILTERS: FindingFilterState = {
  kind: 'all',
  module: 'all',
  severity: 'all',
  state: 'open',
};

export function isFiltered(filter: FindingFilterState): boolean {
  return (
    filter.kind !== 'all' ||
    filter.module !== 'all' ||
    filter.severity !== 'all' ||
    filter.state !== 'open'
  );
}

/**
 * Which pool the state axis selects from — open findings, the hidden ones in
 * one state, or open and every hidden finding together ("all"). A plain list
 * of `GardenerFinding`, so it drops straight into `applyFilter`/`groupByKind`;
 * the hidden reason (state, `until`) lives in the report's `hidden` array and
 * a caller that needs it looks the finding's id up there.
 */
export function poolForState(
  findings: readonly GardenerFinding[],
  hidden: readonly GardenerHiddenFinding[],
  state: FindingStateFilter,
): GardenerFinding[] {
  if (state === 'open') return [...findings];
  const hiddenFindings = hidden
    .filter((entry) => state === 'all' || entry.state === state)
    .map((entry) => entry.finding);
  return state === 'all' ? [...findings, ...hiddenFindings] : hiddenFindings;
}

function matchesKind(finding: GardenerFinding, filter: FindingFilterState): boolean {
  return filter.kind === 'all' || finding.kind === filter.kind;
}

function matchesModule(finding: GardenerFinding, filter: FindingFilterState): boolean {
  if (filter.module === 'all') return true;
  if (filter.module === 'none') return finding.module === null;
  return finding.module === filter.module;
}

function matchesSeverity(finding: GardenerFinding, filter: FindingFilterState): boolean {
  return filter.severity === 'all' || finding.severity === filter.severity;
}

export function applyFilter(
  findings: readonly GardenerFinding[],
  filter: FindingFilterState,
): GardenerFinding[] {
  return findings.filter(
    (finding) =>
      matchesKind(finding, filter) &&
      matchesModule(finding, filter) &&
      matchesSeverity(finding, filter),
  );
}

export interface FindingGroup {
  kind: GardenerFindingKind;
  findings: GardenerFinding[];
}

/** Grouped by kind, in the order of first appearance in the report. */
export function groupByKind(findings: readonly GardenerFinding[]): FindingGroup[] {
  const groups: FindingGroup[] = [];
  for (const finding of findings) {
    const group = groups.find((entry) => entry.kind === finding.kind);
    if (group === undefined) groups.push({ kind: finding.kind, findings: [finding] });
    else group.findings.push(finding);
  }
  return groups;
}

/** How often each kind occurs — without applying the kind filter itself. */
export function kindCounts(
  findings: readonly GardenerFinding[],
  filter: FindingFilterState,
): Map<GardenerFindingKind, number> {
  const counts = new Map<GardenerFindingKind, number>();
  for (const finding of applyFilter(findings, { ...filter, kind: 'all' })) {
    counts.set(finding.kind, (counts.get(finding.kind) ?? 0) + 1);
  }
  return counts;
}

/** How often each module occurs — without applying the module filter itself. */
export function moduleCounts(
  findings: readonly GardenerFinding[],
  filter: FindingFilterState,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const finding of applyFilter(findings, { ...filter, module: 'all' })) {
    const key = finding.module ?? 'none';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** How often each severity occurs — without applying the severity filter itself. */
export function severityCounts(
  findings: readonly GardenerFinding[],
  filter: FindingFilterState,
): Map<FindingSeverity, number> {
  const counts = new Map<FindingSeverity, number>();
  for (const finding of applyFilter(findings, { ...filter, severity: 'all' })) {
    counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
  }
  return counts;
}

/**
 * How many findings each state value would show — kind/module/severity
 * applied, the state axis itself ignored, exactly like the other counts.
 * Unlike them, the state axis switches between two different lists (`findings`
 * and `hidden`) rather than filtering one, so it does its own counting instead
 * of going through `applyFilter` with `state` reset.
 */
export function stateCounts(
  findings: readonly GardenerFinding[],
  hidden: readonly GardenerHiddenFinding[],
  filter: FindingFilterState,
): Map<FindingStateFilter, number> {
  const open = applyFilter(findings, filter).length;
  const dismissed = applyFilter(
    hidden.filter((entry) => entry.state === 'dismissed').map((entry) => entry.finding),
    filter,
  ).length;
  const snoozed = applyFilter(
    hidden.filter((entry) => entry.state === 'snoozed').map((entry) => entry.finding),
    filter,
  ).length;
  const counts = new Map<FindingStateFilter, number>();
  counts.set('open', open);
  counts.set('dismissed', dismissed);
  counts.set('snoozed', snoozed);
  counts.set('all', open + dismissed + snoozed);
  return counts;
}
