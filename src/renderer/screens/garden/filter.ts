/* Die Ordnung der Befundliste: filtern, gruppieren, zählen.

   Reine Funktionen ohne React — so ist prüfbar, dass die Zählungen zu der Liste
   passen, die daneben steht. Die Reihenfolge der Gruppen ist die Reihenfolge des
   Berichts (der Kern sortiert schwerste zuerst, siehe
   `core/gardener/report.ts#sortFindings`): eine zweite Sortierung hier wäre eine
   zweite Wahrheit.

   Die Zählungen der Auswahllisten werden **vor** dem jeweiligen Filter gerechnet:
   „Art: Verwaiste Seiten (3)" muss sagen, wie viele es gibt, nicht wie viele nach
   der eigenen Auswahl übrig sind — sonst steht überall (0), sobald etwas anderes
   gewählt ist. */

import type { FindingSeverity, GardenerFinding, GardenerFindingKind } from '@shared/types';

export interface FindingFilterState {
  kind: GardenerFindingKind | 'all';
  /** Modul-Slug, `'none'` für Befunde ohne Modul, `'all'` für alle. */
  module: string | 'all' | 'none';
  severity: FindingSeverity | 'all';
}

export const ALL_FILTERS: FindingFilterState = { kind: 'all', module: 'all', severity: 'all' };

export function isFiltered(filter: FindingFilterState): boolean {
  return filter.kind !== 'all' || filter.module !== 'all' || filter.severity !== 'all';
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

/** Nach Art gruppiert, in der Reihenfolge des ersten Vorkommens im Bericht. */
export function groupByKind(findings: readonly GardenerFinding[]): FindingGroup[] {
  const groups: FindingGroup[] = [];
  for (const finding of findings) {
    const group = groups.find((entry) => entry.kind === finding.kind);
    if (group === undefined) groups.push({ kind: finding.kind, findings: [finding] });
    else group.findings.push(finding);
  }
  return groups;
}

/** Wie oft kommt jede Art vor — ohne den Art-Filter selbst. */
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

/** Wie oft kommt jedes Modul vor — ohne den Modul-Filter selbst. */
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

/** Wie oft kommt jede Schwere vor — ohne den Schwere-Filter selbst. */
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
