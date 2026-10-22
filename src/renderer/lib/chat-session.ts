/* What a conversation keeps while no screen shows it.

   An answer streams in the main process and its chunks land in the
   module-level buffer of `llm-stream.ts` whether anyone watches or not. What
   used to get lost on leaving was the other half: which message of which
   thread is still being written. That lived in the ask panel's state, so
   coming back showed the question without its answer until the file arrived.
   Kept here, a panel that mounts again picks the running answer up where the
   buffer stands — the same thread, the same stream, the cancel button back.

   The chats screen's last open thread lives here for the same reason: leaving
   the screen and coming back through the nav rail (an address without `?t=`)
   lands in the conversation that was open, not on an empty page.

   Renderer memory only. Nothing of it is content, and a reload starts fresh —
   by then the main process has written the answer, or is still writing it and
   the thread reloads once `event:llm-stream` reports it done. */

import { useSyncExternalStore } from 'react';
import type { AskAnswer } from '@shared/ipc';

let running: Readonly<Record<string, AskAnswer>> = {};
let lastThread: string | null = null;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) notify();
}

/** Records the answer that was just requested — the thread's latest, replacing any earlier one. */
export function trackAnswer(answer: AskAnswer): void {
  running = { ...running, [answer.threadId]: answer };
  emit();
}

/** Forgets everything about a thread that no longer exists. */
export function forgetThread(threadId: string): void {
  if (lastThread === threadId) lastThread = null;
  if (running[threadId] === undefined) return;
  const next = { ...running };
  delete next[threadId];
  running = next;
  emit();
}

/** The thread's latest requested answer — streaming, done, or already a file. */
export function useTrackedAnswer(threadId: string | null): AskAnswer | null {
  const getSnapshot = (): AskAnswer | null =>
    threadId === null ? null : (running[threadId] ?? null);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** The thread the chats screen showed last; `null` after "new chat". */
export function lastChatThread(): string | null {
  return lastThread;
}

export function rememberChatThread(threadId: string | null): void {
  lastThread = threadId;
}

/** Back to a fresh session — the store outlives every component, so tests reset it. */
export function resetChatSession(): void {
  running = {};
  lastThread = null;
  emit();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}
