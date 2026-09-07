/* The work queue, live — every long-running task the app runs on the vault
   (condense, day close, the gardener, ingest; story 072 only builds the
   plumbing, no feature enqueues into it yet), kept in module state exactly
   like `gardener-progress.ts` and for the same reason (see that file's
   header): a screen mounting mid-run must see the current queue on its very
   first render, not the next `event:work-tasks` tick that `bridge().on` does
   not replay.

   Seeded once via `work:list` on the first subscribe after the last
   unsubscribe — not gated behind "vault ready" the way `gardener-progress`'s
   seed is, because the registry behind `work:list` is session-scoped, not
   vault-scoped (`main/work-queue.ts`): it always has an honest answer, empty
   list or not, even before a vault is open. "First subscribe" rather than
   "first ever subscribe": `AppShell` mounts exactly once for the app's whole
   life in production, so in practice this fires once — but a component tree
   that unmounts and remounts (every render in a test, an HMR reload) gets a
   fresh seed rather than a permanently stale "already seeded" flag with no
   way to ask again.

   The same ordering hazard as `gardener-progress` applies, and is guarded the
   same way: the seed is an async round-trip, so a live event can land after
   it was issued but before it resolves. `generation` counts live events; a
   seed whose answer would land behind a fresher live event is dropped instead
   of clobbering it. */

import { useSyncExternalStore } from 'react';
import type { WorkTask } from '@shared/types';
import { api } from './api';

let tasks: WorkTask[] = [];
/** Counts live events; a seed compares against it — see the header. */
let generation = 0;
/**
 * Has the queue's first real answer landed yet — from the seed's response or
 * from a live event arriving before it (071/072, D4)? `tasks` itself cannot
 * say this: it starts at `[]` and an honestly empty queue also reads `[]`, so
 * the tasks screen's empty state (AC7 — "empty queue shows the empty state,
 * not a spinner, but never before the first answer") needs this second
 * signal to tell "nothing yet" from "asked, and there is nothing" apart.
 */
let loaded = false;

const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) notify();
}

/** Records one live `event:work-tasks`. Called from `main.tsx` only — a
    component must never feed this store, or its lifetime would matter again. */
export function setWorkTasks(next: WorkTask[]): void {
  generation += 1;
  tasks = next;
  loaded = true;
  emit();
}

/** The work queue as it currently stands. */
export function getWorkTasks(): WorkTask[] {
  return tasks;
}

/** Whether the queue has answered at least once — see `loaded` above. */
export function getWorkTasksLoaded(): boolean {
  return loaded;
}

/** Fetches the queue once for whichever subscriber is first back — the case
    that a task was already queued or running before anything was there to
    hear its events. Dropped (not applied) if a live event has landed since
    it was issued; see the header. */
function seed(): void {
  const issuedAt = generation;
  void api.work
    .list()
    .then((list) => {
      if (generation !== issuedAt) return;
      tasks = list;
      loaded = true;
      emit();
    })
    .catch(() => {
      /* A failed seed isn't worth a broken screen: the queue simply stays
         empty until the next live event says otherwise. `loaded` still
         flips — there is nothing more to wait for synchronously, and the
         honest answer without one is "empty", not an indefinite spinner. */
      loaded = true;
      emit();
    });
}

function subscribe(notify: () => void): () => void {
  if (subscribers.size === 0) seed();
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

/** The work queue, live. A screen mounting mid-run reads the current answer
    synchronously on its first render — no event has to arrive first. */
export function useWorkTasks(): WorkTask[] {
  return useSyncExternalStore(subscribe, getWorkTasks, getWorkTasks);
}

/** Has the queue answered at least once? Gates the tasks screen's empty
    state (AC7) — see `loaded` above for why `tasks.length === 0` alone
    cannot tell that apart from "not asked yet". */
export function useWorkTasksLoaded(): boolean {
  return useSyncExternalStore(subscribe, getWorkTasksLoaded, getWorkTasksLoaded);
}

/**
 * Test-only: puts this module-singleton store back to its just-imported
 * state (`tasks = []`, `loaded = false`). `loaded` has no other way back to
 * `false` in production — a real session only ever moves forward from "not
 * answered yet" to "answered" — so a test file with more than one test that
 * cares about the pre-answer gap (AC7) would otherwise only pass when it
 * happens to run first in the file (072 review, finding 5). Not exported
 * from the module's public surface used by app code, only from here for
 * `beforeEach` hooks.
 */
export function resetWorkTasksStoreForTests(): void {
  tasks = [];
  generation += 1;
  loaded = false;
}
