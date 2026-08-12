/* Puffer für streamende LLM-Antworten. Jedes Stück aus `event:llm-stream`
   landet hier unter seiner `messageId`; erst wenn der Stream fertig ist,
   invalidiert `events.ts` die betroffene Query. So flackert nichts. */

import { useSyncExternalStore } from 'react';
import type { Citation } from '@shared/types';

export interface StreamState {
  text: string;
  done: boolean;
  citations: Citation[];
  error: string | null;
}

const EMPTY: StreamState = { text: '', done: false, citations: [], error: null };

let states: Readonly<Record<string, StreamState>> = {};
const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) notify();
}

export function appendStream(
  messageId: string,
  chunk: { delta: string; done: boolean; citations?: Citation[]; error?: string },
): void {
  const previous = states[messageId] ?? EMPTY;
  states = {
    ...states,
    [messageId]: {
      text: previous.text + chunk.delta,
      done: chunk.done,
      citations: chunk.citations ?? previous.citations,
      error: chunk.error ?? previous.error,
    },
  };
  emit();
}

export function clearStream(messageId: string): void {
  if (states[messageId] === undefined) return;
  const next = { ...states };
  delete next[messageId];
  states = next;
  emit();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

/** Liest den Puffer einer Nachricht. Ohne Stream: leerer Zustand. */
export function useLlmStream(messageId: string | null): StreamState {
  const getSnapshot = (): StreamState =>
    messageId === null ? EMPTY : (states[messageId] ?? EMPTY);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
