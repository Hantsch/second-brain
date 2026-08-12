/* Der eine Streaming-Weg des Hauptprozesses.
 *
 * Zwei Bereiche antworten stückweise — die Frage an das Archiv (`chat:ask`) und
 * die Coaching-Runde (`journal:coach`). Beide schicken `event:llm-stream` unter
 * einer Nachrichten-Marke und beide brauchen einen Abbruch dazu. Genau deshalb
 * steht die Mechanik hier und nicht zweimal: zwei Fassungen liefen beim ersten
 * Sonderfall auseinander (ein Bereich meldet den Abschluss, der andere nicht —
 * und der Renderer wartet dann für immer).
 *
 * Drei Regeln, die die Mechanik erzwingt:
 *
 * - **Jede Runde endet.** `end()` schickt das Abschluss-Ereignis und meldet die
 *   Marke ab. Wer `run()` benutzt, kann es nicht vergessen.
 * - **`abort` kennt nur angemeldete Marken.** Eine fremde oder abgelaufene Marke
 *   ändert nichts — sie ist kein Fehler, nur nichts mehr da.
 * - **Melden wirft nie.** Hört niemand zu (Fenster zu, Renderer neu geladen),
 *   läuft das Ereignis ins Leere. Ein Fehler daraus würde den Schreibvorgang
 *   verlieren, der gerade gelungen ist.
 */

import type { Citation } from '@shared/types';
import { toIpcError } from './errors';
import type { Services } from '../services';

/** Was an einem Abschluss-Ereignis zusätzlich hängen kann. */
export interface StreamExtra {
  citations?: Citation[];
  /** `IpcError['code']` oder ein `LlmUnavailable.reason` — der Renderer formuliert. */
  error?: string;
}

/** Ein Stück melden. `done: true` beendet den Stream für den Renderer. */
export type StreamSink = (delta: string, done: boolean, extra?: StreamExtra) => void;

/** Eine angemeldete Runde: Marke, Abbruchsignal, Sink. */
export interface StreamRun {
  threadId: string;
  messageId: string;
  signal: AbortSignal;
  /** Ein Zwischenstück. Kürzer als `send(delta, false)` und nicht zu verwechseln. */
  delta: (text: string) => void;
  /** Der Abschluss: meldet das Ereignis und gibt die Marke frei. Zweimal ist ein Nichts. */
  end: (extra?: StreamExtra, text?: string) => void;
}

export interface LlmStreams {
  /** Eine Runde anmelden. Die Marke bestimmt der Aufrufer (sie steht in der Antwort). */
  begin: (threadId: string, messageId: string) => StreamRun;
  /**
   * Eine Runde im Hintergrund laufen lassen. Der Rumpf beendet sie selbst
   * (`run.end(...)`), weil nur er weiß, was am Abschluss hängt; wirft er, wird der
   * Fehler ein Abschluss-Ereignis mit `code`. In beiden Fällen ist die Runde danach
   * beendet und die Marke frei — vergessen kann man es nicht.
   *
   * `onFailure` ist die Gelegenheit, vor dem Fehler-Ereignis aufzuräumen (etwa den
   * Index nachzuziehen, weil die Nutzerzeile schon in der Datei steht).
   */
  run: (
    run: StreamRun,
    body: (run: StreamRun) => Promise<void>,
    options?: { onFailure?: (code: string) => Promise<void> | void; label?: string },
  ) => void;
  /** Laufende Runde abbrechen; unbekannte Marke ändert nichts. */
  abort: (messageId: string) => void;
}

export function llmStreams(services: Services): LlmStreams {
  /** Laufende Antworten je Nachrichten-Marke — `*:abort` greift hier zu. */
  const running = new Map<string, AbortController>();

  const begin = (threadId: string, messageId: string): StreamRun => {
    const controller = new AbortController();
    running.set(messageId, controller);
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
          /* Falls der Rumpf es nicht selbst getan hat: `end` ist einmalig, ein
             zweiter Aufruf ist ein Nichts. So endet jede Runde. */
          run.end();
        } catch (error) {
          const failure = toIpcError(error);
          /* Erst aufräumen, dann melden: das Abschluss-Ereignis lädt im Renderer
             neu, und dann muss dastehen, was schon geschrieben ist. */
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
