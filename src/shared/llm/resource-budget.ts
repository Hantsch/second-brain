/**
 * Validation for the resource budget percentage (029): the share of this
 * machine's RAM/VRAM the app may plan model recommendations against, so the
 * user keeps headroom for everything else running on the machine.
 *
 * Lives in `src/shared/` — like `vram-override.ts` — rather than `src/core/`,
 * because `tsconfig.web.json` excludes `src/core` and the renderer needs to
 * run the exact same rule main does before a value ever reaches the IPC
 * boundary.
 *
 * Mapping of rejected input to error key:
 * - empty (after trim)          → 'empty'
 * - not parseable as a number    → 'not-a-number'
 * - fractional (not an integer)  → 'not-a-number' (not a whole percent figure)
 * - below the floor, incl. 0 and
 *   negative                     → 'out-of-range'
 * - above the ceiling            → 'out-of-range'
 */

/** Default share of RAM/VRAM the app may plan against, absent a user choice. */
export const DEFAULT_RESOURCE_BUDGET_PERCENT = 80;
/** 10%: the floor. Below this, nothing of any size is plannable — this is
    intentional, not arbitrary: a budget that small can't fit even the
    smallest model worth recommending, so it stops being a useful input. */
export const MIN_RESOURCE_BUDGET_PERCENT = 10;
/** 100%: the ceiling — the whole machine, no headroom reserved. */
export const MAX_RESOURCE_BUDGET_PERCENT = 100;

export type ResourceBudgetParseError = 'empty' | 'not-a-number' | 'out-of-range';

export type ResourceBudgetParseResult =
  { ok: true; valuePercent: number } | { ok: false; error: ResourceBudgetParseError };

/** Parses and validates a resource budget percentage entered as text. Never throws. */
export function parseResourceBudgetPercent(raw: string): ResourceBudgetParseResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: 'empty' };

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { ok: false, error: 'not-a-number' };
  if (!Number.isInteger(parsed)) return { ok: false, error: 'not-a-number' };

  if (parsed < MIN_RESOURCE_BUDGET_PERCENT) return { ok: false, error: 'out-of-range' };
  if (parsed > MAX_RESOURCE_BUDGET_PERCENT) return { ok: false, error: 'out-of-range' };

  return { ok: true, valuePercent: parsed };
}

/** Pure numeric check for the same rule, for use at the IPC boundary in main. */
export function isValidResourceBudgetPercent(n: number): boolean {
  return (
    Number.isInteger(n) && n >= MIN_RESOURCE_BUDGET_PERCENT && n <= MAX_RESOURCE_BUDGET_PERCENT
  );
}
