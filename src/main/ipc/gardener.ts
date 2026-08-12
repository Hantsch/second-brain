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

import { applyFix, undoFix } from '@core/gardener';
import type { GardenerFinding } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { gardenerStateFor, runWithProgress } from './gardener-deps';
import { docLanguage, settle, wikiStore } from './wiki-bridge';
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
  });
}
