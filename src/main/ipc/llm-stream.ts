/* The main process's single streaming path.
 *
 * Two areas answer piece by piece — the question to the archive (`chat:ask`)
 * and the coaching turn (`journal:coach`). Both send `event:llm-stream`
 * under a message id and both need an abort to go with it. That's exactly
 * why the mechanism lives here and not twice: two versions drifted apart at
 * the first edge case (one area reports completion, the other doesn't — and
 * the renderer then waits forever).
 *
 * Three rules the mechanism enforces:
 *
 * - **Every turn ends.** `end()` sends the completion event and unregisters
 *   the id. Anyone who uses `run()` can't forget it.
 * - **`abort` only knows registered ids.** A foreign or expired id changes
 *   nothing — it's not an error, just nothing left to do.
 * - **Reporting never throws.** If nobody is listening (window closed,
 *   renderer reloaded), the event runs into the void. An error from that
 *   would lose the write that just succeeded.
 */

import type { Citation } from '@shared/types';
import { toIpcError } from './errors';
import type { Services } from '../services';

/** What can additionally hang off a completion event. */
export interface StreamExtra {
  citations?: Citation[];
  /** `IpcError['code']` or an `LlmUnavailable.reason` — the renderer formulates the wording. */
  error?: string;
}

/** Report a chunk. `done: true` ends the stream for the renderer. */
export type StreamSink = (delta: string, done: boolean, extra?: StreamExtra) => void;

/** A registered turn: id, abort signal, sink. */
export interface StreamRun {
  threadId: string;
  messageId: string;
  signal: AbortSignal;
  /** An intermediate chunk. Shorter than `send(delta, false)` and not to be confused with it. */
  delta: (text: string) => void;
  /** The completion: reports the event and frees the id. Calling twice is a no-op. */
  end: (extra?: StreamExtra, text?: string) => void;
}

export interface LlmStreams {
  /** Register a turn. The caller determines the id (it's in the response). */
  begin: (threadId: string, messageId: string) => StreamRun;
  /**
   * Run a turn in the background. The body ends it itself (`run.end(...)`),
   * because only it knows what hangs off the completion; if it throws, the
   * error becomes a completion event with `code`. Either way, the turn is
   * finished afterward and the id is freed — it can't be forgotten.
   *
   * `onFailure` is the chance to clean up before the failure event (for
   * instance, bringing the index up to date because the user's line is
   * already in the file).
   */
  run: (
    run: StreamRun,
    body: (run: StreamRun) => Promise<void>,
    options?: { onFailure?: (code: string) => Promise<void> | void; label?: string },
  ) => void;
  /** Abort a running turn; an unknown id changes nothing. */
  abort: (messageId: string) => void;
}

/* Chat and journal each own a private `llmStreams()` instance, so "is any
   response streaming" can't be answered from one instance's `running` map.
   A count per id (not a bare Set) keeps two instances that happen to use the
   same id from clearing each other's entry. */
const activeStreams = new Map<string, number>();

/** True while any turn on any instance has begun and not yet ended. */
export function isAnyLlmStreaming(): boolean {
  return activeStreams.size > 0;
}

export function llmStreams(services: Services): LlmStreams {
  /** Running responses per message id — `*:abort` reaches in here. */
  const running = new Map<string, AbortController>();

  const begin = (threadId: string, messageId: string): StreamRun => {
    const controller = new AbortController();
    running.set(messageId, controller);
    activeStreams.set(messageId, (activeStreams.get(messageId) ?? 0) + 1);
    let ended = false;

    const send: StreamSink = (delta, done, extra = {}) => {
      services.sendEvent('event:llm-stream', { messageId, threadId, delta, done, ...extra });
    };

    return {
      threadId,
      messageId,
      signal: controller.signal,
      delta: (text) => {
        if (!ended) send(text, false);
      },
      end: (extra = {}, text = '') => {
        if (ended) return;
        ended = true;
        running.delete(messageId);
        /* `ended` makes this one-shot per run, so every begin is matched by
           exactly one decrement on every end path (success, error, abort). */
        const left = (activeStreams.get(messageId) ?? 1) - 1;
        if (left > 0) activeStreams.set(messageId, left);
        else activeStreams.delete(messageId);
        send(text, true, extra);
      },
    };
  };

  return {
    begin,

    run: (run, body, options = {}) => {
      void (async () => {
        try {
          await body(run);
          /* In case the body didn't do it itself: `end` is one-shot, a
             second call is a no-op. This way every turn ends. */
          run.end();
        } catch (error) {
          const failure = toIpcError(error);
          /* Clean up first, then report: the completion event reloads in
             the renderer, and by then whatever was already written has to
             be there. */
          await options.onFailure?.(failure.code);
          run.end({ error: failure.code });
          if (failure.code === 'unknown') {
            console.error(`[${options.label ?? 'llm'}] Antwort fehlgeschlagen:`, error);
          }
        }
      })();
    },

    abort: (messageId) => {
      running.get(messageId)?.abort();
    },
  };
}
