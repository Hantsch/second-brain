/* Maintenance: the latest report, a new run, "looks fine" and the one-click
   fixes.

   Computed in `@core/gardener`, wired up in `gardener-deps.ts`, persisted in
   `.secondbrain/gardener.json` (`gardener-state.ts`). The channel itself keeps
   four promises:

   - **`gardener:report` does not check anything.** It reads the last run. If
     there is none, the answer is `null` — the screen then says "not checked
     yet" instead of inventing a health status.
   - **`gardener:run` is cancellable and reports progress.** One run per vault;
     a second call during a run is an error, not a second run. The caller
     decides `useLlm`, otherwise the setting does — a run that quietly queries
     a model would be a surprise with a cost.
   - **"Looks fine" is a decision about one thing, not about a run.** It's
     persisted, survives every further run, and `gardener:undismiss` reverses
     it.
   - **A fix writes only what it announces.** The core reads the file fresh on
     click, re-checks the precondition, and writes with the hash just read
     (`core/gardener/fixes.ts`). Afterward the finding is hidden rather than
     deleted — `gardener:undoFix` reverses both. */

import { applyFix, discardPage, discardPlan, supersede, undoFix } from '@core/gardener';
import type { GardenerFinding } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { gardenerStateFor, runWithProgress } from './gardener-deps';
import { docLanguage, settle, wikiIndex, wikiStore } from './wiki-bridge';
import { GARDENER_STATE_FILE } from '../gardener-state';
import type { Services } from '../services';

/* One run per process. That's all that's needed: there's one open vault, and
   two simultaneous runs over the same content would produce the same report
   twice — at double the cost, if a model is involved. */
let running: AbortController | null = null;

/** Cancels a running maintenance run — on closing the vault and on quitting. */
export function cancelGardenerRun(): void {
  running?.abort();
  running = null;
}

/** Is a maintenance run currently in progress? */
export function gardenerRunning(): boolean {
  return running !== null;
}

/** The report has changed: same wake-up as with the reminders. */
function wake(services: Services): void {
  services.sendEvent('event:vault-changed', {
    paths: [GARDENER_STATE_FILE],
    external: false,
  });
}

function findingOf(value: unknown): GardenerFinding {
  if (value === null || typeof value !== 'object') throw fail('invalid', 'kein Befund');
  const finding = value as GardenerFinding;
  if (typeof finding.id !== 'string' || !Array.isArray(finding.paths)) {
    throw fail('invalid', 'kein Befund');
  }
  return finding;
}

/** Der Hash, den der letzte Lauf fuer `path` festgehalten hat; `null`, wenn keiner
    der Befunde einen kennt. */
function recordedHash(findings: readonly GardenerFinding[], path: string): string | null {
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
async function assertActionable(services: Services, ...paths: readonly string[]): Promise<void> {
  const state = await gardenerStateFor(services);
  const findings = state.present()?.findings ?? [];
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

export function gardenerHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'gardener:report': async () => (await gardenerStateFor(services)).present(),

    'gardener:run': async ({ useLlm }) => {
      if (running !== null) throw fail('invalid', 'es läuft schon ein Pflegelauf');
      /* The marker is set **before** the first `await`: otherwise two calls
         from the same keypress would both go through and write the same
         report twice. */
      const controller = new AbortController();
      running = controller;
      try {
        const state = await gardenerStateFor(services);
        const run = await runWithProgress(services, {
          ...(useLlm === undefined ? {} : { useLlm }),
          signal: controller.signal,
          onProgress: (progress) => services.sendEvent('event:gardener-progress', progress),
        });
        await state.save(run);
        const report = state.present();
        if (report === null) throw fail('io', 'der Bericht ließ sich nicht ablegen');
        return report;
      } finally {
        running = null;
        /* Even a cancelled run ends visibly: otherwise the indicator keeps
           spinning even though nothing is computing anymore. */
        services.sendEvent('event:gardener-progress', {
          phase: 'done',
          check: null,
          done: 0,
          total: 0,
          running: false,
        });
      }
    },

    'gardener:cancel': () => {
      cancelGardenerRun();
    },

    'gardener:dismiss': async ({ id }) => {
      const state = await gardenerStateFor(services);
      /* Hiding a finding that no run knows about would be a button that
         reports success and does nothing — the same stance as
         `reminders:snooze`. */
      if (!(await state.dismiss(id))) throw fail('not-found', 'diesen Befund gibt es nicht');
      wake(services);
    },

    'gardener:undismiss': async ({ id }) => {
      const state = await gardenerStateFor(services);
      if (!(await state.undismiss(id))) {
        throw fail('not-found', 'dieser Befund ist nicht ausgeblendet');
      }
      wake(services);
    },

    'gardener:applyFix': async ({ finding }) => {
      const checked = findingOf(finding);
      const state = await gardenerStateFor(services);
      const result = await applyFix(
        { store: wikiStore(services), docLanguage: docLanguage(services) },
        checked,
      );
      if (result.written.length > 0) {
        /* Index first, then state: `present()` recomputes the health status,
           and the wake-up call after it lets the screen fetch both fresh. */
        await settle(services, result.written, 'gardener');
        if (result.undoToken !== null) await state.markFixed(checked.id, result.undoToken);
        wake(services);
      }
      return {
        written: result.written,
        ...(result.open.length > 0 ? { open: result.open } : {}),
        ...(result.undoToken === null ? {} : { undoToken: result.undoToken }),
      };
    },

    'gardener:undoFix': async ({ undoToken }) => {
      const state = await gardenerStateFor(services);
      const result = await undoFix(wikiStore(services), undoToken);
      await state.undoFixed(undoToken);
      if (result.restored.length > 0) await settle(services, result.restored, 'gardener');
      wake(services);
      return result;
    },

    'gardener:discardPlan': async ({ path, keep }) => {
      await assertActionable(services, path);
      return discardPlan(
        { store: wikiStore(services), index: wikiIndex(services) },
        { path, ...(keep === undefined ? {} : { keep }) },
      );
    },

    'gardener:discardPage': async ({ path, keep, expectedHash }) => {
      await assertActionable(services, path);
      const result = await discardPage(
        {
          store: wikiStore(services),
          index: wikiIndex(services),
          docLanguage: docLanguage(services),
        },
        {
          path,
          ...(keep === undefined ? {} : { keep }),
          ...(expectedHash === undefined ? {} : { expectedHash }),
        },
      );
      /* Both the content changes and the deleted page belong in the same
         settle: only then does the module the page belonged to recompute
         with the page actually gone. */
      await settle(services, [...result.written, result.discarded], 'gardener');
      return result;
    },

    'gardener:supersede': async ({ newerPath, olderPath, expectedHash }) => {
      await assertActionable(services, newerPath, olderPath);
      const result = await supersede(
        { store: wikiStore(services), docLanguage: docLanguage(services) },
        { newerPath, olderPath, ...(expectedHash === undefined ? {} : { expectedHash }) },
      );
      await settle(services, [result.written], 'gardener');
      return result;
    },
  });
}
