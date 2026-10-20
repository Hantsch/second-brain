/**
 * Jede Seite, die ein Ingest anlegt, bekommt sofort einen Verweis.
 *
 * Der Katalog (`index.md`) zaehlt nicht als Verweis — das ist Absicht (siehe
 * `gardener/checks/orphan.ts`). Ohne diese Zeile waere eine Source-Seite verwaist,
 * sobald das Modell keine Entitaeten vorschlaegt (oder gar kein Modell da ist),
 * und eine neu angelegte Entitaet, sobald keine andere Seite sie nennt. Die
 * Overview ist der eine Ort, den es in jedem Modul gibt; der Eintrag ist rein
 * mechanisch und braucht kein Modell.
 *
 * Angehaengt, nie umgeschrieben: bestehende Zeilen der Nutzerin bleiben stehen.
 */

import { appendUnderSection, pagePath, writePage } from './pages';
import { phrases } from './text';
import type { PageRef, WikiDeps } from './types';
import { MAX_WRITE_ATTEMPTS, isConflict } from './write-retry';

/** Der Eintrag einer Seite im Abschnitt „Seiten" — auch die Form, die die Pflege dort schreibt. */
export function overviewEntryLine(page: { slug: string; title: string }): string {
  return `- [[${page.slug}]] — ${page.title}`;
}

/** Steht `slug` schon als Wikilink im Text (`[[slug]]` oder `[[slug|Anzeige]]`)? */
function mentionsLink(body: string, slug: string): boolean {
  return body.includes(`[[${slug}]]`) || body.includes(`[[${slug}|`);
}

/**
 * Die Seiten in den Abschnitt „Seiten" von `overview.md` eintragen. `true`, wenn
 * die Datei geschrieben wurde; `false`, wenn es nichts zu tun gab oder das Modul
 * keine Overview hat.
 *
 * Wie bei den anderen modul-gemeinsamen Dateien wird bei einem Konflikt neu
 * gelesen und der Eintrag wiederholt (Story 050, D-e).
 */
export async function linkIntoOverview(
  deps: WikiDeps,
  module: string,
  pages: readonly PageRef[],
): Promise<boolean> {
  const path = pagePath(module, 'overview', 'overview');
  const language = deps.docLanguage ?? 'de';

  for (let attempt = 1; ; attempt += 1) {
    const doc = await deps.store.read(path);
    if (doc === null) return false;
    const missing = pages.filter((page) => !mentionsLink(doc.body, page.slug));
    if (missing.length === 0) return false;
    const lines = missing.map(overviewEntryLine).join('\n');
    try {
      await writePage(
        deps.store,
        path,
        {
          body: appendUnderSection(doc.body, phrases(language).pages, lines),
          expectedHash: doc.hash,
          ...(deps.now === undefined ? {} : { now: deps.now }),
        },
        language,
      );
      return true;
    } catch (error) {
      if (attempt >= MAX_WRITE_ATTEMPTS || !isConflict(error)) throw error;
    }
  }
}
