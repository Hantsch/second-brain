/**
 * Ein Pflegelauf: alle Checks, optional die Deutung, dann Gesundheit und Ordnung.
 *
 * Der Ablauf ist absichtlich in dieser Reihenfolge:
 * 1. **Deterministisch zuerst.** Die neun Checks laufen ueber den schon gebauten
 *    Index — keine Datei wird gelesen, kein Modell gefragt. Das ist der Teil, der
 *    ohne LLM vollstaendig funktioniert (Guardrail 1).
 * 2. **Dann das Urteil**, wenn `gardener.useLlm` es erlaubt und eine Route steht.
 *    Es darf Kandidaten verwerfen und Widersprueche benennen — nichts anderes.
 *    Danach, in derselben Bedingung und mit demselben `signal`, die zweite
 *    Modellstufe: lose Enden, die die Heuristik nicht sieht (`modelLooseEnds`,
 *    020 D4). Jedes Zitat, das nicht wortwoertlich in der genannten Tagesdatei
 *    steht, faellt dort weg, bevor es hier ankommt.
 * 3. **Dann der Nutzerwille.** Was der Nutzer als „passt so" markiert hat, wird
 *    eingespeist und filtert. Ausgeblendete Befunde zaehlen auch nicht gegen die
 *    Gesundheit: sie sind entschieden, nicht offen.
 * 4. **Dann die Zahl.** Erst auf der gefilterten Liste entsteht der
 *    Gesundheitswert — mit seiner Aufschluesselung, damit der Screen sagen kann,
 *    warum er so ist.
 *
 * Laufzeit: alles ist linear in der Zahl der Dokumente, die beiden unscharfen
 * Checks arbeiten ueber umgekehrte Verzeichnisse statt ueber Paarvergleiche. Ein
 * Bestand mit 1000 Seiten laeuft in Millisekunden durch — geprueft in
 * `tests/core/gardener/report.test.ts`.
 */

import type { DocLanguage, GardenerFinding, GardenerReport, UiLanguage } from '@shared/types';
import type { LlmGateway } from '@core/llm';
import { looseEndsDerived, modelLooseEnds } from '@core/journal';
import { isoDay, wikiIndexPath } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { auditFindings } from './audit';
import { CHECKS, looseEndFinding, looseEndInput } from './checks';
import { healthScore, vaultSize } from './health';
import { withoutHelpModule } from './help-exclusion';
import { GERMAN_GARDENER_LABELS } from './labels';
import type { GardenerLabels } from './labels';
import { SEVERITY_ORDER, limits } from './types';
import type {
  GardenerContext,
  GardenerIndexView,
  GardenerModuleView,
  GardenerSettingsLike,
} from './types';

export interface GardenerDeps {
  index: GardenerIndexView;
  /** Fuer die Deutung. Ohne Route bleibt der Lauf deterministisch. */
  gateway: LlmGateway;
  /** Beschriftungen in der Sprache der Oberflaeche; Vorgabe ist Deutsch. */
  labels?: GardenerLabels;
  /** Sprache der Zeilen, die ein Fix spaeter schreiben wuerde. */
  docLanguage?: DocLanguage;
  /** Sprache der Ratschlaege. */
  replyLanguage?: UiLanguage;
  /** Das „jetzt". Tests geben eine feste Zeit — nie `Date.now()` im Kern. */
  now?: DateLike;
  signal?: AbortSignal;
}

export interface GardenerRunOptions {
  /** Vault-Einstellungen; `VaultSettings` passt hier hinein. */
  settings?: GardenerSettingsLike;
  /**
   * Ueberschreibt `gardener.useLlm` fuer diesen Lauf. Ohne Einstellung und ohne
   * ausdruecklichen Wunsch laeuft der Pflegelauf deterministisch — ein Lauf, der
   * unbemerkt ein Modell fragt, waere eine Ueberraschung mit Kosten.
   */
  useLlm?: boolean;
  /** Kennungen, die der Nutzer als „passt so" markiert hat. */
  dismissed?: Iterable<string>;
}

/** Modul-Slugs des Bestands: alles unter `modules/<slug>/`. */
function moduleSlugs(index: GardenerIndexView): string[] {
  const slugs = new Set<string>();
  for (const doc of index.index().docs) if (doc.module !== null) slugs.add(doc.module);
  for (const page of index.pages()) slugs.add(page.module);
  return [...slugs].sort((a, b) => a.localeCompare(b));
}

/** Module mit Seiten und Katalog — einmal je Lauf, damit kein Check gruppieren muss. */
export function moduleViews(index: GardenerIndexView): GardenerModuleView[] {
  const { byPath } = index.index();
  const pages = index.pages();
  return moduleSlugs(index).map((slug) => {
    const catalogPath = wikiIndexPath(slug);
    return {
      slug,
      pages: pages.filter((page) => page.module === slug),
      catalogPath,
      /* `index.md` traegt kein Frontmatter (VAULT-FORMAT.md) — der Rumpf ist die
         ganze Datei. `parseIndex` haelt einen Block trotzdem aus. */
      catalog: byPath.get(catalogPath)?.body ?? null,
    };
  });
}

export function buildContext(
  deps: GardenerDeps,
  options: GardenerRunOptions = {},
): GardenerContext {
  const now = deps.now ?? new Date();
  const index = withoutHelpModule(deps.index);
  return {
    index,
    modules: moduleViews(index),
    limits: limits(options.settings),
    today: isoDay(now),
    ranAt: new Date(now instanceof Date ? now.getTime() : now).toISOString(),
    labels: deps.labels ?? GERMAN_GARDENER_LABELS,
    docLanguage: deps.docLanguage ?? 'de',
    replyLanguage: deps.replyLanguage ?? 'de',
  };
}

/**
 * Schwerste zuerst, dann nach Modul, dann nach Art und Titel. Innerhalb einer
 * Schwere zaehlt das Modul: Befunde eines Moduls stehen beieinander, damit man sie
 * in einem Durchgang abarbeiten kann. Befunde ohne Modul (Dumps, Projekte, Quellen)
 * kommen danach.
 */
export function sortFindings(findings: readonly GardenerFinding[]): GardenerFinding[] {
  return [...findings].sort((a, b) => {
    const severity = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (severity !== 0) return severity;
    if (a.module !== b.module) {
      if (a.module === null) return 1;
      if (b.module === null) return -1;
      return a.module.localeCompare(b.module);
    }
    return (
      a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
    );
  });
}

/** Ein Lauf. Wirft nur, wenn der Aufrufer abbricht. */
export async function runGardener(
  deps: GardenerDeps,
  options: GardenerRunOptions = {},
): Promise<GardenerReport> {
  const ctx = buildContext(deps, options);
  const deterministic = CHECKS.flatMap((check) => check.run(ctx));

  const useLlm = options.useLlm ?? options.settings?.gardener?.useLlm ?? false;
  const audit = useLlm
    ? await auditFindings(ctx, deterministic, {
        gateway: deps.gateway,
        ...(deps.signal === undefined ? {} : { signal: deps.signal }),
      })
    : null;

  /* Zweite Modellstufe, nach der Deutung und mit derselben Verdrahtung: dasselbe
     Gateway, dasselbe `signal`, dasselbe Tor (`isAvailable`). Nacheinander und
     nicht gleichzeitig — zwei parallele Anfragen an ein lokales Modell sind
     langsamer als zwei nacheinander, und die Reihenfolge bleibt nachvollziehbar.
     Additiv: was hier herauskommt, kommt zu den deterministischen Befunden dazu
     und ersetzt keinen. */
  const looseEnds = useLlm
    ? await modelLooseEnds(
        {
          ...looseEndInput(ctx),
          today: ctx.today,
          derived: looseEndsDerived(ctx.index.index(), ctx.today),
        },
        {
          gateway: deps.gateway,
          ...(deps.signal === undefined ? {} : { signal: deps.signal }),
        },
      )
    : null;
  const fromModel = (looseEnds?.looseEnds ?? []).map((looseEnd) => looseEndFinding(ctx, looseEnd));

  const rejected = new Set(audit?.rejected ?? []);
  const dismissed = new Set(options.dismissed ?? []);
  const findings = sortFindings(
    [...deterministic, ...(audit?.contradictions ?? []), ...fromModel].filter(
      (finding) => !rejected.has(finding.id) && !dismissed.has(finding.id),
    ),
  );

  const health = healthScore(findings, vaultSize(ctx.index));
  return {
    ranAt: ctx.ranAt,
    /* Ein Modell hat mitgeredet, wenn **eine** der beiden Stufen geantwortet
       hat. Welche es war, sagt der Bericht nicht — das sagt `origin` je Befund. */
    usedLlm: audit?.usedLlm === true || looseEnds?.usedLlm === true,
    findings,
    /* `health` ist im Vertrag eine Zahl; ohne Bestand ist sie unbekannt, nicht 0 —
       deshalb sagt `healthKnown`, ob sie ueberhaupt etwas bedeutet. */
    health: health.score ?? 0,
    healthKnown: health.score !== null,
    healthContributions: health.contributions,
    advice: audit?.advice ?? [],
  };
}
