/* Buffer for model-pull progress. Every chunk from `event:pull-progress`
   lands here under its `pullId`, mirroring `llm-stream.ts`'s pattern —
   a module-level store outside React so progress survives a component
   unmounting (e.g. navigating away from the models tab and back).

   The store never clears an entry on its own: only `clearPull` does, once
   the user dismisses a finished/failed bar. This is what makes "navigate
   away and back still shows the advanced position" true — nothing tied to
   a component's lifecycle can lose the state, because the card starting the
   pull doesn't have to keep holding the `pullId` in local state either: it
   can recover which pull(s) are in flight from `getAllPulls`/`useAllPulls`,
   keyed by `pullId` but also readable by `modelId`. */

import { useSyncExternalStore } from 'react';

export interface PullState {
  modelId: string;
  status: string;
  completed: number;
  total: number;
  done: boolean;
  error: string | null;
}

const EMPTY: PullState = {
  modelId: '',
  status: '',
  completed: 0,
  total: 0,
  done: false,
  error: null,
};

let states: Readonly<Record<string, PullState>> = {};
const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) notify();
}

export function appendPull(
  pullId: string,
  chunk: {
    modelId: string;
    status: string;
    completed: number;
    total: number;
    done: boolean;
    error?: string;
  },
): void {
  states = {
    ...states,
    [pullId]: {
      modelId: chunk.modelId,
      status: chunk.status,
      completed: chunk.completed,
      total: chunk.total,
      done: chunk.done,
      error: chunk.error ?? null,
    },
  };
  emit();
}

export function clearPull(pullId: string): void {
  if (states[pullId] === undefined) return;
  const next = { ...states };
  delete next[pullId];
  states = next;
  emit();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

/** Reads the progress for one pull. Without a pull: the empty/"not running" state. */
export function usePull(pullId: string | null): PullState {
  const getSnapshot = (): PullState => (pullId === null ? EMPTY : (states[pullId] ?? EMPTY));
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Snapshot of every pull the store currently knows about, keyed by `pullId`. */
export function getAllPulls(): Readonly<Record<string, PullState>> {
  return states;
}

/**
 * Every currently-known pull, keyed by `pullId`. This is how a component that
 * never held the `pullId` locally (e.g. because it remounted after the user
 * navigated away and back) finds out "is anything pulling right now" — it
 * iterates the values and matches by `modelId` instead of needing an id from
 * component state.
 */
export function useAllPulls(): Readonly<Record<string, PullState>> {
  return useSyncExternalStore(subscribe, getAllPulls, getAllPulls);
}
