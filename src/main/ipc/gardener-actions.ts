/* Fix and orphan-link action helpers used by the gardener IPC handlers. */

import { applyFix, orphanTargets } from '@core/gardener';
import type { FixResult } from '@core/gardener';
import type { GardenerFinding, OrphanTargets } from '@shared/types';
import { fail } from './errors';
import { gardenerIndex, gardenerReport, gardenerStateFor } from './gardener-deps';
import { docLanguage, wikiStore } from './wiki-bridge';
import { gardenerLabels } from '../gardener-labels';
import type { GardenerState } from '../gardener-state';
import type { Services } from '../services';

export function findingOf(value: unknown): GardenerFinding {
  if (value === null || typeof value !== 'object') throw fail('invalid', 'kein Befund');
  const finding = value as GardenerFinding;
  if (typeof finding.id !== 'string' || !Array.isArray(finding.paths)) {
    throw fail('invalid', 'kein Befund');
  }
  return finding;
}

/** Der Hash, den der letzte Lauf fuer `path` festgehalten hat; `null`, wenn keiner
    der Befunde einen kennt. */
export function recordedHash(findings: readonly GardenerFinding[], path: string): string | null {
  for (const finding of findings) {
    const hash = finding.hashes?.[path];
    /* Der Bericht ist eine Datei im Vault: was drinsteht, ist nicht typgeprueft. */
    if (typeof hash === 'string' && hash.length > 0) return hash;
  }
  return null;
}

/**
 * Darf auf `path` gehandelt werden — nennt ihn ein Befund des aktuellen Berichts,
 * und ist die Datei seither unberuehrt?
 *
 * Zwei Zusagen in einer Pruefung, weil beide dieselbe Quelle brauchen:
 *
 * 1. **Nur ein genannter Pfad.** Die Kanaele fuer Verwerfen und Ueberholen nehmen
 *    einen nackten Pfad aus dem Renderer, nicht einen ganzen `GardenerFinding`
 *    wie `applyFix` — es gilt also dieselbe Begruendung wie bei `add-to-index` in
 *    `core/gardener/fixes.ts`: ein Pfad von aussen darf nicht selbst entscheiden,
 *    welche Datei die App fuer betroffen haelt.
 * 2. **Nur ein aktueller Befund.** Der Hash-Vergleich im Kern (`discard-page.ts`,
 *    `supersede.ts`) faengt eine Aenderung *zwischen Vorschau und Klick*; er kann
 *    keine fangen, die *zwischen Lauf und Klick* passiert ist, denn die Vorschau
 *    liest die schon bearbeitete Datei als Wahrheit. Deshalb vergleicht diese
 *    Pruefung gegen den Hash, den der Lauf festgehalten hat (AC 10, zweiter Satz):
 *    wer seit dem Lauf editiert hat, bekommt `conflict` und prueft neu — statt
 *    stillschweigend eine Fassung zu verwerfen, die nie geprueft wurde.
 *
 * Beides steht **vor** jedem Kernaufruf, auch vor der rein lesenden Vorschau:
 * so sagt schon der Dialog, dass der Lauf veraltet ist, statt eine Vorschau zu
 * zeigen, die der Klick nicht halten kann.
 *
 * Kein Hash im Befund heisst „unbekannt", nicht „geaendert" — ein Bericht aus
 * einer aelteren Version verhaelt sich wie bisher. Und eine Datei, die es nicht
 * mehr gibt, ist kein Konflikt: dafuer meldet der Kern `not-found`.
 */
export async function assertActionable(
  services: Services,
  ...paths: readonly string[]
): Promise<void> {
  const findings = (await gardenerReport(services))?.findings ?? [];
  for (const path of paths) {
    const named = findings.filter((finding) => finding.paths.includes(path));
    if (named.length === 0) throw fail('not-found', `„${path}" steht in keinem aktuellen Befund.`);
    const recorded = recordedHash(named, path);
    if (recorded === null) continue;
    const live = await wikiStore(services).hash(path);
    if (live !== null && live !== recorded) {
      throw fail('conflict', `„${path}" wurde seit dem Pflegelauf geändert. Bitte erneut prüfen.`);
    }
  }
}

export interface OrphanPick {
  state: GardenerState;
  finding: GardenerFinding;
  /** Der Pfad der verwaisten Seite, aus dem Index — nicht aus dem Renderer. */
  orphanPath: string;
  candidates: OrphanTargets;
}

/**
 * Ein Verwaisten-Befund, der eine Auswahl braucht, samt **frisch gerechneter**
 * Kandidatenliste — die eine Quelle fuer beide Kanaele, Vorschau (`orphanTargets`)
 * und Bestaetigung (`linkOrphan`).
 *
 * Zwei Gruende, das nicht zweimal zu schreiben:
 *
 * 1. **Vorschau und Klick duerfen sich nicht widersprechen.** Wuerden beide
 *    Kanaele die Menge je selbst zusammenstellen, koennte der Waehler ein Ziel
 *    anbieten, das die Bestaetigung dann ablehnt.
 * 2. **Der Renderer schickt einen nackten Pfad zurueck.** Derselbe Grund wie bei
 *    `add-to-index` in `core/gardener/fixes.ts`: ein Pfad von aussen darf nicht
 *    selbst entscheiden, in welche Datei geschrieben wird. Also rechnet das Main
 *    die erlaubte Menge neu und prueft die Zugehoerigkeit — statt der Angabe zu
 *    glauben.
 */
export async function orphanPick(services: Services, findingId: string): Promise<OrphanPick> {
  const state = await gardenerStateFor(services);
  const findings = (await gardenerReport(services, state))?.findings ?? [];
  const finding = findings.find((entry) => entry.id === findingId);
  if (finding === undefined) throw fail('not-found', 'diesen Befund gibt es nicht');
  if (finding.kind !== 'orphan' || finding.fix !== null) {
    throw fail('invalid', 'dieser Befund braucht keine Auswahl');
  }
  /* Only the finding's own module — never the whole vault: the candidates
     are a pick among that module's pages, same scope as the automatic
     `singleMention` fix in `checks/orphan.ts`. */
  const modulePages = gardenerIndex(services)
    .pages()
    .filter((page) => page.module === finding.module);
  const orphanPage = modulePages.find((page) => page.path === finding.paths[0]);
  if (orphanPage === undefined) throw fail('not-found', 'die verwaiste Seite gibt es nicht mehr');
  return {
    state,
    finding,
    orphanPath: orphanPage.path,
    candidates: orphanTargets(modulePages, orphanPage, docLanguage(services)),
  };
}

/**
 * The apply step behind `gardener:linkOrphan`: check that `target` is still one
 * of the pick's own candidates, then write the link in exactly the shape the
 * automatic single-candidate fix would have used. Settling the index, marking
 * the finding fixed and waking the screen stay with the channel handler — the
 * same split as `gardener:applyFix` keeps around `findingOf`.
 */
export async function linkOrphan(
  services: Services,
  pick: OrphanPick,
  target: string,
): Promise<FixResult> {
  /* Der eine Test, der alles abdeckt: `orphanTargets` schliesst die verwaiste
     Seite selbst, fremde Module, schon verlinkende Seiten und alles, was gar
     keine Wiki-Seite ist, bereits aus. Wer nicht in dieser Liste steht, ist
     kein Ziel — ein zweiter, eigener Pfad-Test waere eine zweite Wahrheit. */
  if (!pick.candidates.targets.some((candidate) => candidate.path === target)) {
    throw fail('invalid', `„${target}" ist kein wählbares Ziel für diesen Befund.`);
  }
  /* Genau die Form, die der automatische Ein-Kandidaten-Fix hat: `paths[0]`
     die verwaiste Seite, `paths[1]` das Ziel, und als Vorschau die Zeile aus
     demselben Aufruf, der die Kandidaten geliefert hat. Damit ist „die
     Vorschau ist die Zeile" nicht zugesagt, sondern gebaut — und `fixes.ts`
     kann gewaehltes und gefundenes Ziel nicht unterscheiden. */
  return applyFix(
    { store: wikiStore(services), docLanguage: docLanguage(services) },
    {
      ...pick.finding,
      paths: [pick.orphanPath, target],
      fix: {
        action: 'add-links',
        label: gardenerLabels(services.settings.uiLanguage()).fix('add-links'),
        preview: pick.candidates.line,
      },
    },
  );
}
