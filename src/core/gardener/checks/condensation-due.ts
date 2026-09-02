/**
 * Verdichtung faellig: das Eingangsmaterial einer Area ist seit dem letzten
 * Verdichtungslauf gewachsen oder hat sich geaendert, oder es gibt Material
 * und noch gar kein Artefakt (story 039).
 *
 * „Neuer" entscheidet ausschliesslich der Inhaltshash (`IndexedDoc.hash`),
 * nie die mtime und nie `condensed_at` — dieselbe Wahl wie beim
 * Konflikt-Schutz des Vaults (Decision Q1). Die Eingangsliste kommt aus
 * `areaInputs()` (037/039 D1), demselben Selektor, den ein Verdichtungslauf
 * benutzt: Check und Lauf duerfen nie zwei verschiedene Antworten auf „was ist
 * ein Eingang" haben.
 *
 * Faellig ist eine Area, wenn
 * - kein Artefakt existiert, aber `areaInputs()` etwas liefert (fehlend), oder
 * - ein Artefakt existiert und mindestens ein aktueller Eingang in den
 *   verzeichneten Quellen fehlt oder dort mit einem anderen Hash steht —
 *   ein verzeichneter Eintrag ohne Hash zaehlt dabei als geaendert (Decision
 *   „Ein Quelleintrag ohne Hash gilt als geaendert").
 *
 * Ein verschwundener Eingang (in `recorded`, aber nicht mehr in `current`)
 * loest fuer sich allein nichts aus: Tageseintraege rutschen von selbst aus
 * dem 90-Tage-Fenster, sonst waere jedes Artefakt dauerhaft faellig
 * (Decision „Ein verschwundener Eingang ist nicht faellig").
 *
 * Kein Fix: Verdichten braucht ein Modell und ein Ziel, das ist nicht die
 * Aufgabe des Pflegelaufs — der billigste Beweis, dass der Fix nichts
 * schreibt, ist, dass es gar keine Fix-Aktion gibt (Decision „No
 * GardenerFix").
 */

import type { GardenerFinding } from '@shared/types';
import { areaInputs } from '@core/condense/inputs';
import type { CondenseInput } from '@core/condense/inputs';
import { condensedAreaPath } from '@core/condense/paths';
import { recordedSources } from '@core/condense/sources';
import type { RecordedSource } from '@core/condense/sources';
import type { IndexedDoc } from '@core/index/types';
import { buildFinding } from '../types';
import type { Check, GardenerContext } from '../types';

/**
 * Die aktuellen Eingaenge, die neu sind oder sich geaendert haben. `isDue()`
 * und die Anzeige „N Eingaenge geaendert" teilen sich diesen einen Durchlauf,
 * statt zwei Antworten auf dieselbe Frage zu riskieren.
 */
function changedInputs(
  current: readonly CondenseInput[],
  recorded: readonly RecordedSource[],
): CondenseInput[] {
  const hashOf = new Map(recorded.map((entry) => [entry.path, entry.hash]));
  return current.filter((input) => {
    if (!hashOf.has(input.path)) return true;
    return hashOf.get(input.path) !== input.hash;
  });
}

/** Das `condensed_at` eines Artefakt-Frontmatters, oder ein leerer String, wenn es fehlt/kaputt ist. */
function condensedAtOf(frontmatter: IndexedDoc['frontmatter']): string {
  const value = frontmatter['condensed_at'];
  return typeof value === 'string' ? value : '';
}

/** Teile der stabilen Kennung: Slug plus die aktuelle Eingangsliste selbst. */
function findingKey(slug: string, current: readonly CondenseInput[]): string[] {
  return [slug, ...current.map((input) => `${input.path}:${input.hash}`)];
}

export const condensationDueCheck: Check = {
  kind: 'condensation-due',

  run(ctx: GardenerContext): GardenerFinding[] {
    const findings: GardenerFinding[] = [];
    const { docs, byPath } = ctx.index.index();

    for (const area of ctx.index.areas()) {
      const current = areaInputs(docs, area.slug, { now: ctx.today });
      if (current.length === 0) continue; // Leere Area: nichts zu vergleichen.

      const artifactPath = condensedAreaPath(area.slug);
      const artifact = byPath.get(artifactPath);

      if (artifact === undefined) {
        const text = ctx.labels.condensationMissing(area.title);
        findings.push(
          buildFinding(ctx, {
            kind: 'condensation-due',
            severity: 'info',
            title: text.title,
            detail: text.detail,
            paths: [area.path],
            module: null,
            key: findingKey(area.slug, current),
            fix: null,
          }),
        );
        continue;
      }

      const recorded = recordedSources(artifact.frontmatter);
      const changed = changedInputs(current, recorded);
      if (changed.length === 0) continue;

      const text = ctx.labels.condensationDue(
        area.title,
        condensedAtOf(artifact.frontmatter),
        changed.length,
      );
      findings.push(
        buildFinding(ctx, {
          kind: 'condensation-due',
          severity: 'info',
          title: text.title,
          detail: text.detail,
          paths: [area.path, artifactPath],
          module: null,
          key: findingKey(area.slug, current),
          fix: null,
        }),
      );
    }

    return findings;
  },
};
