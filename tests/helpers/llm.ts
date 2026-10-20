/* Bequemer Zugang zur LLM-Schicht in Tests.
 *
 * Die Substanz liegt in `tests/fakes/llm.ts` (Gateway mit `FakeProvider`,
 * injizierbares `fetch`, SSE-Antworten) — diese Datei reicht sie durch und legt
 * drei Handgriffe darauf, die in fast jedem Test gebraucht werden:
 *
 *   const { gateway, provider } = gatewayWithReplies({ 'title-tags': '{"title":"X"}' });
 *   const { text, deltas } = await collectStream(gateway, 'journal-chat', 'Hallo');
 *   await expectLlmUnavailable(() => emptyGateway().complete({ ... }));
 *
 * Kein Test geht ins Netz: der `FakeProvider` antwortet aus dem Speicher. */

import { LlmUnavailableError } from '@core/llm';
import type { LlmGateway } from '@core/llm';
import type { ChatTurn, CompletionResult, TaskKind } from '@shared/types';
import { createEmptyGateway, createFakeGateway, type FakeGatewaySetup } from '../fakes/llm';

export {
  FAKE_MODEL,
  FAKE_PROVIDER_ID,
  createFakeGateway,
  createEmptyGateway,
  createFetchFake,
  fakeProviderConfig,
  jsonResponse,
  routingForAll,
  sseChunks,
  sseResponse,
  textResponse,
  type FakeGatewaySetup,
  type FetchCall,
  type FetchFake,
} from '../fakes/llm';

/** Gateway, das je Aufgabe eine feste Antwort gibt. Alles andere echot. */
export function gatewayWithReplies(
  replies: Partial<Record<TaskKind, string>>,
  tasks?: readonly TaskKind[],
): FakeGatewaySetup {
  return createFakeGateway(tasks ? { replies, tasks } : { replies });
}

/** Gateway ohne jede Route — der Pflichtfall „kein Modell konfiguriert". */
export function emptyGateway(): LlmGateway {
  return createEmptyGateway();
}

export interface WatchedGateway {
  gateway: LlmGateway;
  /** Die Namen der aufgerufenen Gateway-Methoden, in Reihenfolge. */
  calls: string[];
}

/**
 * Legt ein Protokoll um ein Gateway: jede angefasste Methode steht danach in
 * `calls`. Fuer die Wege, die **kein** Modell fragen duerfen (die Haltung
 * „zuhoeren" im Tagebuch, 011) wird „es wurde kein Modell kontaktiert" damit
 * pruefbar, statt behauptet zu sein.
 */
export function watchGateway(inner: LlmGateway): WatchedGateway {
  const calls: string[] = [];
  const gateway: LlmGateway = {
    complete: (req) => {
      calls.push('complete');
      return inner.complete(req);
    },
    stream: (req, onDelta) => {
      calls.push('stream');
      return inner.stream(req, onDelta);
    },
    isAvailable: (task) => {
      calls.push('isAvailable');
      return inner.isAvailable(task);
    },
    routeFor: (task) => {
      calls.push('routeFor');
      return inner.routeFor(task);
    },
  };
  return { gateway, calls };
}

export interface StreamCapture {
  /** Der zusammengesetzte Text. */
  text: string;
  /** Die Teilstücke in Reihenfolge — zeigt, dass wirklich gestreamt wurde. */
  deltas: string[];
  result: CompletionResult;
}

/** Streamt eine Aufgabe und sammelt Deltas und Ergebnis. */
export async function collectStream(
  gateway: LlmGateway,
  task: TaskKind,
  message: string | ChatTurn[],
): Promise<StreamCapture> {
  const messages: ChatTurn[] =
    typeof message === 'string' ? [{ role: 'user', content: message }] : message;
  const deltas: string[] = [];
  const result = await gateway.stream({ task, messages }, (delta) => deltas.push(delta));
  return { text: deltas.join(''), deltas, result };
}

/**
 * Erwartet, dass ein Aufruf mit „kein Modell konfiguriert" scheitert, und gibt
 * den Fehler zurück. Wirft, wenn der Aufruf durchläuft — ein stiller Erfolg
 * wäre hier der schlimmere Fall.
 */
export async function expectLlmUnavailable(
  run: () => Promise<unknown>,
): Promise<LlmUnavailableError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof LlmUnavailableError) return error;
    throw error;
  }
  throw new Error('Erwartet war ein LlmUnavailableError, der Aufruf lief aber durch.');
}
