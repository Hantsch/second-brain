/* The ways out of a finding — which ones exist, in which order.

   A card must never end in a dead end where "this is not a problem" is the
   only button left: that turns the dismiss button into the only action, and
   therefore into a habit. That's why this list lives here rather than in the
   card — it is the commitment, not the presentation, and a test can read it
   without a DOM.

   Two decisions:
   - **`handled` always exists.** "Dealt with it in the files" writes nothing;
     it re-checks. That works for every finding, even one with no fix.
   - **A hidden finding gets one way back instead of two ways out.** Someone
     who already said "this is not a problem" or "not now" doesn't need both
     a second time — they need `restore`. */

import type { GardenerFinding, GardenerHiddenFinding } from '@shared/types';

/**
 * `fix` writes (or opens, where the fix writes nothing), `handled` re-checks,
 * `snooze` puts it back for a day, `dismiss` takes the finding permanently out
 * of the count, `restore` brings it back, `open` only opens the file.
 */
export type FindingExit = 'fix' | 'handled' | 'snooze' | 'dismiss' | 'restore' | 'open';

/** Is the finding already hidden — and why? `null`: it's in the open list. */
export type HiddenState = GardenerHiddenFinding['state'] | null;

/** This finding's ways out, in the order the card shows them. */
export function exitsOf(finding: GardenerFinding, hidden: HiddenState = null): FindingExit[] {
  const exits: FindingExit[] = [];
  if (finding.fix !== null) exits.push('fix');
  exits.push('handled');
  if (hidden === null) exits.push('snooze', 'dismiss');
  else exits.push('restore');
  /* Without an affected file there's nothing to open. */
  if (finding.paths.length > 0) exits.push('open');
  return exits;
}
