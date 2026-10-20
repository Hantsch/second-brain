/* At most three sentences: what to do next.

   Two sources, clearly separated:

   - **With a model**, the advice comes from the report (`report.advice`,
     strictly validated in the core and capped at three sentences). Then it's
     shown as it is.
   - **Without a model, `advice` is empty** — the core doesn't interpret
     without a model. Instead of an empty line, the screen derives the advice
     from the breakdown: the three categories that cost the most points, each
     with its own sentence. And it says that it did this
     (`garden.advice.heuristic`) — exactly like `projects:suggestStatus` with
     `heuristic: true`.

   The order comes from `healthContributions` (the core sorts by points). If
   the breakdown is missing — a report from an earlier version — it's counted
   from the findings themselves, not guessed. */

import type { GardenerFinding, GardenerFindingKind, GardenerReport } from '@shared/types';
import { t } from '../../i18n';

/** At most this many sentences — the same limit as in the core (`MAX_ADVICE`). */
export const MAX_ADVICE = 3;

export interface Advice {
  sentences: string[];
  /** Derived without a model? Then the screen says so. */
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

/** The advice for this report. Without findings, there's nothing to advise. */
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

/** The number of findings of one kind — for the line next to the advice. */
export function countOfKind(
  findings: readonly GardenerFinding[],
  kind: GardenerFindingKind,
): number {
  return findings.filter((finding) => finding.kind === kind).length;
}
