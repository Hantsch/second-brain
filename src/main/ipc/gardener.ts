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
import { shiftDay } from '@core/overview';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { assertActionable, findingOf, linkOrphan, orphanPick } from './gardener-actions';
import { gardenerReport, gardenerStateFor, gardenerToday } from './gardener-deps';
import { runGardener } from './gardener-run';
import { docLanguage, settle, wikiIndex, wikiStore } from './wiki-bridge';
import { cancelGardenerRun } from '../gardener-run-state';
import { GARDENER_STATE_FILE } from '../gardener-state';
import { getWorkQueue } from '../work-queue';
import type { Services } from '../services';
import type { GardenerRunProgress } from '@shared/types';

/** Snoozing for longer than a year means: forgetting. That's not snoozing.
    Mirrors `MAX_SNOOZE_DAYS` in `ipc/reminders.ts` — the same bound, for the
    same reason, on a different kind of thing being put away. */
const MAX_SNOOZE_DAYS = 365;

/** The report has changed: same wake-up as with the reminders. */
function wake(services: Services): void {
  services.sendEvent('event:vault-changed', {
    paths: [GARDENER_STATE_FILE],
    external: false,
  });
}

export function gardenerHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'gardener:report': async () => gardenerReport(services),

    /* A thin read of the one place that knows whether a run is going — now
       the work queue every long-running task is listed in (074, D2), so the
       maintenance screen and the Tasks screen cannot disagree about it. */
    'gardener:runStatus': () => {
      const task = getWorkQueue(services)
        .list()
        .find((entry) => entry.kind === 'gardener' && entry.state === 'running');
      /* `detail` on a running `'gardener'` task is always the
         `GardenerRunProgress` that `gardener-run-state.ts`'s `publish()` wrote
         onto it — the narrowing is safe because only the gardener producer
         ever sets `detail` on a task of this kind. */
      return (task?.detail as GardenerRunProgress | undefined) ?? null;
    },

    /* The run flow itself (slot claim, resume/scope inheritance, cancel
       reason, save, report) lives in `gardener-run.ts` (027, D5) — this
       channel file only wires the request through. */
    'gardener:run': async (request) => runGardener(services, request),

    'gardener:cancel': () => {
      /* A stop the user asked for — the only reason that leaves something
         behind (021b, D2). The one on closing the vault and on quitting
         (`main/index.ts`) says `'shutdown'` and keeps nothing. */
      cancelGardenerRun('user');
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

    /* Mirrors `reminders:snooze`: the same bound, the same day arithmetic, the
       same stance on an unknown id — a button that reports success and does
       nothing would be worse than a missing one. */
    'gardener:snooze': async ({ id, days }) => {
      const count = Math.trunc(Number(days));
      if (!Number.isFinite(count) || count < 1 || count > MAX_SNOOZE_DAYS) {
        throw fail('invalid', `days: erwartet 1 bis ${MAX_SNOOZE_DAYS}`);
      }
      const today = gardenerToday();
      const state = await gardenerStateFor(services);
      if (!(await state.snooze(id, shiftDay(today, count)))) {
        throw fail('not-found', 'diesen Befund gibt es nicht');
      }
      wake(services);
    },

    /* The reverse path — mirrors `reminders:unsnooze`. Setting a snooze to
       "today" wouldn't be one: it only nags again once it has expired. So the
       entry is removed instead; without one, there's nothing to undo. */
    'gardener:unsnooze': async ({ id }) => {
      const state = await gardenerStateFor(services);
      if (!(await state.unsnooze(id))) {
        throw fail('not-found', 'dieser Befund ruht nicht');
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

    'gardener:orphanTargets': async ({ findingId }) =>
      (await orphanPick(services, findingId)).candidates,

    'gardener:linkOrphan': async ({ findingId, target }) => {
      const pick = await orphanPick(services, findingId);
      const result = await linkOrphan(services, pick, target);
      if (result.written.length > 0) {
        await settle(services, result.written, 'gardener');
        if (result.undoToken !== null)
          await pick.state.markFixed(pick.finding.id, result.undoToken);
        wake(services);
      }
      return {
        written: result.written,
        ...(result.undoToken === null ? {} : { undoToken: result.undoToken }),
      };
    },
  });
}
