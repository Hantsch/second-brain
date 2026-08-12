/* Höchstens drei Sätze: was als nächstes zu tun ist.

   Zwei Quellen, klar getrennt:

   - **Mit Modell** kommt der Rat aus dem Bericht (`report.advice`, im Kern hart
     geprüft und auf drei Sätze begrenzt). Dann steht er da, wie er ist.
   - **Ohne Modell ist `advice` leer** — der Kern deutet nicht ohne Modell. Statt
     einer leeren Zeile leitet der Screen den Rat aus der Aufschlüsselung ab: die
     drei Kategorien, die am meisten Punkte kosten, jede mit ihrem Satz. Und er
     sagt, dass er das getan hat (`garden.advice.heuristic`) — genau wie
     `projects:suggestStatus` mit `heuristic: true`.

   Die Reihenfolge kommt aus `healthContributions` (der Kern sortiert nach
   Punkten). Fehlt die Aufschlüsselung — ein Bericht aus einer früheren Fassung —,
   wird aus den Befunden selbst gezählt, nicht geraten. */

import type { GardenerFinding, GardenerFindingKind, GardenerReport } from '@shared/types';
import { t } from '../../i18n';

/** So viele Sätze höchstens — dieselbe Grenze wie im Kern (`MAX_ADVICE`). */
export const MAX_ADVICE = 3;

export interface Advice {
  sentences: string[];
  /** Ohne Modell abgeleitet? Dann sagt der Screen es. */
  heuristic: boolean;
}

function kindsByWeight(report: GardenerReport): GardenerFindingKind[] {
  const contributions = report.healthContributions ?? [];
  if (contributions.length > 0) return contributions.map((entry) => entry.kind);
  const counts = new Map<GardenerFindingKind, number>();
  for (const finding of report.findings) {
    counts.set(finding.kind, (counts.get(finding.kind) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([kind]) => kind);
}

/** Der Rat zu diesem Bericht. Ohne Befunde gibt es nichts zu raten. */
export function adviceFor(report: GardenerReport): Advice {
  if (report.advice.length > 0) {
    return { sentences: report.advice.slice(0, MAX_ADVICE), heuristic: false };
  }
  if (report.findings.length === 0) return { sentences: [], heuristic: false };
  return {
    sentences: kindsByWeight(report)
      .slice(0, MAX_ADVICE)
      .map((kind) => t(`garden.advice.${kind}`)),
    heuristic: true,
  };
}

/** Die Zahl der Befunde einer Art — für die Zeile neben dem Rat. */
export function countOfKind(
  findings: readonly GardenerFinding[],
  kind: GardenerFindingKind,
): number {
  return findings.filter((finding) => finding.kind === kind).length;
}
