/**
 * Angestaubte Seiten: laenger als `gardener.reviewAfterDays` nicht geprueft.
 *
 * Grundlage ist `reviewed` aus dem Frontmatter — das Feld, das der Pflegelauf
 * setzt (VAULT-FORMAT.md, Wiki-Seiten). Fehlt es, zaehlt der letzte Schreibvorgang:
 * `updated` aus dem Frontmatter oder, wenn die mtime juenger ist, die mtime
 * (extern editierte Dateien sollen als angefasst gelten).
 *
 * Ein extern editiertes `reviewed` wird **nicht** ueberstimmt: wer eine Seite
 * gestern umgeschrieben, aber nie nachgeprueft hat, hat eine ungeprueft alte
 * Aussage stehen. Genau dafuer gibt es das Feld, und genau dafuer den Fix
 * „als geprueft markieren" — er setzt eine Zeile, er behauptet nichts ueber den
 * Inhalt.
 */

import type { GardenerFinding, WikiPage } from '@shared/types';
import { daysBetween } from '@core/index/dates';
import { asDate } from '@core/index/text';
import type { IndexedDoc } from '@core/index/types';
import { buildFinding, buildFix } from '../types';
import type { Check, GardenerContext } from '../types';

/** Der spaetere von zwei Kalendertagen; unbrauchbare Werte verlieren. */
function laterDay(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}

/** Tag, auf den sich die Frist bezieht. `null`, wenn die Datei kein Datum hergibt. */
export function checkedDay(page: WikiPage, doc: IndexedDoc | undefined): string | null {
  const reviewed = asDate(doc?.frontmatter['reviewed']);
  if (reviewed !== null) return reviewed;
  return laterDay(asDate(doc?.frontmatter['updated']), asDate(page.updated) ?? page.created);
}

export const stalePageCheck: Check = {
  kind: 'stale-page',

  run(ctx: GardenerContext): GardenerFinding[] {
    const { byPath } = ctx.index.index();
    const findings: GardenerFinding[] = [];

    for (const module of ctx.modules) {
      for (const page of module.pages) {
        const day = checkedDay(page, byPath.get(page.path));
        if (day === null) continue;
        const ageDays = daysBetween(day, ctx.today);
        if (ageDays === null || ageDays <= ctx.limits.reviewAfterDays) continue;
        const text = ctx.labels.stalePage(page.title, day, ageDays);
        findings.push(
          buildFinding(ctx, {
            kind: 'stale-page',
            severity: 'info',
            title: text.title,
            detail: text.detail,
            paths: [page.path],
            module: module.slug,
            key: [page.path],
            fix: buildFix(ctx, 'mark-reviewed', `reviewed: ${ctx.today}`),
          }),
        );
      }
    }
    return findings;
  },
};
