/* The LLM layer's contract.
   Outward there's exactly one interface (`LlmGateway`), inward exactly one
   (`LlmProvider`). No caller outside this folder knows which provider is
   answering — and none of them knows an API key. */

import type {
  ChatTurn,
  CompletionRequest,
  CompletionResult,
  LlmUnavailable,
  ModelRef,
  ProviderKind,
  ProviderProbe,
  TaskKind,
  Usage,
} from '@shared/types';

/**
 * The single door into the LLM world. Whoever wants a task done asks here —
 * and must be prepared for the possibility that no model is configured
 * (`isAvailable`).
 */
export interface LlmGateway {
  /** Complete a task in one go. Throws `LlmUnavailableError` if no route exists. */
  complete(req: CompletionRequest): Promise<CompletionResult>;
  /** Like `complete`, but every piece of text flows immediately into `onDelta`. */
  stream(req: CompletionRequest, onDelta: (delta: string) => void): Promise<CompletionResult>;
  /** Does this task work right now? False means: an honest empty state in the UI. */
  isAvailable(task: TaskKind): boolean;
  /** Which model would handle this task — null if none is usable. */
  routeFor(task: TaskKind): ModelRef | null;
}

/** What a provider needs for a call. Model and access come from outside. */
export interface ProviderCall {
  /**
   * For traceability, for the `FakeProvider` — and for privacy decisions a
   * provider makes itself: the OpenAI-compatible provider reads the task's
   * `sensitive` flag to enforce no-training on OpenRouter. Don't drop it.
   */
  task: TaskKind;
  model: string;
  messages: ChatTurn[];
  maxTokens?: number;
  temperature?: number;
  /** JSON schema for structured responses. Set = `text` is guaranteed JSON. */
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ProviderResult {
  /** When `schema` is set, always parsed and re-serialized JSON. */
  text: string;
  usage?: Usage;
}

/** A provider speaks HTTP (or pretends to) and knows neither routing nor the task catalog. */
export interface LlmProvider {
  readonly kind: ProviderKind;
  complete(call: ProviderCall): Promise<ProviderResult>;
  stream(call: ProviderCall, onDelta: (delta: string) => void): Promise<ProviderResult>;
  /** Available models, empty if the provider doesn't offer this. */
  listModels(): Promise<string[]>;
  /** Connectivity test: reachable, how fast, how many models. */
  probe(): Promise<ProviderProbe>;
}

/**
 * Access to API keys. The core doesn't know `safeStorage` — the main process
 * injects a real implementation, tests an in-memory one.
 */
export interface KeyStore {
  get(providerId: string): string | null;
  set(providerId: string, key: string): void;
  remove(providerId: string): void;
}

/** Only as much of `fetch` as this layer needs — so tests can replace it. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const REASON_TEXT: Record<LlmUnavailable['reason'], string> = {
  'no-route': 'Für diese Aufgabe ist kein Modell zugeordnet',
  'provider-disabled': 'Der zugeordnete Provider ist abgeschaltet',
  'no-key': 'Für den zugeordneten Provider fehlt der Schlüssel',
  unreachable: 'Der zugeordnete Provider war nicht erreichbar',
  error: 'Der Provider hat die Anfrage abgelehnt',
};

/**
 * An LLM task couldn't run. Carries `LlmUnavailable` along so the UI can name
 * the reason and link directly into the routing settings. Never contains a key.
 */
export class LlmUnavailableError extends Error {
  readonly info: LlmUnavailable;

  constructor(info: LlmUnavailable) {
    const provider = info.provider ? ` (${info.provider})` : '';
    const text = `${REASON_TEXT[info.reason]}${provider}.`;
    super(info.detail ? `${text} ${info.detail}` : text);
    this.name = 'LlmUnavailableError';
    this.info = info;
  }

  get reason(): LlmUnavailable['reason'] {
    return this.info.reason;
  }

  get task(): TaskKind {
    return this.info.task;
  }
}

/** An HTTP response outside the 2xx range. `status` decides whether to retry. */
export class LlmHttpError extends Error {
  readonly status: number;
  /** Response body already stripped of keys, truncated. */
  readonly body: string | undefined;

  constructor(status: number, message: string, body?: string) {
    super(message);
    this.name = 'LlmHttpError';
    this.status = status;
    this.body = body;
  }
}

/** The request never went through (DNS, connection, TLS). Always worth a retry. */
export class LlmNetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LlmNetworkError';
  }
}

/** Did the caller (or a timeout) abort? Then never retry. */
export function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/**
 * Is a second attempt worth it? Only for overload (429), server errors (5xx),
 * and network problems — never for 4xx, since a bad request stays bad.
 */
export function isRetryableError(error: unknown): boolean {
  if (isAbortError(error)) return false;
  if (error instanceof LlmHttpError) return error.status === 429 || error.status >= 500;
  if (error instanceof LlmNetworkError) return true;
  // `fetch` throws a TypeError on network errors; Node errors carry a `code`.
  if (error instanceof TypeError) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return (
    typeof code === 'string' &&
    ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code)
  );
}
