/* Der Vertrag der LLM-Schicht.
   Nach außen gibt es genau ein Interface (`LlmGateway`), nach innen genau eines
   (`LlmProvider`). Kein Aufrufer außerhalb dieses Ordners weiß, welcher Provider
   antwortet — und keiner kennt einen API-Key. */

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
 * Die einzige Tür zur LLM-Welt. Wer eine Aufgabe erledigen will, fragt hier —
 * und muss damit rechnen, dass kein Modell konfiguriert ist (`isAvailable`).
 */
export interface LlmGateway {
  /** Eine Aufgabe in einem Zug erledigen. Wirft `LlmUnavailableError`, wenn keine Route steht. */
  complete(req: CompletionRequest): Promise<CompletionResult>;
  /** Wie `complete`, aber jedes Textstück fließt sofort in `onDelta`. */
  stream(req: CompletionRequest, onDelta: (delta: string) => void): Promise<CompletionResult>;
  /** Läuft diese Aufgabe? Falsch heißt: ehrlicher Leerzustand in der Oberfläche. */
  isAvailable(task: TaskKind): boolean;
  /** Welches Modell diese Aufgabe erledigen würde — null, wenn keines nutzbar ist. */
  routeFor(task: TaskKind): ModelRef | null;
}

/** Was ein Provider für einen Aufruf braucht. Modell und Zugang kommen von außen. */
export interface ProviderCall {
  /** Nur zur Nachvollziehbarkeit und für den `FakeProvider` — echte Provider ignorieren das. */
  task: TaskKind;
  model: string;
  messages: ChatTurn[];
  maxTokens?: number;
  temperature?: number;
  /** JSON-Schema für strukturierte Antworten. Gesetzt = `text` ist garantiert JSON. */
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ProviderResult {
  /** Bei gesetztem `schema` immer geparstes und neu serialisiertes JSON. */
  text: string;
  usage?: Usage;
}

/** Ein Provider spricht HTTP (oder tut so) und kennt weder Routing noch Aufgabenkatalog. */
export interface LlmProvider {
  readonly kind: ProviderKind;
  complete(call: ProviderCall): Promise<ProviderResult>;
  stream(call: ProviderCall, onDelta: (delta: string) => void): Promise<ProviderResult>;
  /** Verfügbare Modelle, leer wenn der Provider das nicht anbietet. */
  listModels(): Promise<string[]>;
  /** Verbindungstest: erreichbar, wie schnell, wie viele Modelle. */
  probe(): Promise<ProviderProbe>;
}

/**
 * Zugriff auf API-Schlüssel. Der Kern kennt `safeStorage` nicht — der Main
 * schiebt eine Implementierung herein, Tests eine im Speicher.
 */
export interface KeyStore {
  get(providerId: string): string | null;
  set(providerId: string, key: string): void;
  remove(providerId: string): void;
}

/** Nur so viel von `fetch`, wie diese Schicht braucht — damit Tests es ersetzen können. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const REASON_TEXT: Record<LlmUnavailable['reason'], string> = {
  'no-route': 'Für diese Aufgabe ist kein Modell zugeordnet.',
  'provider-disabled': 'Der zugeordnete Provider ist abgeschaltet.',
  'no-key': 'Für den zugeordneten Provider fehlt der Schlüssel.',
  unreachable: 'Der zugeordnete Provider war nicht erreichbar.',
  error: 'Der Provider hat die Anfrage abgelehnt.',
};

/**
 * Eine LLM-Aufgabe konnte nicht laufen. Trägt `LlmUnavailable` mit sich, damit
 * die Oberfläche den Grund benennen und direkt in die Routing-Einstellung
 * verlinken kann. Enthält nie einen Schlüssel.
 */
export class LlmUnavailableError extends Error {
  readonly info: LlmUnavailable;

  constructor(info: LlmUnavailable) {
    super(info.detail ? `${REASON_TEXT[info.reason]} ${info.detail}` : REASON_TEXT[info.reason]);
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

/** Eine HTTP-Antwort jenseits von 2xx. `status` entscheidet über den Retry. */
export class LlmHttpError extends Error {
  readonly status: number;
  /** Bereits von Schlüsseln befreiter Antwortrumpf, gekürzt. */
  readonly body: string | undefined;

  constructor(status: number, message: string, body?: string) {
    super(message);
    this.name = 'LlmHttpError';
    this.status = status;
    this.body = body;
  }
}

/** Die Anfrage kam nicht durch (DNS, Verbindung, TLS). Immer einen Retry wert. */
export class LlmNetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LlmNetworkError';
  }
}

/** Hat der Aufrufer (oder ein Timeout) abgebrochen? Dann nie erneut versuchen. */
export function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/**
 * Lohnt ein zweiter Versuch? Nur bei Überlast (429), Serverfehlern (5xx) und
 * Netzwerkproblemen — nie bei 4xx, denn eine falsche Anfrage bleibt falsch.
 */
export function isRetryableError(error: unknown): boolean {
  if (isAbortError(error)) return false;
  if (error instanceof LlmHttpError) return error.status === 429 || error.status >= 500;
  if (error instanceof LlmNetworkError) return true;
  // `fetch` wirft bei Netzwerkfehlern einen TypeError; Node-Fehler tragen einen `code`.
  if (error instanceof TypeError) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return (
    typeof code === 'string' &&
    ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code)
  );
}
