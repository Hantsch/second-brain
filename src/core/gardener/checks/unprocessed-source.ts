/**
 * Rohquellen ohne Verdichtung: unter `raw/` liegt eine Quelle mit `.ingest.json`,
 * aber ohne `sourcePage`.
 *
 * Die Liste kommt aus dem Index (`deriveSources`), der beide in VAULT-FORMAT.md
 * dokumentierten Varianten kennt — den Ordner mit `.ingest.json` und die
 * Geschwisterdatei `<stamm>.ingest.json`. Ohne Protokoll gibt es keine Quelle im
 * Index und deshalb hier auch keinen Befund: eine Datei, die niemand aufgenommen
 * hat, ist kein liegengebliebener Ingest.
 *
 * Der Fix schreibt nichts. Verdichten braucht ein Modell und ein Zielmodul; das
 * ist der Weg des Quellen-Screens, nicht ein Klick im Pflegelauf.
 */

import type { GardenerFinding } from '@shared/types';
import { buildFinding, buildFix } from '../types';
import type { Check, GardenerContext } from '../types';

export const unprocessedSourceCheck: Check = {
  kind: 'unprocessed-source',

  run(ctx: GardenerContext): GardenerFinding[] {
    const findings: GardenerFinding[] = [];

    for (const source of ctx.index.sources()) {
      if (source.sourcePage !== null && source.sourcePage.length > 0) continue;
      const text = ctx.labels.unprocessedSource(source.title, source.blocked);
      findings.push(
        buildFinding(ctx, {
          kind: 'unprocessed-source',
          severity: 'warn',
          title: text.title,
          detail: text.detail,
          paths: [source.path],
          /* Die Quelle gehoert erst zu einem Modul, wenn sie verdichtet ist. */
          module: source.modules[0] ?? null,
          key: [source.path],
          fix: buildFix(ctx, 'open-ingest'),
        }),
      );
    }
    return findings;
  },
};
