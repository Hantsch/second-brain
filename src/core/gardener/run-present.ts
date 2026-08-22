/** Builds the report shown for a stored run, including the frozen health
 * score — moved verbatim out of `src/main/gardener-state.ts` (027, D4). */

import type { GardenerFinding, GardenerHiddenFinding, GardenerReport } from '@shared/types';
import { healthScore } from './health';
import { isRunComplete, narrowedScope } from './run-scope';
import type { StoredGardener } from './run-record';

/**
 * The report as the screen sees it: the open findings in `findings`, the ones
 * the user put away in `hidden` — each with its state and, for a snooze, the
 * day it runs out. The health score is computed over the open list alone, so
 * the number always matches the list beside it. `null` without a run — a
 * made-up 100 would be the kind of lie a dashboard dies from.
 *
 * A snooze whose day has come is open again even if `pruneSnoozes` hasn't run
 * yet: left running past midnight, the file is a day behind the calendar.
 * Findings a fix has resolved are in neither list — they aren't a decision to
 * review, they're done until the next run.
 *
 * `resolved` are ids that a write outside this file has settled — today only
 * the answered loose ends (020, D5), whose record lives in
 * `.secondbrain/loose-ends.json`. They're treated exactly like a fixed
 * finding: gone from both lists, because an answer isn't a decision to
 * review, and gone here rather than at each caller, so no reader of a stored
 * run can miss it (`ipc/gardener-deps.ts`, `gardenerReport`).
 *
 * A partial run (021b) never computes its own score: `findings` here is
 * whatever a stopped run happened to gather, and a number derived from that
 * would look precise while being an artifact of when the stop landed.
 * Instead the frozen `run.healthAsOf` — the score as it stood at the moment
 * of the stop — is shown, with the date it actually came from so the screen
 * doesn't pass it off as this run's own. And when there was nothing to
 * freeze — the very first check on a vault, stopped mid-run — the health is
 * **unknown** (`healthKnown: false`), because there is no complete check to
 * point at yet. Falling back to a computed number there would be exactly the
 * lie the frozen score exists to prevent.
 *
 * A scoped run (021c) is partial through the same gate, so all of that holds
 * for it too — the score it shows is the last complete one, never one derived
 * from the part. `scope` says which part it was; the findings beside it are
 * the merged list, this run's own plus everything it did not look at.
 */
export function presentRun(
  data: StoredGardener,
  today: string,
  resolved: ReadonlySet<string> = new Set(),
): GardenerReport | null {
  const run = data.run;
  if (run === null) return null;
  const complete = isRunComplete(run);
  const dismissed = new Set(data.dismissed);
  const fixed = new Set(data.fixed.map((entry) => entry.id));
  const findings: GardenerFinding[] = [];
  const hidden: GardenerHiddenFinding[] = [];
  for (const finding of run.findings) {
    if (fixed.has(finding.id) || resolved.has(finding.id)) continue;
    const until = data.snoozed[finding.id];
    if (dismissed.has(finding.id)) hidden.push({ finding, state: 'dismissed' });
    else if (until !== undefined && until > today) {
      hidden.push({ finding, state: 'snoozed', until });
    } else findings.push(finding);
  }
  const frozen = run.healthAsOf;
  const health = complete
    ? healthScore(findings, run.size)
    : { score: frozen?.score ?? null, contributions: frozen?.contributions ?? [] };
  const completedStages = new Set(run.completed ?? []);
  const missingStages = complete
    ? undefined
    : (run.plan ?? []).filter((stage) => !completedStages.has(stage));
  return {
    ranAt: run.ranAt,
    usedLlm: run.usedLlm,
    complete,
    missingStages,
    healthAsOf: !complete ? run.healthAsOf?.ranAt : undefined,
    /* Normalized, so no screen ever gets a scope that narrowed nothing. */
    scope: narrowedScope(run.scope),
    /* Only beside a scope, and only as the run itself recorded it: which
       kinds a stage of it actually looked for. The screen needs it to tell
       "looked, and there is nothing here" from "this scope needed a model
       stage and no model was configured" (021c, AC 6) — the same distinction
       the merge stands on, so both read it from the same field. */
    checkedKinds: narrowedScope(run.scope) === undefined ? undefined : run.checkedKinds,
    findings,
    hidden,
    health: health.score ?? 0,
    healthKnown: health.score !== null,
    healthContributions: health.contributions,
    advice: run.advice,
  };
}
