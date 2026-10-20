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

   So the state lives here instead: module state, outside every component
   lifetime. There is no query cache that could go stale and no component
   lifetime that could take the state with it — a screen mounting mid-run reads
   the current answer synchronously, and one unmounting takes nothing away from
   the next.

   Where the live answer comes from changed in 074, D5. It used to be pushed in
   from `wireEvents` over `event:gardener-progress`; that channel is gone,
   because the run is now a real `WorkTask` in the shared registry
   (`kind: 'gardener'`, `lane: 'model'`) and travels with every other task over
   `event:work-tasks`. This store therefore derives itself from `tasks-store.ts`
   rather than being fed: the running gardener task's `detail` *is* the run's
   snapshot, written by `gardener-run-state.ts`'s `publish()`. One transport for
   all work in flight, and no second answer about the same run.

   That subscription is lazy, mirroring `tasks-store.ts`'s own "seed on the
   first subscriber, drop on the last unsubscribe" shape: it is taken out when
   this store's subscriber count goes 0 → 1 and given back when it falls to 0.
   Importing this module must not by itself trigger a `work:list` round-trip —
   a test that only imports a component would otherwise pay for a request it
   never asked for. Nothing is lost while unsubscribed: `tasks-store.ts` keeps
   being fed from `main.tsx` regardless, so the first subscriber back derives
   the current answer synchronously, on its very first render.

   One ordering hazard is left, and it is the reason for `generation`: the seed
   (`gardener:runStatus`) is an async round-trip, so its answer can land *after*
   a derivation that is newer than it — a run finishing right as a screen opens.
   A seed therefore only applies while nothing has arrived since it was issued;
   otherwise it is dropped, because the registry is the fresher truth. */

import { useSyncExternalStore } from 'react';
import type { GardenerRunProgress } from '@shared/types';
import { api } from './api';
import { getWorkTasks, getWorkTasksLoaded, subscribeWorkTasks } from './tasks-store';

/** One progress step of a maintenance run — the shared run-progress shape. */
export type GardenerProgress = GardenerRunProgress;

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
/** Hands the work queue's subscription back; `null` while nobody reads here. */
let unfollowWorkTasks: (() => void) | null = null;

function emit(): void {
  for (const notify of subscribers) notify();
}

/**
 * Re-derives the run from the work queue: the one running `'gardener'` task's
 * `detail`, or `null` when there is none. The cast is the same narrowing the
 * main process makes behind `gardener:runStatus` — only the gardener producer
 * (`gardener-run-state.ts`) ever writes `detail` on a task of that kind.
 *
 * A queue that has not answered yet says nothing rather than "no run": its `[]`
 * at that point means "not asked", not "asked, and nothing is going", and
 * applying it would wipe a snapshot the `gardener:runStatus` seed may already
 * have landed correctly (`tasks-store.ts`'s `loaded`, 071/072 D4).
 */
function deriveFromWorkTasks(): void {
  if (!getWorkTasksLoaded()) return;
  const task = getWorkTasks().find(
    (entry) => entry.kind === 'gardener' && entry.state === 'running',
  );
  /* Bumped even when the value does not change: what a pending seed has to
     know is that a fresher answer arrived, not that it moved the bar. */
  generation += 1;
  apply((task?.detail as GardenerRunProgress | undefined) ?? null);
}

/** The lazy half of the store — see the header for why it is lazy. */
function subscribe(notify: () => void): () => void {
  if (subscribers.size === 0) {
    unfollowWorkTasks = subscribeWorkTasks(deriveFromWorkTasks);
    /* The queue does not replay on subscribe, and it may well have moved on
       while nobody was reading here — so derive once, right now, instead of
       waiting for the next event about a run that is already halfway. */
    deriveFromWorkTasks();
  }
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
    if (subscribers.size > 0) return;
    unfollowWorkTasks?.();
    unfollowWorkTasks = null;
  };
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
 * Sets the snapshot directly. No production caller since 074, D5 — the live
 * answer is derived from the work queue now (see the header), not pushed in.
 * Kept as the one way to put this module-singleton store back into a known
 * state without a mounted subscriber, which is what every test file that
 * outlives its own components needs in its `beforeEach`; removing it would take
 * a piece of the store's long-standing exported surface away for nothing.
 * A component must never call it, or its lifetime would matter again.
 */
export function setGardenerProgress(next: GardenerProgress): void {
  /* Bumped even when the value does not change: what a pending seed has to
     know is that an answer arrived, not that it moved the bar. */
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
 * `gardener:runStatus` reads the very same registry entry this store derives
 * from (074, D2), so the two can only agree — the seed is simply the faster of
 * the two for a screen that opens mid-run, since it does not wait for the work
 * queue's own first answer. The answer is dropped when a fresher one has landed
 * since it was issued — see the header.
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
