/* The gardener:run IPC handler body: claims the run slot, resumes or scopes
   it, and saves the result. */

import { narrowedScope } from '@core/gardener';
import type { IpcRequest } from '@shared/ipc';
import type { GardenerReport } from '@shared/types';
import { fail } from './registry';
import { gardenerReport, gardenerStateFor, runWithProgress, saveRun } from './gardener-deps';
import { beginGardenerRun } from '../gardener-run-state';
import { getWorkQueue } from '../work-queue';
import type { Services } from '../services';

/**
 * `SB_E2E_STAGE_DELAY_MS` — how long the checks stage pauses between two
 * checks, in milliseconds. Same env family as `SB_VAULT` (`main/index.ts`) and
 * `SB_DEMO` (`ipc/app.ts`): set by the check scripts, never by the app.
 *
 * Why it exists (066, D4): without a model the stage plan is a single `checks`
 * stage over ten mechanical checks, so a run is over before a spec can navigate
 * away and come back to it. A run that finishes instantly cannot be observed
 * *while it runs* — and that, not the report, is what the cross-screen spec is
 * about.
 *
 * Anything that is not a positive integer — unset, empty, `0`, `-1`, `1.5`,
 * `abc` — is read as "no delay" and never throws: a mistyped variable must not
 * be able to keep the shipped run from starting. Then no pause is passed at
 * all, and the run is the run it was before this seam existed.
 */
function stageDelayFromEnv(): number | undefined {
  const raw = process.env['SB_E2E_STAGE_DELAY_MS']?.trim();
  if (!raw) return undefined;
  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms <= 0) return undefined;
  return ms;
}

/* Read once, when this module loads — not per run and not per check: the
   variable belongs to how the process was started, and a run that re-read it
   would let a mid-session change turn one run into a different one. */
const STAGE_DELAY_MS = stageDelayFromEnv();

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
    /* The run mirrors onto the one work queue (074, D2): it is listed, and
       cancellable, next to every other long-running task instead of behind an
       indicator only the maintenance screen knows about. */
    workQueue: getWorkQueue(services),
    trigger: 'user',
    /* Nothing sends the (now-deleted) `event:gardener-progress` from here
       anymore — the registry mirror inside `gardener-run-state.ts`'s own
       `publish()` is the only consumer of a published step now. */
    emit: () => {},
  });
  if (handle === null) throw fail('invalid', 'es läuft schon ein Pflegelauf');
  let caughtError: unknown;
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
      ...(STAGE_DELAY_MS === undefined ? {} : { stageDelayMs: STAGE_DELAY_MS }),
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
  } catch (error) {
    caughtError = error;
    throw error;
  } finally {
    /* Even a cancelled or failed run ends visibly, and frees the slot:
       otherwise the indicator keeps spinning even though nothing is
       computing anymore, and no further run would be allowed.

       An aborted signal means this run was *cancelled*, and the cancel already
       settled the mirrored task — reporting the abort as a failure on top of
       that would turn one stop into two different endings. */
    handle.finish(handle.signal.aborted ? undefined : caughtError);
  }
}
