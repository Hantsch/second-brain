/* Fakes für die LLM-Schicht. Tests gehen nie ins Netz und rufen nie ein echtes
   Modell — alles läuft über diese Helfer.

   Kurzüberblick:
   - `createFakeGateway()`  → ein einsatzfähiges `LlmGateway` mit `FakeProvider`
   - `createEmptyGateway()` → Gateway ohne Route („kein Modell konfiguriert")
   - `createFetchFake()`    → injizierbares `fetch` mit Aufrufprotokoll
   - `sseResponse()`        → Antwort mit SSE-Strom, beliebig zerstückelt
   - `jsonResponse()`       → Antwort mit JSON-Rumpf und Status */

import {
  FakeProvider,
  MemoryKeyStore,
  RoutingGateway,
  TASK_KINDS,
  type FakeProviderOptions,
  type FetchLike,
} from '@core/llm';
import type { ModelRef, ProviderConfig, Routing, TaskKind } from '@shared/types';

export const FAKE_PROVIDER_ID = 'fake-1';
export const FAKE_MODEL = 'fake-small';

/** Provider-Konfiguration, die auf den `FakeProvider` zeigt. */
export function fakeProviderConfig(patch: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: FAKE_PROVIDER_ID,
    label: 'Fake',
    kind: 'fake',
    baseUrl: 'http://fake.local/v1',
    hasKey: false,
    local: true,
    enabled: true,
    models: [FAKE_MODEL, 'fake-large'],
    createdAt: '2026-08-10T12:00:00.000Z',
    ...patch,
  };
}

/** Routing, das alle Aufgaben (oder nur `tasks`) auf ein Modell schickt. */
export function routingForAll(ref: ModelRef, tasks: readonly TaskKind[] = TASK_KINDS): Routing {
  const routing: Routing = { tasks: {}, defaults: {} };
  for (const task of tasks) routing.tasks[task] = ref;
  return routing;
}

export interface FakeGatewaySetup {
  gateway: RoutingGateway;
  provider: FakeProvider;
  providers: ProviderConfig[];
  keys: MemoryKeyStore;
}

/**
 * Gateway mit einem `FakeProvider` hinter jeder Aufgabe. Antworten und Fehler
 * werden über `options` bzw. `setup.provider.setReply(...)` gesteuert.
 */
export function createFakeGateway(
  options: FakeProviderOptions & { tasks?: readonly TaskKind[] } = {},
): FakeGatewaySetup {
  const { tasks, ...providerOptions } = options;
  const provider = new FakeProvider(providerOptions);
  const providers = [fakeProviderConfig()];
  const keys = new MemoryKeyStore();
  const gateway = new RoutingGateway({
    routing: routingForAll(
      { providerId: FAKE_PROVIDER_ID, model: FAKE_MODEL },
      tasks ?? TASK_KINDS,
    ),
    providers,
    keys,
    createProvider: () => provider,
    backoffMs: () => 0,
    sleep: async () => {},
  });
  return { gateway, provider, providers, keys };
}

/** Gateway ohne jede Route — für den Pflichtfall „kein Modell konfiguriert". */
export function createEmptyGateway(): RoutingGateway {
  return new RoutingGateway({
    routing: { tasks: {}, defaults: {} },
    providers: [],
    keys: new MemoryKeyStore(),
  });
}

export interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** Geparster JSON-Rumpf, oder null. */
  body: Record<string, unknown> | null;
  signal: AbortSignal | null;
}

export interface FetchFake {
  fetch: FetchLike;
  calls: FetchCall[];
}

export type FetchResponder = (
  call: FetchCall,
  index: number,
) => Response | Error | Promise<Response | Error>;

/**
 * Injizierbares `fetch`. Entweder eine feste Reihenfolge von Antworten oder eine
 * Funktion, die je Aufruf entscheidet. Ein zurückgegebener `Error` wird geworfen —
 * so lassen sich Netzwerkfehler simulieren.
 */
export function createFetchFake(responder: FetchResponder | (Response | Error)[]): FetchFake {
  const calls: FetchCall[] = [];
  const resolve: FetchResponder = Array.isArray(responder)
    ? (_call, index) => {
        const entry = responder[index];
        if (!entry) throw new Error(`Fake-fetch: kein Antwortmuster für Aufruf ${index + 1}.`);
        return entry;
      }
    : responder;

  const fetchImpl: FetchLike = async (url, init) => {
    const call: FetchCall = {
      url,
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: normalizeHeaders(init?.headers),
      body: parseBody(init?.body),
      signal: (init?.signal as AbortSignal | undefined) ?? null,
    };
    calls.push(call);
    if (call.signal?.aborted) throw abortError();
    const result = await resolve(call, calls.length - 1);
    if (result instanceof Error) throw result;
    return result;
  };

  return { fetch: fetchImpl, calls };
}

/** Antwort mit JSON-Rumpf. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Antwort mit rohem Text — für Fehlerseiten und kaputte Rümpfe. */
export function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } });
}

/**
 * Antwort, die `chunks` genau so ausliefert, wie sie übergeben werden.
 * Damit lassen sich halbe SSE-Ereignisse gezielt nachstellen.
 */
export function sseResponse(chunks: readonly string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'content-type': 'text/event-stream' },
  });
}

/** Baut aus fertigen JSON-Objekten einen SSE-Strom mit `data:`-Zeilen plus `[DONE]`. */
export function sseChunks(events: readonly unknown[], done = true): string[] {
  const lines = events.map((event) => `data: ${JSON.stringify(event)}\n\n`);
  return done ? [...lines, 'data: [DONE]\n\n'] : lines;
}

function abortError(): Error {
  const error = new Error('Abgebrochen.');
  error.name = 'AbortError';
  return error;
}

function normalizeHeaders(headers: RequestInit['headers']): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }
  const entries = Array.isArray(headers) ? headers : Object.entries(headers);
  for (const [key, value] of entries) result[String(key).toLowerCase()] = String(value);
  return result;
}

function parseBody(body: RequestInit['body']): Record<string, unknown> | null {
  if (typeof body !== 'string') return null;
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
}
