/**
 * Verwaiste Seiten: niemand verlinkt hierher.
 *
 * Der Graph kommt aus dem Index (`core/index/pages.ts`) und wird hier nur
 * ausgezaehlt — `inbound` ist dort schon aus `outbound` invertiert, Katalog und
 * Chronik zaehlen dabei nicht als Verweis. Genau das ist die Absicht: eine Seite,
 * die nur im `index.md` steht, findet niemand ueber Links.
 *
 * Drei Ausnahmen, alle begruendet:
 * - **`overview.md`** ist die Synthese eines Moduls. Sie verweist nach unten, nicht
 *   umgekehrt; ein Verweis darauf ist nicht vorgesehen.
 * - **`index.md` und `log.md`** sind Struktur, keine Seiten (VAULT-FORMAT.md) — sie
 *   stehen gar nicht im Graphen.
 * - **Source-Seiten, die eine andere Seite im Frontmatter als `sources` nennt.**
 *   Ein Beleg ist ein Verweis, auch wenn er nicht als Wikilink im Text steht.
 *
 * Der Fix schreibt den Verweis dorthin, wo er im Kontext steht: auf die eine
 * andere Seite, die den Namen der verwaisten Seite im Text nennt, ohne sie zu
 * verlinken. Bei null oder mehreren solchen Seiten ist die Overview des Moduls das
 * Ziel — als Eintrag im Abschnitt „Seiten", wie ihn auch der Ingest setzt. Nur ein
 * Modul ohne Overview laesst den Befund ohne Fix, dann waehlt ein Mensch.
 */

import type { GardenerFinding, WikiPage } from '@shared/types';
import { buildFinding, buildFix } from '../types';
import type { Check, GardenerContext, GardenerModuleView } from '../types';
import { contentWords } from '../similarity';
import { overviewEntryLine } from '@core/wiki';
import { relatedLine } from '../relations';
import { WordIndex } from '../word-index';

/** Slugs, die eine Seite im Frontmatter als Beleg nennt. */
function citedSources(pages: readonly WikiPage[]): Set<string> {
  const cited = new Set<string>();
  for (const page of pages) for (const slug of page.sources) cited.add(slug);
  return cited;
}

function isOrphan(page: WikiPage, cited: ReadonlySet<string>): boolean {
  if (page.type === 'overview') return false;
  if (page.inbound.length > 0) return false;
  return !(page.type === 'source' && cited.has(page.slug));
}

/** Woerter, unter denen eine Seite im Text erwaehnt wird: Titel, sonst Slug. */
export function mentionWords(page: WikiPage): string[] {
  const fromTitle = contentWords(page.title);
  return fromTitle.length > 0 ? fromTitle : contentWords(page.slug.replace(/-/g, ' '));
}

/**
 * Die eine Seite, die den Namen nennt, aber nicht verlinkt. `null`, sobald es
 * keine oder mehr als eine gibt — dann ist die Stelle nicht bestimmbar.
 */
function singleMention(
  index: WordIndex,
  module: GardenerModuleView,
  page: WikiPage,
): WikiPage | null {
  const words = mentionWords(page);
  if (words.length === 0) return null;
  const id = `${page.module}/${page.slug}`;
  const hits = index
    .pagesWith(words)
    .filter((path) => path !== page.path)
    .map((path) => module.pages.find((candidate) => candidate.path === path))
    .filter((candidate): candidate is WikiPage => candidate !== undefined)
    .filter((candidate) => !candidate.outbound.includes(id));
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

export const orphanCheck: Check = {
  kind: 'orphan',

  run(ctx: GardenerContext): GardenerFinding[] {
    const findings: GardenerFinding[] = [];
    const { byPath } = ctx.index.index();

    for (const module of ctx.modules) {
      const cited = citedSources(module.pages);
      const orphans = module.pages.filter((page) => isOrphan(page, cited));
      if (orphans.length === 0) continue;

      /* Erst jetzt gebaut: ohne verwaiste Seite braucht niemand das Verzeichnis. */
      const words = WordIndex.from(
        module.pages.map((page) => ({ path: page.path, body: byPath.get(page.path)?.body ?? '' })),
      );

      const overview = module.pages.find((page) => page.type === 'overview') ?? null;

      for (const page of orphans) {
        const mention = singleMention(words, module, page);
        /* Eine eindeutige Erwaehnung geht vor — dort steht der Verweis im Kontext.
           Sonst die Overview: jedes Modul hat eine, und der Eintrag braucht keine
           Entscheidung. Nur ohne Overview bleibt der Befund ohne Fix. */
        const target = mention ?? overview;
        const text = ctx.labels.orphan(page.title);
        findings.push(
          buildFinding(ctx, {
            kind: 'orphan',
            severity: 'info',
            title: text.title,
            detail: text.detail,
            paths: target === null ? [page.path] : [page.path, target.path],
            module: module.slug,
            key: [page.path],
            /* Die Vorschau ist wortwoertlich die Zeile, die `applyFix` anhaengt —
               und sie landet in `paths[1]`. */
            fix:
              target === null
                ? null
                : buildFix(
                    ctx,
                    'add-links',
                    mention === null
                      ? overviewEntryLine(page)
                      : relatedLine(page.slug, ctx.docLanguage),
                  ),
          }),
        );
      }
    }
    return findings;
  },
};
