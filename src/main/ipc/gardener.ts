/* Pflege: der letzte Bericht, ein neuer Lauf, „passt so" und die Ein-Klick-Fixes.

   Gerechnet wird in `@core/gardener`, verdrahtet in `gardener-deps.ts`, gemerkt
   in `.secondbrain/gardener.json` (`gardener-state.ts`). Der Kanal selbst hält
   vier Zusagen ein:

   - **`gardener:report` prüft nicht.** Er liest den letzten Lauf. Gibt es keinen,
     ist die Antwort `null` — der Screen sagt dann „noch nicht geprüft" statt eine
     Gesundheit zu erfinden.
   - **`gardener:run` ist abbrechbar und meldet Fortschritt.** Ein Lauf je Vault;
     ein zweiter Aufruf während eines Laufs ist ein Fehler, kein zweiter Lauf.
     `useLlm` entscheidet der Aufrufer, sonst die Einstellung — ein Lauf, der
     unbemerkt ein Modell fragt, wäre eine Überraschung mit Kosten.
   - **„Passt so" ist eine Entscheidung über eine Sache, nicht über einen Lauf.**
     Sie wird persistiert, überlebt jeden weiteren Lauf, und `gardener:undismiss`
     nimmt sie zurück.
   - **Ein Fix schreibt nur, was er ankündigt.** Der Kern liest die Datei beim
     Klick frisch, prüft die Voraussetzung neu und schreibt mit dem gerade
     gelesenen Hash (`core/gardener/fixes.ts`). Danach wird der Befund
     ausgeblendet statt gelöscht — `gardener:undoFix` dreht beides zurück. */

import { applyFix, undoFix } from '@core/gardener';
import type { GardenerFinding } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { gardenerStateFor, runWithProgress } from './gardener-deps';
import { docLanguage, settle, wikiStore } from './wiki-bridge';
import { GARDENER_STATE_FILE } from '../gardener-state';
import type { Services } from '../services';

/* Ein Lauf je Prozess. Mehr braucht es nicht: es gibt einen offenen Vault, und
   zwei gleichzeitige Läufe über denselben Bestand ergeben denselben Bericht
   zweimal — mit doppelten Kosten, wenn ein Modell beteiligt ist. */
let running: AbortController | null = null;

/** Bricht einen laufenden Pflegelauf ab — beim Schließen des Vaults und beim Beenden. */
export function cancelGardenerRun(): void {
  running?.abort();
  running = null;
}

/** Läuft gerade ein Pflegelauf? */
export function gardenerRunning(): boolean {
  return running !== null;
}

/** Der Bericht hat sich geändert: dieselbe Weckung wie bei den Erinnerungen. */
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

export function gardenerHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'gardener:report': async () => (await gardenerStateFor(services)).present(),

    'gardener:run': async ({ useLlm }) => {
      if (running !== null) throw fail('invalid', 'es läuft schon ein Pflegelauf');
      /* Die Marke wird **vor** dem ersten `await` gesetzt: sonst kämen zwei
         Aufrufe aus demselben Tastendruck beide durch und schrieben denselben
         Bericht zweimal. */
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
        /* Auch ein abgebrochener Lauf endet sichtbar: sonst dreht die Anzeige
           weiter, obwohl niemand mehr rechnet. */
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
      /* Einen Befund auszublenden, den kein Lauf kennt, wäre ein Knopf, der
         Erfolg meldet und nichts tut — dieselbe Haltung wie `reminders:snooze`. */
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
        /* Erst der Index, dann der Zustand: `present()` rechnet die Gesundheit
           neu, und der Weckruf danach lässt den Screen beides frisch holen. */
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
  });
}
