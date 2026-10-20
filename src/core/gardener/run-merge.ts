/** Applies a finished or stopped run's findings onto the persisted state,
 * keeping what survives outside its scope — moved verbatim out of
 * `src/main/gardener-state.ts` (027, D3). */

import type { GardenerFinding, GardenerRunScope } from '@shared/types';
import { sortFindings } from './report';
import type { FixedFinding, StoredGardener, StoredRun } from './run-record';
import { inScope, isRunComplete, narrowedScope } from './run-scope';
import { LLM_ONLY_KINDS, kindOf } from './types';

/**
 * Does a decision ("fine as is", snoozed) survive this run? Two cases keep it,
 * and only these two: the run found the finding again — the decision still has
 * a subject. Or the run **could not** have found it, because the kind is one
 * only a model produces (`LLM_ONLY_KINDS`) and this run had none; a run that
 * never looked says nothing by staying silent. Without that second case, one
 * single run without a model would delete every dismissal of a model finding,
 * and no screen would ever show it.
 *
 * Anything else falls away: the finding is gone, so the decision about it is
 * too — otherwise the file grows with every run and never shrinks. The kind
 * comes out of the ID (`kind:hash`), because a dismissed finding is exactly the
 * case where the finding itself is no longer there to ask.
 *
 * "The run found it again" means `considered`, not the shown list: a candidate
 * the model rejected was still re-derived, and only a re-derivation may end a
 * decision.
 */
function outlivesRun(id: string, considered: ReadonlySet<string>, usedLlm: boolean): boolean {
  if (considered.has(id)) return true;
  if (usedLlm) return false;
  const kind = kindOf(id);
  return LLM_ONLY_KINDS.some((llmOnly) => llmOnly === kind);
}

/**
 * What the run re-derived: the shown findings plus everything it considered.
 * The union, not `consideredIds` alone — a run stored without that field (or by
 * a caller that doesn't fill it) then falls back to its findings instead of
 * silently dropping every decision.
 */
function consideredBy(run: StoredRun): ReadonlySet<string> {
  const ids = new Set(run.findings.map((finding) => finding.id));
  for (const id of run.consideredIds ?? []) ids.add(id);
  return ids;
}

/**
 * May this run's silence about a stored finding be read as "it is gone"?
 *
 * Two conditions, and both are needed. The run has to have looked at that slice
 * of the vault (`inScope`) — and it has to have had a stage that could produce
 * that kind of finding at all (`checkedKinds`). A run scoped to `contradiction`
 * on a vault with no model routed passes the first and fails the second: the
 * scope *asked* for contradictions, but no stage of that run ever looked for
 * one, so its empty result says nothing about them.
 *
 * Reading the scope alone here is the data-loss bug this predicate exists to
 * prevent: it turns "we never looked" into "these are gone now" and deletes the
 * findings, in the one file the user is invited to delete, without a word on
 * screen — and leaves their `dismissed`/`snoozed` entries pointing at ids that
 * exist nowhere anymore.
 */
function rederivedBy(run: StoredRun, scope: GardenerRunScope, finding: GardenerFinding): boolean {
  if (!inScope(finding, scope)) return false;
  const checked = run.checkedKinds;
  return checked === undefined || checked.some((kind) => kind === finding.kind);
}

/**
 * A scoped run laid over the run before it (021c) — the merge this story turns
 * on. What the run looked at is replaced by what it found; everything outside
 * its scope, and everything of a kind no stage of it looked for, stays exactly
 * as the previous run left it, because nothing has looked at it since.
 *
 * Not a union with the old in-scope findings, and not a replacement of the whole
 * list: the first would keep findings the run just proved gone, the second would
 * delete findings the run never looked for — silently, in the one file the user
 * is told they may delete.
 *
 * `advice` is inherited rather than merged: it is a statement about the whole
 * vault, so a run over one module has no standing to rewrite it (021c, decision
 * 2). Only when there is no previous run at all does the part-run's own advice
 * stand — it is then the only statement in existence, and `complete: false`
 * plus the scope beside it say what it is worth.
 */
function mergeScoped(
  previous: StoredRun | null,
  run: StoredRun,
  scope: GardenerRunScope,
): StoredRun {
  if (previous === null) return run;
  const rederived = new Set(run.findings.map((finding) => finding.id));
  const kept = previous.findings.filter(
    /* The id check is the second lock: a finding this run brought back itself
       belongs to this run, never twice — whatever a caller believed its scope
       to be. */
    (finding) => !rederivedBy(run, scope, finding) && !rederived.has(finding.id),
  );
  return {
    ...run,
    /* Sorted as one list, not old-then-new: every reader takes the stored order
       for "most severe first" (`core/gardener/report.ts#sortFindings`), and
       appending would push this run's own findings behind the inherited ones. */
    findings: sortFindings([...kept, ...run.findings]),
    advice: previous.advice,
  };
}

/**
 * Which resolved findings a **scoped** run may not forget. A full run re-derives
 * everything, so its silence about a fixed finding means the fix holds and the
 * entry can go. A part-run's silence means nothing: dropping an entry outside
 * its scope would put a finding the user already fixed back on the open list —
 * the finding itself is still stored, inherited by the merge — and throw away
 * the token that undoes the fix.
 *
 * An entry the previous run no longer carries is kept for the same reason:
 * nothing here can place it inside or outside the scope, and keeping it only
 * costs one hidden finding staying hidden until a full run looks again.
 *
 * The same predicate as the merge (`rederivedBy`), and that is the point: the
 * merge keeps a finding of a kind nothing looked for, so this has to keep the
 * fix that resolved it — otherwise the finding comes back on the open list with
 * the token that would undo it thrown away.
 */
function keptFixed(
  fixed: readonly FixedFinding[],
  previous: StoredRun | null,
  run: StoredRun,
  scope: GardenerRunScope,
): FixedFinding[] {
  if (previous === null) return [...fixed];
  return fixed.filter((entry) => {
    const finding = previous.findings.find((candidate) => candidate.id === entry.id);
    return finding === undefined || !rederivedBy(run, scope, finding);
  });
}

/** What `save()` has to know about the run it is storing (021b, D3). */
export interface SaveRunOptions {
  /**
   * Did this call run the `checks` stage itself?
   *
   * `false` for a resumed run: its findings are the ones inherited from the
   * earlier stop, not re-derived here (`runWithProgress`). Nothing looked at
   * the files again, so nothing may forget that a fix already resolved one of
   * them — `fixed` stays. Defaults to `true`, so a caller that doesn't say is
   * treated as a run that checked, exactly as before this option existed.
   */
  checksReran?: boolean;
}

/**
 * The state after a run was stored — and the only place a decision is ever
 * forgotten.
 *
 * "Fine as is" and a snooze are decisions about a thing, not about a run, so
 * they outlive it; but one whose finding is gone would stay in the file
 * forever. `outlivesRun` decides that, and it only ever sees what a
 * **completed** run re-derived (`consideredBy`): a cancelled run never reaches
 * here, and its partial list must never be read as "everything else is gone".
 *
 * The list of resolved findings is cleared — what a fix actually resolved is
 * now determined by the new run. Only for a run that **re-derived** it,
 * though (`options.checksReran`, 021b): a resumed run carries the findings of
 * the stop it continues, so clearing there would put a finding the user fixed
 * in the meantime back on the open list, with nothing having re-checked it.
 *
 * A **partial** run (021b) prunes nothing: it stopped before reaching every
 * planned stage, so its silence about a finding says nothing about whether
 * that finding is still there — exactly the same reasoning `outlivesRun`
 * already applies to a single missing kind, only here for the whole run. A
 * **scoped** run (021c) is partial by the same gate (`isRunComplete`), and on
 * top of that keeps what it did not look at: its findings are laid over the
 * previous run's instead of replacing them (`mergeScoped`), and the fixes
 * outside its scope stay recorded (`keptFixed`). "Did not look at" is decided
 * by `run.checkedKinds` and not by the scope — a scope may name a kind no
 * stage of that run could produce (`rederivedBy`).
 *
 * Returns a new record; every field this run has nothing to say about is
 * carried over from `data` as it stands, so the caller replaces its record
 * whole instead of patching fields in an order that matters.
 */
export function applySavedRun(
  data: StoredGardener,
  run: StoredRun,
  options: SaveRunOptions = {},
): StoredGardener {
  const considered = consideredBy(run);
  const scope = narrowedScope(run.scope);
  /* The run being replaced, read before it is: both the merge and the kept
     fixes are statements about what that run had found. */
  const previous = data.run;
  const next: StoredGardener = {
    ...data,
    run: scope === undefined ? run : mergeScoped(previous, run, scope),
  };
  if (options.checksReran !== false) {
    next.fixed = scope === undefined ? [] : keptFixed(data.fixed, previous, run, scope);
  }
  if (isRunComplete(run)) {
    next.dismissed = data.dismissed.filter((id) => outlivesRun(id, considered, run.usedLlm));
    next.snoozed = Object.fromEntries(
      Object.entries(data.snoozed).filter(([id]) => outlivesRun(id, considered, run.usedLlm)),
    );
  }
  return next;
}
