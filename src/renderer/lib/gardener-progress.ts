/* What the running maintenance run is doing — module state, outside React.

   Twice this lived inside React, and both halves lost the answer exactly when
   it was needed (042). The seed was a `useQuery` with `staleTime: Infinity` and
   `gcTime: 0`, held alive forever by the rail's permanent indicator: a
   remounted screen got handed the `null` from boot and never refetched. And the
   live layer was `useState` in each hook instance, so unmounting a screen threw
   it away — `bridge().on` does not replay past events, so the next mount saw
   nothing at all until the following tick, which during the `audit` stage can
   be many seconds out. Together: navigate away mid-run, come back, and the bar
   is gone.

   So the state lives here instead, exactly like `pullStore.ts`: fed by
   `wireEvents`, which `main.tsx` wires once and which never unmounts. There is
   no query cache that could go stale and no component lifetime that could take
   the state with it — a screen mounting mid-run reads the current answer
   synchronously, and one unmounting takes nothing away from the next.

   One ordering hazard is left, and it is the reason for `generation`: the seed
   (`gardener:runStatus`) is an async round-trip, so its answer can land *after*
   a live event that is newer than it — a run finishing right as a screen opens.
   A seed therefore only applies while nothing has arrived since it was issued;
   otherwise it is dropped, because the event is the fresher truth. */

import { useSyncExternalStore } from 'react';
import type { IpcEvents } from '@shared/ipc';
import { api } from './api';

/** One progress step of a maintenance run — the event's payload, widened. */
export type GardenerProgress = IpcEvents['event:gardener-progress'];

let progress: GardenerProgress | null = null;
/**
 * Did the user stop a run in this session (021b/042, D4)? Not derivable from
 * `progress`: a stopped run reports `running: false` like a finished one, and
 * the difference is what the screen offers afterwards ("continue" vs. nothing).
 * Session state on purpose — it dies with the window, like the run itself.
 */
let stoppedInSession = false;
/** Counts live events; a seed compares against it. See the header. */
let generation = 0;
/** Counts issued seeds, so two overlapping ones cannot resolve out of order. */
let seedsIssued = 0;

const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) notify();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

/**
 * A snapshot that reports `running: false` is not a run — it is the last thing
 * a finished, cancelled or failed one said. Normalizing in one place keeps
 * every caller from having to remember that, live feed and seed alike.
 */
function apply(next: GardenerProgress | null): void {
  const value = next !== null && next.running ? next : null;
  /* A run genuinely going now makes a stale "stopped" flag from before moot,
     whatever kind of run this is — resumed, freshly started, or scoped. This
     is the one place every entry point funnels through (live feed and seed
     alike), so clearing it here catches starts a UI callback never sees (a
     "check now" click, or a resume from the maintenance screen's own report
     banner) — unlike clearing it from individual callbacks, which only catch
     the ones written to do so (042 review, finding 1). */
  const stoppedChanged = value !== null && stoppedInSession;
  if (stoppedChanged) stoppedInSession = false;
  if (value === progress && !stoppedChanged) return;
  progress = value;
  emit();
}

/**
 * Records one live `event:gardener-progress`. Called from `wireEvents` only —
 * a component must never feed this store, or its lifetime would matter again.
 */
export function setGardenerProgress(next: GardenerProgress): void {
  /* Bumped even when the value does not change: what a pending seed has to
     know is that an event arrived, not that it moved the bar. */
  generation += 1;
  apply(next);
}

/**
 * Whether the current "vault is ready" span has already triggered a seed
 * (042, D2). Reset the moment `ready` drops, so a later reopen seeds again —
 * the guard is per span, not per app session.
 */
let seededForCurrentReadySpan = false;

/**
 * Asks the main process once whether a run is going right now, for the case
 * that nobody was listening when it started (vault open, `gardener.runOnOpen`).
 * The answer is dropped when a live event has landed since — see the header.
 */
export async function seedGardenerProgress(): Promise<void> {
  const issuedAt = generation;
  const seedId = (seedsIssued += 1);
  let snapshot: GardenerProgress | null;
  try {
    snapshot = await api.gardener.runStatus();
  } catch {
    /* A failed status read is not worth a broken screen: without an answer the
       bar simply stays hidden until the next live event says otherwise. */
    return;
  }
  if (generation !== issuedAt || seedId !== seedsIssued) return;
  apply(snapshot);
}

/**
 * Drives `seedGardenerProgress` off `useVaultReady()` (042, D2): called from
 * every mount of `useSeedGardenerProgress` on every render, but the module
 * flag above makes only the first call per ready-span actually issue the
 * round-trip — a screen opened mid-run and a screen opened a moment later
 * both read the same seeded state, neither doubles the request. `ready` false
 * means the vault just closed or has not opened yet; either way the next open
 * deserves a fresh seed, so the flag resets instead of firing. It also clears
 * `stoppedInSession`: a stopped run belongs to the vault that just closed,
 * and must not offer "continue" once a different vault is open (042 review,
 * N2).
 */
export function seedGardenerProgressOnReady(ready: boolean): void {
  if (!ready) {
    seededForCurrentReadySpan = false;
    /* A vault closing or switching leaves nothing behind to "continue" —
       whatever was stopped belonged to the vault that just went away. Without
       this, `stoppedInSession` would survive into the next vault and offer to
       resume a run that isn't its own (042 review, N2). */
    dismissGardenerStopped();
    return;
  }
  if (seededForCurrentReadySpan) return;
  seededForCurrentReadySpan = true;
  void seedGardenerProgress();
}

/** What the running run last reported; `null` means: none is going. */
export function getGardenerProgress(): GardenerProgress | null {
  return progress;
}

/**
 * The progress of the running maintenance run. `null` means: none is running
 * right now. Reads module state, so a screen that mounts mid-run has the
 * current answer on its first render.
 */
export function useGardenerProgress(): GardenerProgress | null {
  return useSyncExternalStore(subscribe, getGardenerProgress, getGardenerProgress);
}

function getGardenerStopped(): boolean {
  return stoppedInSession;
}

/** Remembers that the user stopped a run — the screen's "continue" offer. */
export function markGardenerStopped(): void {
  if (stoppedInSession) return;
  stoppedInSession = true;
  emit();
}

/** Takes the offer back, once it has been used or waved away. */
export function dismissGardenerStopped(): void {
  if (!stoppedInSession) return;
  stoppedInSession = false;
  emit();
}

/** Was a run stopped by the user in this session? */
export function useGardenerStopped(): boolean {
  return useSyncExternalStore(subscribe, getGardenerStopped, getGardenerStopped);
}
