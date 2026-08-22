/* The gardener:run IPC handler body: claims the run slot, resumes or scopes
   it, and saves the result. */

import { narrowedScope } from '@core/gardener';
import type { IpcRequest } from '@shared/ipc';
import type { GardenerReport } from '@shared/types';
import { fail } from './registry';
import { gardenerReport, gardenerStateFor, runWithProgress, saveRun } from './gardener-deps';
import { beginGardenerRun } from '../gardener-run-state';
import type { Services } from '../services';

/**
 * The full body of the `gardener:run` handler — moved out of `ipc/gardener.ts`
 * verbatim (behaviour-preserving split, story 027 D5). See that file's header
 * comment for the promises this keeps; nothing about them changes here.
 */
export async function runGardener(
  services: Services,
  { useLlm, resume, scope }: IpcRequest<'gardener:run'>,
): Promise<GardenerReport> {
  /* The slot is claimed **before** the first `await`, and from the one
     place that knows about the autostart too (021a, D3): otherwise two
     calls from the same keypress — or a click during the run on open —
     would both go through and write the same report twice. */
  const handle = beginGardenerRun({
    trigger: 'user',
    emit: (progress) => services.sendEvent('event:gardener-progress', progress),
  });
  if (handle === null) throw fail('invalid', 'es läuft schon ein Pflegelauf');
  try {
    const state = await gardenerStateFor(services);
    /* `resume` continues the run on file instead of starting from nothing
       (021b, D3) — `runWithProgress` itself decides what "continues" means:
       every stage already in its `completed` is skipped, so a check never
       runs twice and a model stage that already answered is not asked
       again. Without a stored run there is nothing to continue, so this
       is silently the same as a plain run. */
    const stored = resume === true ? state.run() : null;
    /* Continuing a part-run keeps it a part-run (021c). The stop it
       continues looked at one slice of the vault; its findings are this
       run's base, and every stage still to come sees only that slice. Were
       the scope dropped here, the resumed run would reach every planned
       stage, read as a **complete** check of the whole vault, and then
       recompute the health score and prune the user's decisions over
       findings most of which nothing ever re-derived. A part-run must not
       become "the whole vault, checked" by way of a continue.

       Normalized before the fallback, not after: `{ kinds: [] }` from a
       caller is not a scope (`narrowedScope`), and taking it as one would
       launder exactly the run this guards. */
    const inherited = stored === null ? undefined : narrowedScope(stored.scope);
    const runScope = narrowedScope(scope) ?? inherited;
    const result = await runWithProgress(services, {
      ...(useLlm === undefined ? {} : { useLlm }),
      ...(stored === null ? {} : { resumeFrom: stored }),
      ...(runScope === undefined ? {} : { scope: runScope }),
      signal: handle.signal,
      trigger: handle.trigger,
      onProgress: handle.publish,
    });
    /* Stopping is not failing (021b, D2): what the finished stages found is
       stored as a partial run and read back like any other report, so the
       answer to a cancelled run is the report — not an error that throws
       away the minutes the run already cost.

       Except on the way out. A stop from closing the vault or from quitting
       writes nothing at all, whatever the run got to: that vault must not be
       left with half a report, and on quit the atomic write could not be
       awaited anyway. Then this returns the report that was already on file
       — unchanged, because nothing was written. */
    if (handle.cancelledBy() !== 'shutdown') await saveRun(services, state, result);
    const report = await gardenerReport(services, state);
    if (report === null) {
      throw result.complete
        ? fail('io', 'der Bericht ließ sich nicht ablegen')
        : fail('cancelled', 'der Pflegelauf wurde abgebrochen, bevor etwas gefunden war');
    }
    return report;
  } finally {
    /* Even a cancelled or failed run ends visibly, and frees the slot:
       otherwise the indicator keeps spinning even though nothing is
       computing anymore, and no further run would be allowed. */
    handle.finish();
  }
}
