/**
 * Mehrere verwaiste Seiten in einem Zug in die Overview ihres Moduls eintragen.
 *
 * Der Einzel-Fix (`add-links` in `fixes.ts`) bleibt, wie er ist; diese Datei ruft
 * ihn nicht auf, sondern teilt seine Zusagen:
 *
 * - **Die Vorschau ist die Zeile.** Jeder Eintrag ist wortwoertlich die Vorschau
 *   seines Befunds, nicht neu formuliert.
 * - **Frisch lesen, frisch pruefen.** Die Overview wird jetzt gelesen; steht eine
 *   Seite dort schon, faellt ihr Eintrag weg. Bleibt nichts uebrig, passiert nichts
 *   und der Aufrufer bekommt `invalid`.
 * - **Ein Rueckweg fuer alles.** Alle Overviews landen in *einem* Protokoll, also
 *   dreht eine Marke den ganzen Zug zurueck. Die Chronik bekommt je Modul einen
 *   `lint`-Eintrag.
 */

import type { GardenerFinding } from '@shared/types';
import { isoDay } from '@core/vault/paths';
import { composeContent } from '@core/vault/compose';
import { appendLog, appendUnderSection, phrases } from '@core/wiki';
import { commit, previewLine, readCurrent, refOf } from './fixes';
import type { Change, FixDeps, FixResult } from './fixes';
import { pageSlugOf } from './relations';
import { GardenerError } from './types';

/** Ein Befund auf dem Weg in die Overview: seine Seite und die Zeile, die sie bekommt. */
interface Entry {
  slug: string;
  line: string;
}

function asEntry(finding: GardenerFinding): { overviewPath: string; entry: Entry } {
  const orphanPath = finding.paths[0];
  const overviewPath = finding.paths[1];
  const slug = orphanPath === undefined ? null : pageSlugOf(orphanPath);
  if (
    finding.kind !== 'orphan' ||
    finding.fix?.action !== 'add-links' ||
    overviewPath === undefined ||
    slug === null
  ) {
    throw new GardenerError('invalid', 'Dieser Befund hat keinen Overview-Eintrag als Fix.');
  }
  return { overviewPath, entry: { slug, line: previewLine(finding, slug) } };
}

export async function linkOrphansIntoOverview(
  deps: FixDeps,
  findings: readonly GardenerFinding[],
): Promise<FixResult> {
  const first = findings[0];
  if (first === undefined) throw new GardenerError('invalid', 'Kein Befund ausgewählt.');
  const language = deps.docLanguage ?? 'de';
  const now = deps.now ?? new Date();

  const byOverview = new Map<string, Entry[]>();
  for (const finding of findings) {
    const { overviewPath, entry } = asEntry(finding);
    byOverview.set(overviewPath, [...(byOverview.get(overviewPath) ?? []), entry]);
  }

  const changes: Change[] = [];
  const touched: string[] = [];
  const modules = new Map<string, string[]>();
  for (const [path, entries] of byOverview) {
    const overview = await readCurrent(deps.store, path);
    const ref = refOf(overview);
    if (ref.type !== 'overview') {
      throw new GardenerError('invalid', `„${path}" ist keine Overview.`);
    }
    const missing = entries.filter((entry) => !overview.body.includes(`[[${entry.slug}]]`));
    if (missing.length === 0) continue;
    const body = appendUnderSection(
      overview.body,
      phrases(language).pages,
      missing.map((entry) => entry.line).join('\n'),
    );
    const next = composeContent(overview.path, overview.raw, {
      path: overview.path,
      frontmatter: { updated: isoDay(now) },
      body,
    });
    changes.push({ path: overview.path, before: overview.raw, next });
    const slugs = missing.map((entry) => `[[${entry.slug}]]`);
    touched.push(...slugs);
    modules.set(ref.module, [...(modules.get(ref.module) ?? []), ...slugs]);
  }
  if (changes.length === 0) {
    throw new GardenerError(
      'invalid',
      'Alle gewählten Seiten sind in der Overview schon verlinkt.',
    );
  }

  /* Modul leer: `commit` schreibt keine Chronik — die kommt unten je Modul. */
  const result = await commit(deps, first, changes, touched, '');
  const day = isoDay(now);
  let logged: string | null = null;
  for (const [module, slugs] of modules) {
    const entry = await appendLog(
      deps.store,
      module,
      { kind: 'lint', day, touched: slugs, findings: 'orphan (add-links)' },
      { language, now: day },
    );
    logged = entry.path;
  }
  return { ...result, logged };
}
