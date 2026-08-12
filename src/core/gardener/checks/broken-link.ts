/**
 * Kaputte Wikilinks: `[[ziel]]` ohne Seite dahinter.
 *
 * Gefunden hat sie schon der Indexlauf (`derivePages` → `brokenLinks`), und zwar
 * mit allen Formen aus VAULT-FORMAT.md: `[[slug]]`, `[[modul/slug]]`,
 * `[[slug|Text]]`. Links in Code-Zaeunen sind dort Beispiele und zaehlen nicht;
 * `index` und `log` sind gueltige Ziele, aber keine Seiten. Dieser Check zaehlt
 * also nur aus — und ergaenzt die **Zeile**, denn ein Befund, der nur die Datei
 * nennt, laesst den Nutzer suchen.
 *
 * Kein Fix: die Seite anzulegen braucht Inhalt, und das Ziel umzuschreiben waere
 * eine Nutzerzeile, die die App nicht selbst erzeugt hat (VAULT-FORMAT.md, „Was
 * die App niemals tut").
 */

import type { GardenerFinding } from '@shared/types';
import { contentLines } from '@core/index/text';
import { moduleOfPath } from '@core/index/pages';
import type { IndexedDoc } from '@core/index/types';
import { buildFinding } from '../types';
import type { Check, GardenerContext } from '../types';

/**
 * Zeilennummer in der Datei, 1-basiert. `bodyLine` ist die erste Rumpfzeile, der
 * Index innerhalb des Rumpfs kommt aus derselben Zeilenquelle, die auch der
 * Wikilink-Parser benutzt — damit stimmt die Zahl auch bei Code-Zaeunen.
 */
function lineOfLink(doc: IndexedDoc | undefined, target: string): number | null {
  if (doc === undefined) return null;
  const needle = `[[${target}`;
  for (const { line, index } of contentLines(doc.body)) {
    if (line.includes(needle)) return doc.bodyLine + index;
  }
  return null;
}

export const brokenLinkCheck: Check = {
  kind: 'broken-link',

  run(ctx: GardenerContext): GardenerFinding[] {
    const { byPath, brokenLinks } = ctx.index.index();
    const findings: GardenerFinding[] = [];
    const seen = new Set<string>();

    for (const link of brokenLinks) {
      const key = `${link.path}\n${link.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const doc = byPath.get(link.path);
      const line = lineOfLink(doc, link.target);
      const text = ctx.labels.brokenLink(doc?.title ?? link.path, link.target, line);
      findings.push(
        buildFinding(ctx, {
          kind: 'broken-link',
          severity: 'warn',
          title: text.title,
          detail: text.detail,
          paths: [link.path],
          module: moduleOfPath(link.path),
          key: [link.path, link.target],
        }),
      );
    }
    return findings;
  },
};
