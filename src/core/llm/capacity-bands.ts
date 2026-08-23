/* Turns `CapacityVerdict.maxComfortableParamsB` into a size class a person
   who has never heard the word "parameter" can still read: `'none'`,
   `'small'`, `'medium'` or `'large'`. Pure arithmetic, no Electron, no I/O —
   this is `src/core/`, imported by both main (which runs `judgeCapacity`)
   and, indirectly, the renderer's i18n key selection (035, D6).

   The three thresholds below are independently chosen band boundaries, not
   derived from `capacity.ts`'s `TIER_LANDMARKS_B` list — they were picked
   with that list's landmarks (3, 7, 8, 13, 34, 70) in mind as a rough guide
   for where a size class should end, but they are separate constants here.
   A future change to `TIER_LANDMARKS_B` does not automatically move these:
     - below 3B: nothing local realistically fits.
     - up to 8B: small, chat-sized local models.
     - up to 34B: medium.
     - at or above 34B: large. */

import type { CapacityVerdict } from '@shared/types';

export type CapacityBand = 'none' | 'small' | 'medium' | 'large';

/** Below this many comfortable billion-parameters, not even the smallest
 *  common landmark (3B) fits — there is nothing local to speak of. */
const NONE_BELOW_B = 3;

/** Below this, the machine carries small, chat-sized local models only
 *  (up to the 7B/8B landmarks). */
const SMALL_BELOW_B = 8;

/** Below this, the machine carries medium-sized local models (up to the
 *  13B landmark); at or above it, the next landmark (34B) makes it large. */
const MEDIUM_BELOW_B = 34;

/**
 * Pure banding over `verdict.maxComfortableParamsB` — never looks at
 * `limitingFactor` or `unknowns` itself, so a caller that already special-
 * cases `limitingFactor === 'unknown'` (the card does) can call this only
 * for the known case, or call it unconditionally and treat `'none'` the
 * same way it treats "nothing fits" today.
 */
export function describeCapacityBand(verdict: CapacityVerdict): CapacityBand {
  const comfortable = verdict.maxComfortableParamsB;
  if (comfortable === null || comfortable < NONE_BELOW_B) return 'none';
  if (comfortable < SMALL_BELOW_B) return 'small';
  if (comfortable < MEDIUM_BELOW_B) return 'medium';
  return 'large';
}
