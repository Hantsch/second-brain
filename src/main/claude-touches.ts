/* External work traces — the bridge between agent sessions (Claude Code and
   Codex CLI) and the index.

   `IndexService.open({ externalTouches })` takes a `ReadonlyMap` and re-reads it
   on **every** run. That's why it's the same map for the lifetime of a vault:
   the first session run fills it, a `refresh()` afterward carries `lastTouch`,
   `lastTouchSource`, and `stale` forward. Two maps would be two truths — one in
   the index, one in the dashboard.

   It's cleared when opening a different vault: the old vault's slugs would
   otherwise point at projects that don't exist there. */

import type { ExternalTouch } from '@core/index/types';

const touches = new Map<string, ExternalTouch>();

/** The map itself — only `core-bridge.ts` passes it to the index. */
export function externalTouches(): Map<string, ExternalTouch> {
  return touches;
}

/** Clears the map and returns it. Used when opening a vault. */
export function resetExternalTouches(): Map<string, ExternalTouch> {
  touches.clear();
  return touches;
}

/**
 * Applies the traces from a session run. Return value: did anything change?
 * Only then does the index need to catch up — otherwise every dashboard call
 * would be a full index run.
 */
export function applyExternalTouches(next: ReadonlyMap<string, ExternalTouch>): boolean {
  let changed = false;
  for (const [slug, touch] of next) {
    const known = touches.get(slug);
    if (known?.at === touch.at && known.source === touch.source) continue;
    touches.set(slug, touch);
    changed = true;
  }
  /* Whatever the run no longer knows about disappears: a deleted history file
     must not claim a `lastTouch` that no longer exists. */
  for (const slug of [...touches.keys()]) {
    if (next.has(slug)) continue;
    touches.delete(slug);
    changed = true;
  }
  return changed;
}

/**
 * Both CLIs' traces as one map — the only shape `applyExternalTouches` may be
 * fed. It replaces the map wholesale, so applying Claude's and Codex's traces
 * one after the other would let the second erase the first.
 *
 * Per slug the newer `at` wins; on an exact tie (or an unreadable stamp) `a`
 * wins. Neither input is changed.
 */
export function mergeTouches(
  a: ReadonlyMap<string, ExternalTouch>,
  b: ReadonlyMap<string, ExternalTouch>,
): Map<string, ExternalTouch> {
  const merged = new Map(a);
  for (const [slug, touch] of b) {
    const known = merged.get(slug);
    if (known === undefined || Date.parse(touch.at) > Date.parse(known.at)) merged.set(slug, touch);
  }
  return merged;
}
