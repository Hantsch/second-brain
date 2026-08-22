/** Scope predicates for narrowing a maintenance run to a kind or module — moved
 * verbatim out of `src/main/gardener-state.ts` (027, D1). */

import type { GardenerFinding, GardenerFindingKind, GardenerRunScope } from '@shared/types';
import type { StoredRun } from './run-record';

/**
 * The scope a run actually narrowed to, or `undefined` for a run over the whole
 * vault. One definition for every reader — `isRunComplete`, `save`, `present`:
 * a `scope` that narrows nothing is a full run, no matter which caller built
 * it. Without this, a `{ kinds: [] }` from anywhere would be a run that is
 * forever incomplete and yet covered everything.
 */
export function narrowedScope(scope: GardenerRunScope | undefined): GardenerRunScope | undefined {
  if (scope === undefined) return undefined;
  if ((scope.kinds ?? []).length === 0 && scope.module === undefined) return undefined;
  return scope;
}

/**
 * Did this run re-derive that finding — i.e. does it fall inside the scope? The
 * axes narrow together, an axis the scope does not name narrows nothing.
 *
 * `module` is compared with `===` and not by truthiness: `null` is a value here
 * ("the findings without a module"), `undefined` is the absent axis.
 *
 * This is the predicate the merge in `save` stands on, and the reason it is one
 * named function: too wide and a part-run deletes findings nothing looked at,
 * too narrow and the same finding ends up stored twice.
 */
export function inScope(finding: GardenerFinding, scope: GardenerRunScope): boolean {
  return scopeAdmits(scope, finding.kind, finding.module);
}

/**
 * Could a finding of this kind — and, where it is already known, of this module
 * — fall inside the scope at all? The axes narrow together, an axis the scope
 * does not name narrows nothing.
 *
 * An omitted `module` means "not known yet": that is the question a stage asks
 * *before* it runs, when nobody can say which module its findings will land in,
 * and then only the kind axis decides. Passing `null` is the opposite — a value,
 * "the findings without a module".
 *
 * One predicate for three questions: may this stage run at all
 * (`ipc/gardener-deps.ts`), does this finding belong to the run (`inScope`), and
 * may the merge forget it (`rederivedBy`). Two of them differing by a line is
 * exactly how a part-run starts deleting what nothing looked at.
 */
export function scopeAdmits(
  scope: GardenerRunScope | undefined,
  kind: GardenerFindingKind,
  module?: string | null,
): boolean {
  if (scope === undefined) return true;
  const kinds = scope.kinds ?? [];
  if (kinds.length > 0 && !kinds.some((entry) => entry === kind)) return false;
  return scope.module === undefined || module === undefined || scope.module === module;
}

/**
 * Complete ⟺ `completed` covers every stage of `plan`, **and** the run looked
 * at the whole vault. A run stored before this field existed has no `plan` at
 * all — it always ran start to finish, so it reads as complete rather than as a
 * run that is somehow always partial.
 *
 * A scoped run (021c) is never complete, however far through its stages it got:
 * it re-derived one slice of the vault and said nothing about the rest. Hanging
 * that off this one gate is the point — everything 021b built for a stopped run
 * (no pruning of a decision the run never looked for, the frozen score instead
 * of a number computed over a part) then applies to a part-run unchanged.
 */
export function isRunComplete(run: StoredRun): boolean {
  if (narrowedScope(run.scope) !== undefined) return false;
  if (run.plan === undefined) return true;
  const completed = new Set(run.completed ?? []);
  return run.plan.every((stage) => completed.has(stage));
}
