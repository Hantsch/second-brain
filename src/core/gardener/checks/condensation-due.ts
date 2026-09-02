/**
 * Verdichtung faellig: das Eingangsmaterial einer Area (story 039) oder eines
 * Projekts (story 046) ist seit dem letzten Verdichtungslauf gewachsen oder hat
 * sich geaendert, oder es gibt Material und noch gar kein Artefakt.
 *
 * One kind, two arms — not two kinds. Both answer the same question about the
 * same mechanism (`source_hashes:`), and a user who dismisses "condensation
 * due" dismisses one thing, not two.
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

import type { GardenerFinding, ProjectStatus } from '@shared/types';
import { areaInputs } from '@core/condense/inputs';
import type { CondenseInput } from '@core/condense/inputs';
import { projectInputs } from '@core/condense/inputs-project';
import { condensedAreaPath, condensedProjectPath } from '@core/condense/paths';
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

/**
 * Teile der stabilen Kennung: der Bezeichner der Sache plus die aktuelle
 * Eingangsliste selbst.
 *
 * `head` is what the finding is *about*: `[slug]` for an area — unchanged from
 * story 039, so every "fits as is" a user has already recorded on an area
 * finding keeps matching — and `['project', slug]` for a project, so a project
 * and an area that happen to share a slug can never produce the same id.
 */
function findingKey(head: readonly string[], current: readonly CondenseInput[]): string[] {
  return [...head, ...current.map((input) => `${input.path}:${input.hash}`)];
}

/** Die Befunde ueber die Areas (story 039). */
function areaFindings(ctx: GardenerContext): GardenerFinding[] {
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
          key: findingKey([area.slug], current),
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
        key: findingKey([area.slug], current),
        fix: null,
      }),
    );
  }

  return findings;
}

/**
 * Statuses a condensation is no longer due for.
 *
 * `done` and `dropped` are over — a re-entry briefing for a project nobody
 * re-enters is work for its own sake. `paused` explicitly stays in: a paused
 * project is precisely the one whose re-entry, weeks later, needs the artifact.
 * Same shape as `project-without-next-step.ts`'s filter, with its own list —
 * that check asks whether work can continue *now*, this one whether the state
 * is written down, and an idea or a paused project can be out of date all the
 * same.
 */
const CLOSED_STATUSES: readonly ProjectStatus[] = ['done', 'dropped'];

/**
 * Die Befunde ueber die Projekte (story 046).
 *
 * Same comparison as for an area, over story 044's project input selector
 * (`projectInputs()`) and the `source_hashes:` its run recorded — never a
 * second selector, so check and run keep one answer to "what is an input".
 *
 * Both variants name the condensed artifact **first**, because the finding's
 * `open` exit resolves `paths[0]`: for a project the interesting file is the
 * briefing, not `project.md`. In the missing variant that path is the one the
 * artifact *would* get — the only honest way to point at a file that a run has
 * yet to write.
 */
function projectFindings(ctx: GardenerContext): GardenerFinding[] {
  const findings: GardenerFinding[] = [];
  const { docs, byPath } = ctx.index.index();
  const todos = ctx.index.todos();

  for (const project of ctx.index.projects()) {
    if (CLOSED_STATUSES.includes(project.status)) continue;

    const current = projectInputs({ project, docs, todos }, { now: ctx.today });
    // Empty only when the index holds no document of this project at all —
    // `project.md` itself is always an input. Nothing to compare, no finding.
    if (current.length === 0) continue;

    const artifactPath = condensedProjectPath(project.scope, project.slug);
    const artifact = byPath.get(artifactPath);
    const key = findingKey(['project', project.slug], current);

    if (artifact === undefined) {
      const text = ctx.labels.condensationMissing(project.title, 'project');
      findings.push(
        buildFinding(ctx, {
          kind: 'condensation-due',
          severity: 'info',
          title: text.title,
          detail: text.detail,
          paths: [artifactPath, project.path],
          module: null,
          key,
          fix: null,
        }),
      );
      continue;
    }

    const changed = changedInputs(current, recordedSources(artifact.frontmatter));
    if (changed.length === 0) continue;

    const text = ctx.labels.condensationDue(
      project.title,
      condensedAtOf(artifact.frontmatter),
      changed.length,
      'project',
    );
    findings.push(
      buildFinding(ctx, {
        kind: 'condensation-due',
        severity: 'info',
        title: text.title,
        detail: text.detail,
        paths: [artifactPath, project.path],
        module: null,
        key,
        fix: null,
      }),
    );
  }

  return findings;
}

export const condensationDueCheck: Check = {
  kind: 'condensation-due',

  run(ctx: GardenerContext): GardenerFinding[] {
    return [...areaFindings(ctx), ...projectFindings(ctx)];
  },
};
