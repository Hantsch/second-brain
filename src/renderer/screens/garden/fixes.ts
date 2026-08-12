/* Was ein Fix anfasst — dieselbe Rechnung wie im Kern, damit die Vorschau nicht
   die falsche Datei nennt.

   `core/gardener/fixes.ts` legt fest, wohin geschrieben wird:
     `add-to-index`   in `wiki/index.md` des Moduls der Seite
     `mark-reviewed`  in die Seite selbst (`paths[0]`)
     `add-links`      bei einem Widerspruch in `paths[0]`, sonst in `paths[1]`
     `merge`, `open-*` nirgendwohin — sie öffnen nur
   Hier steht dieselbe Zuordnung noch einmal, weil der Renderer den Kern nicht
   importieren darf. Ändert sich die eine Stelle, muss diese mit — die Vorschau ist
   ein Versprechen über eine Datei.

   `writesNothing` ist der zweite Teil dieses Versprechens: bei den drei Aktionen,
   die nichts schreiben, steht das ausdrücklich in der Karte. */

import type { GardenerFinding, GardenerFix } from '@shared/types';

/** Aktionen, die keine Datei ändern. Sie öffnen — und sagen das. */
const READ_ONLY: readonly GardenerFix['action'][] = ['merge', 'open-classify', 'open-ingest'];

export function writesNothing(action: GardenerFix['action']): boolean {
  return READ_ONLY.includes(action);
}

/** Die Datei, in die dieser Fix schreibt; `null`, wenn er nichts schreibt. */
export function writeTargetOf(finding: GardenerFinding): string | null {
  const fix = finding.fix;
  if (fix === null || writesNothing(fix.action)) return null;
  if (fix.action === 'add-to-index') {
    return finding.paths.find((path) => path.endsWith('/wiki/index.md')) ?? null;
  }
  if (fix.action === 'mark-reviewed') return finding.paths[0] ?? null;
  /* `add-links`: der Widerspruch wird auf der ersten Seite benannt, ein fehlender
     Verweis auf der Seite eingetragen, die den Namen schon nennt (`paths[1]`). */
  const at = finding.kind === 'contradiction' ? 0 : 1;
  return finding.paths[at] ?? null;
}
