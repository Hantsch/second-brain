/* Buffer for streaming LLM responses. Every chunk from `event:llm-stream`
   lands here under its `messageId`; only once the stream is done does
   `events.ts` invalidate the affected query. This way nothing flickers. */

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

/** Reads the buffer for a message. Without a stream: empty state. */
export function useLlmStream(messageId: string | null): StreamState {
  const getSnapshot = (): StreamState =>
    messageId === null ? EMPTY : (states[messageId] ?? EMPTY);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
