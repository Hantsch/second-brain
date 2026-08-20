/* Session-scoped toggle: "show only open (unfinished) days" in the journal
   list. A module-level variable, not a setting — it survives a component
   unmount/remount within the running session but resets on app restart,
   exactly the `useSyncExternalStore` idiom `llm-stream.ts` uses for its
   buffer. */

import { useSyncExternalStore } from 'react';

let openOnly = false;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) notify();
}

/** Sets the toggle and notifies every subscriber. */
export function setOpenOnly(value: boolean): void {
  if (openOnly === value) return;
  openOnly = value;
  emit();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

/** Reads the current toggle value, live. */
export function useOpenOnly(): boolean {
  const getSnapshot = (): boolean => openOnly;
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
