/**
 * Der Gesundheitswert 0..100 — und die Rechnung, mit der er sich erklaeren laesst.
 *
 * Drei Festlegungen, jede aus einem Fehler, den eine einzelne Zahl macht:
 *
 * 1. **Relativ zur Groesse.** Zehn kaputte Links in 500 Seiten sind Alltag, in
 *    20 Seiten sind sie der Zustand des Bestands. Gerechnet wird deshalb
 *    Strafpunkte **pro Einheit**, nicht Strafpunkte absolut. Eine Einheit ist alles,
 *    worauf ein Check schaut: Wiki-Seiten, Projekte, Rohquellen, Dumps.
 * 2. **Erklaerbar.** Neben der Zahl kommen die Beitraege je Kategorie zurueck; sie
 *    summieren sich auf `100 − health`. Damit kann der Screen sagen, warum der Wert
 *    so ist, statt eine Note zu verkuenden.
 * 3. **Ein leerer Vault hat keine Gesundheit.** `score` ist dann `null` — nicht 100
 *    („alles gut") und nicht 0 („alles kaputt"), sondern unbekannt. Der Vertrag
 *    traegt dafuer `healthKnown`.
 *
 * Die Formel: `health = 100 · (1 − min(1, Strafpunkte / (Einheiten · 3)))`.
 * Die Drei ist das Gewicht eines mittelschweren Befunds (`warn`): Gesundheit 0
 * heisst also „auf jede Einheit im Vault kommt ein mittelschwerer Befund".
 */

import type {
  GardenerFinding,
  GardenerFindingKind,
  GardenerHealthContribution,
} from '@shared/types';
import { SEVERITY_WEIGHT } from './types';
import type { GardenerIndexView } from './types';

/** Strafpunkte pro Einheit, bei denen die Gesundheit 0 erreicht. */
export const FULL_ROT_PENALTY_PER_UNIT = SEVERITY_WEIGHT.warn;

export interface HealthResult {
  /** 0..100, oder `null`, wenn es keinen Bestand gibt. */
  score: number | null;
  /** Einheiten, auf die der Wert bezogen ist. */
  size: number;
  /** Verlorene Punkte je Kategorie, groesster Beitrag zuerst. */
  contributions: GardenerHealthContribution[];
}

/**
 * Groesse des Bestands: alles, worauf die Checks schauen. Ein Vault ohne Seiten,
 * ohne Projekte, ohne Quellen und ohne Dumps ist leer — und hat keine Gesundheit.
 */
export function vaultSize(index: GardenerIndexView): number {
  return (
    index.pages().length + index.projects().length + index.sources().length + index.dumps().length
  );
}

interface Bucket {
  kind: GardenerFindingKind;
  count: number;
  penalty: number;
}

function buckets(findings: readonly GardenerFinding[]): Bucket[] {
  const byKind = new Map<GardenerFindingKind, Bucket>();
  for (const finding of findings) {
    const bucket = byKind.get(finding.kind) ?? { kind: finding.kind, count: 0, penalty: 0 };
    bucket.count += 1;
    bucket.penalty += SEVERITY_WEIGHT[finding.severity];
    byKind.set(finding.kind, bucket);
  }
  return [...byKind.values()].sort((a, b) => b.penalty - a.penalty || a.kind.localeCompare(b.kind));
}

/**
 * Die Beitraege runden und die Rundungsdifferenz auf den groessten Posten legen —
 * sonst summieren sich die angezeigten Punkte nicht auf den angezeigten Verlust,
 * und der Screen behauptet eine Rechnung, die nicht aufgeht.
 */
function rounded(
  exact: readonly { kind: GardenerFindingKind; count: number; points: number }[],
  lost: number,
): GardenerHealthContribution[] {
  const result = exact.map((entry) => ({
    kind: entry.kind,
    count: entry.count,
    points: Math.round(entry.points),
  }));
  const first = result[0];
  if (first === undefined) return result;
  const delta = lost - result.reduce((sum, entry) => sum + entry.points, 0);
  first.points = Math.max(0, first.points + delta);
  return result;
}

/** Gesundheitswert und Begruendung. `size` kommt aus `vaultSize`. */
export function healthScore(findings: readonly GardenerFinding[], size: number): HealthResult {
  if (size <= 0) return { score: null, size: 0, contributions: [] };

  const groups = buckets(findings);
  const penalty = groups.reduce((sum, bucket) => sum + bucket.penalty, 0);
  const budget = size * FULL_ROT_PENALTY_PER_UNIT;
  const lostRaw = (100 * penalty) / budget;
  /* Ueber 100 hinaus gibt es nichts zu verlieren; die Beitraege werden dann
     anteilig gestaucht, damit ihre Summe weiter dem Verlust entspricht. */
  const scale = lostRaw > 100 ? 100 / lostRaw : 1;
  const lost = Math.min(100, lostRaw);
  const score = Math.round(100 - lost);

  return {
    score,
    size,
    contributions: rounded(
      groups.map((bucket) => ({
        kind: bucket.kind,
        count: bucket.count,
        points: ((100 * bucket.penalty) / budget) * scale,
      })),
      100 - score,
    ),
  };
}
