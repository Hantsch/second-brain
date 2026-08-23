/* Pulling a model into the local Ollama runtime (019c, D4).
 *
 * The last step of the guided flow: D1 judged the machine, D2 fetched the
 * installer, D3 started the runtime — and this one fills it, so the user never
 * has to type `ollama pull`. Same shape as its siblings: `llm:pullModel`
 * returns a `pullId` immediately, the pull runs on in the background reporting
 * over `event:pull-progress`, and `llm:cancelPull` looks that id up to abort it
 * (an unknown id changes nothing, not an error).
 *
 * What's different here is the wire: Ollama's *native* API answers as a
 * long-lived NDJSON stream, not as a file. That moves the delicate part from
 * "write bytes to disk" to "read lines out of a stream that can stop at any
 * moment", and three rules keep it honest:
 *
 * - **Every run ends with exactly one `done: true`.** Success, cancellation,
 *   and failure all report it, and the `ended` latch in `send` makes sure the
 *   reader can't emit anything after it — a renderer that saw the closing
 *   event has already torn its listener down.
 * - **A stopped run cleans up first, then reports.** Whichever way a pull ends
 *   short of success, `/api/delete` removes what was pulled *before* the
 *   closing event goes out, so a repeat pull of the same model starts clean.
 * - **A half-read line is not an error.** `parsePullLines` carries an
 *   unterminated fragment over to the next chunk and drops it at the end of the
 *   stream; a truncated final line can't fail a finished pull.
 *
 * 033, D5: both bodies moved into `createOllamaPullPart` — Ollama's part of the
 * `RuntimeInstaller` interface. `llm:pullModel` now dispatches on `RuntimeId`
 * through `runtime/registry.ts` (`llm:cancelPull` carries no runtime and asks
 * every registered one); nothing about the Ollama path changed.
 */

import { randomUUID } from 'node:crypto';
import { createPullProgress, parsePullLines, PROVIDER_PRESETS } from '@core/llm';
import type { FetchLike, PullProgress } from '@core/llm';
import type { HandlerMap } from './registry';
import { fail, toIpcError } from './registry';
import { createRuntimeRegistry, pullChannelHandlers } from './runtime/registry';
import type { RuntimeInstallerPart } from './runtime/types';
import type { Services } from '../services';

/**
 * Ollama's *native* API root. `/api/pull` and `/api/delete` are not part of the
 * OpenAI-compatible surface the providers talk to — they live at the root, so
 * the preset's `/v1` suffix comes off. Derived from the preset rather than
 * written out again, so host and port stay in exactly one place.
 */
function ollamaNativeBase(): string {
  const preset = PROVIDER_PRESETS.find((candidate) => candidate.id === 'ollama');
  return (preset?.baseUrl ?? 'http://localhost:11434/v1').replace(/\/*v1\/*$/, '');
}

/** Test seam: production supplies neither and gets the real `fetch` against
    the real local runtime; tests inject both, so no test needs an Ollama. */
export interface OllamaPullDeps {
  fetchImpl?: FetchLike;
  baseUrl?: string;
}

const JSON_HEADERS: Readonly<Record<string, string>> = { 'content-type': 'application/json' };

/** Ollama accepts `model` on its native endpoints; `name` is the older alias
    for the same field, so the current name is the one worth sending. */
function modelBody(modelId: string): string {
  return JSON.stringify({ model: modelId });
}

/**
 * Removes whatever the stopped pull left behind. Best effort on purpose: a
 * model that never completed isn't registered yet and answers 404 — "there was
 * nothing to delete" and "the partial one is gone" are the same result for the
 * caller. A real failure must not overwrite the run's own outcome either, so
 * nothing propagates out of here.
 */
async function deletePartialModel(
  baseUrl: string,
  modelId: string,
  fetchImpl: FetchLike,
): Promise<void> {
  try {
    /* Deliberately without the run's `AbortSignal`: on the cancel path that
       controller is already aborted, and passing it would cancel the very
       request that undoes the pull. */
    const response = await fetchImpl(`${baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: JSON_HEADERS,
      body: modelBody(modelId),
    });
    if (!response.ok && response.status !== 404) {
      console.warn(`[ollama] Aufräumen nach abgebrochenem Pull: HTTP ${response.status}`);
    }
  } catch {
    /* The runtime went away between the pull and the cleanup. Nothing left to
       do about it, and it must not turn a cancellation into a failure. */
  }
}

/** Bytes → whole megabytes, for throttling: Ollama reports far more often than
    a progress bar can use. */
function wholeMb(bytes: number): number {
  return Math.floor(bytes / (1024 * 1024));
}

/**
 * Runs the pull to its end, reporting through `send`. Resolves once the run has
 * ended one way or another; never rejects — every failure becomes the closing
 * event instead, exactly like `llmStreams.run`'s completion contract.
 */
async function runPull(
  modelId: string,
  baseUrl: string,
  controller: AbortController,
  fetchImpl: FetchLike,
  send: (progress: PullProgress, done: boolean, error?: string) => void,
): Promise<void> {
  const progress = createPullProgress();
  /* Once the stream is open, Ollama has begun writing blobs — from here on any
     early exit owes the cleanup. Before that there is nothing to delete, and
     asking a runtime that just refused us to delete something would only add a
     second failing request. */
  let streamOpen = false;
  try {
    const response = await fetchImpl(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: modelBody(modelId),
      signal: controller.signal,
    });
    if (!response.ok) throw fail('io', `Pull fehlgeschlagen: HTTP ${response.status}`);
    const body = response.body;
    if (!body) throw fail('io', 'die Antwort enthielt keinen Inhalt');

    streamOpen = true;
    const reader = body.getReader();
    const utf8 = new TextDecoder();
    let buffer = '';
    let lastReported = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      buffer += utf8.decode(value, { stream: true });
      const parsed = parsePullLines(buffer);
      // Whatever has no newline yet waits for the next chunk — and if no next
      // chunk ever comes, it was never a whole line to begin with.
      buffer = parsed.remainder;
      for (const line of parsed.events) {
        /* Ollama reports a refused pull (an unknown model, most often) as a
           line inside an HTTP 200 stream. Its wording is a foreign message, so
           only the closed code travels on. */
        if (line.error !== undefined) throw fail('io', 'Ollama hat den Pull abgelehnt');
        const state = progress.push(line);
        // One event per phase and per whole megabyte crossed, rather than one
        // per line: still several a second, without flooding the renderer.
        const key = `${state.status}|${wholeMb(state.completed)}`;
        if (key !== lastReported) {
          lastReported = key;
          send(state, false);
        }
      }
    }
    send(progress.current(), true);
  } catch (error) {
    const failure = toIpcError(error);
    if (streamOpen) await deletePartialModel(baseUrl, modelId, fetchImpl);
    send(progress.current(), true, failure.code);
  }
}

/**
 * Ollama's half of `RuntimeInstaller` (033, D5) for the pull channels — the two
 * D4 handler bodies unchanged. The `running` map still lives in this closure
 * for the same reason `llmStreams`'s does: it's the only link between the call
 * that starts a pull and the one that cancels it.
 */
export type OllamaPullPart = RuntimeInstallerPart<'pull' | 'cancelPull'>;

export function createOllamaPullPart(
  services: Services,
  deps: OllamaPullDeps = {},
): OllamaPullPart {
  const running = new Map<string, AbortController>();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const baseUrl = deps.baseUrl ?? ollamaNativeBase();

  return {
    id: 'ollama',

    pull: async (modelId) => {
      const model = modelId.trim();
      if (model === '') throw fail('invalid', 'kein Modell angegeben');

      const pullId = randomUUID();
      const controller = new AbortController();
      /* Registered before the first byte moves: a cancel that arrives while
         the request is still being opened has to find this controller, or the
         pull would run on with nobody able to stop it. */
      running.set(pullId, controller);

      let ended = false;
      const send = (progress: PullProgress, done: boolean, error?: string): void => {
        if (ended) return; // never anything after the closing event
        if (done) {
          /* Latch and deregister first, report second — by the time the
             renderer reacts to `done`, this run must already be gone. */
          ended = true;
          running.delete(pullId);
        }
        services.sendEvent('event:pull-progress', {
          pullId,
          modelId: model,
          status: progress.status,
          completed: progress.completed,
          total: progress.total,
          done,
          ...(error === undefined ? {} : { error }),
        });
      };

      void runPull(model, baseUrl, controller, fetchImpl, send);
      return { pullId };
    },

    cancelPull: async (pullId) => {
      running.get(pullId)?.abort();
    },
  };
}

/** `llm:pullModel` / `llm:cancelPull` over a registry that knows Ollama and
    nothing else — this module's own seam, and the one its test drives.
    Production builds one registry across all runtimes in `register-all.ts` and
    hands it to the very same `pullChannelHandlers`. */
export function ollamaPullHandlers(services: Services, deps: OllamaPullDeps = {}): HandlerMap {
  return pullChannelHandlers(createRuntimeRegistry([createOllamaPullPart(services, deps)]));
}
