/** Storage shapes for a maintenance run and the file it holds them in — moved
 * verbatim out of `src/main/gardener-state.ts` (027, D1). */

import type {
  GardenerFinding,
  GardenerFindingKind,
  GardenerHealthContribution,
  GardenerRunScope,
  GardenerStageId,
} from '@shared/types';

/** A run as it is stored — before any filtering. */
export interface StoredRun {
  ranAt: string;
  usedLlm: boolean;
  /** All findings of the run, unfiltered. */
  findings: GardenerFinding[];
  /**
   * The IDs the run **re-derived**, before the model's audit dropped any of
   * them: the deterministic candidates plus the contradictions the model named.
   *
   * Why this exists next to `findings`: for `near-duplicate` and
   * `missing-page` the audit may reject a candidate the deterministic check
   * produced again unchanged. That rejection is the model's opinion about what
   * to *show* this run — it is not evidence that the vault condition is gone,
   * so it must not delete the user's decision about it (`save`). Missing or
   * empty — a file written before this field existed — means: fall back to
   * `findings`, exactly the behaviour from before.
   */
  consideredIds?: string[];
  advice: string[];
  /** `vaultSize` at the time of the run — the reference size for health. */
  size: number;
  /**
   * The stages this run intended to reach (021b), in `@core/gardener/progress`
   * ids. Missing means this run predates the field — it always ran to the
   * end, so it reads as complete (`isRunComplete`).
   */
  plan?: GardenerStageId[];
  /** The stages this run actually finished. Compared against `plan`. */
  completed?: GardenerStageId[];
  /**
   * The health score as it stood the moment a partial run was stopped —
   * copied from the report that was current then. `present()` uses this
   * instead of computing from the partial findings, so no number is ever
   * derived from half a check. Absent on a complete run; a later complete
   * run overwrites it away.
   */
  healthAsOf?: {
    ranAt: string;
    score: number;
    contributions: GardenerHealthContribution[];
  };
  /**
   * The part of the vault this run looked at (021c). Absent — the normal case
   * — means it looked at all of it. A scoped run is never complete
   * (`isRunComplete`), and its findings replace only its own slice of what the
   * run before it found (`save`).
   */
  scope?: GardenerRunScope;
  /**
   * The finding kinds a stage of **this** run actually looked for (021c) — not
   * the kinds its scope asked for. The difference is the whole point: a scope
   * naming `contradiction` on a vault with no model routed asks for a kind no
   * stage of that run can produce, so the run looked for nothing at all.
   *
   * `mergeScoped` stands on it. A kind nobody checked cannot be reported gone,
   * so the previous run's findings of that kind survive the merge — otherwise
   * one part-run over such a kind would silently delete every finding of it,
   * together with the "fine as is" and the snooze pointing at its id.
   *
   * Absent — a run stored before this field existed — reads as "everything the
   * scope named was looked at", which is what such a run did. An empty list is
   * a different statement: it looked for nothing.
   */
  checkedKinds?: GardenerFindingKind[];
}

/** A resolved finding with the token used to undo its fix. */
export interface FixedFinding {
  id: string;
  undoToken: string;
}

export interface StoredGardener {
  version: number;
  run: StoredRun | null;
  /** IDs the user has marked as "fine as is". */
  dismissed: string[];
  /**
   * Finding ID → calendar day from which it counts again (ISO). The same shape
   * and the same cleanup as the reminder snoozes in `overview-state.ts`: a day
   * that has passed is not a snooze anymore, so it doesn't stay in the file.
   */
  snoozed: Record<string, string>;
  /**
   * Findings a fix has written. They stay in the run and are only hidden —
   * that way `undoFix` can bring them back without checking again. A run that
   * re-derived them clears the list: then what's in the files is what counts.
   * A run that only inherited them does not (`save`, `SaveRunOptions`).
   */
  fixed: FixedFinding[];
}

/**
 * An empty state for a vault with no `gardener.json` yet. `version` is passed
 * in rather than read from a local constant: `GARDENER_STATE_VERSION` stays
 * defined in `src/main/gardener-state.ts` (it must keep working exactly as
 * before there), and this module has no reason to know that file's constants.
 */
export function empty(version: number): StoredGardener {
  return { version, run: null, dismissed: [], snoozed: {}, fixed: [] };
}
