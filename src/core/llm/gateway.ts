/* Das Gateway ist die einzige Tür zur LLM-Welt: es löst eine Aufgabe zu einem
   Modell auf, führt den Aufruf mit Timeout und Retry aus und misst, was er
   gekostet hat.

   Zwei Grundsätze:
   - Es rät nicht. Steht keine Route, kommt ein `LlmUnavailableError` mit Grund —
     die Oberfläche kann daraus einen ehrlichen Zustand machen.
   - Es redet nicht. Kein Schlüssel landet je in einer Meldung oder einem Log. */

import type {
  CompletionRequest,
  CompletionResult,
  LlmUnavailable,
  ModelRef,
  ProviderConfig,
  Routing,
  TaskKind,
} from '@shared/types';
import { throwIfAborted } from './abort';
import { createProviderFactory, type ProviderFactory } from './factory';
import { describeError } from './http';
import { needsApiKey } from './presets';
import { sanitize } from './redact';
import { taskDefinition } from './tasks';
import {
  LlmHttpError,
  LlmUnavailableError,
  isAbortError,
  isRetryableError,
  type FetchLike,
  type KeyStore,
  type LlmGateway,
  type LlmProvider,
  type ProviderCall,
  type ProviderResult,
} from './types';

/** Nach dieser Zeit gilt ein Aufruf als nicht zustellbar. */
export const DEFAULT_TIMEOUT_MS = 120_000;
/** Zwei Wiederholungen — mehr verlängert nur die Wartezeit des Nutzers. */
export const DEFAULT_RETRIES = 2;

export interface RoutingGatewayOptions {
  routing: Routing;
  providers: readonly ProviderConfig[];
  keys: KeyStore;
  fetchImpl?: FetchLike;
  createProvider?: ProviderFactory;
  timeoutMs?: number;
  retries?: number;
  /** Wartezeit vor dem Versuch `attempt` (0-basiert). */
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface Resolved {
  ref: ModelRef;
  config: ProviderConfig;
  key: string | null;
}

export class RoutingGateway implements LlmGateway {
  private routing: Routing;
  private providers: readonly ProviderConfig[];
  private readonly keys: KeyStore;
  private readonly factory: ProviderFactory;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly backoffMs: (attempt: number) => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly cache = new Map<string, LlmProvider>();

  constructor(options: RoutingGatewayOptions) {
    this.routing = options.routing;
    this.providers = options.providers;
    this.keys = options.keys;
    this.factory =
      options.createProvider ??
      createProviderFactory(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {});
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.backoffMs = options.backoffMs ?? ((attempt) => 500 * 2 ** attempt);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? ((): number => Date.now());
  }

  /** Nach einer Änderung an Einstellungen: neues Routing, neue Provider. */
  update(patch: { routing?: Routing; providers?: readonly ProviderConfig[] }): void {
    if (patch.routing) this.routing = patch.routing;
    if (patch.providers) this.providers = patch.providers;
    this.cache.clear();
  }

  routeFor(task: TaskKind): ModelRef | null {
    const resolved = this.resolve(task);
    return 'ref' in resolved ? resolved.ref : null;
  }

  isAvailable(task: TaskKind): boolean {
    return this.routeFor(task) !== null;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return this.run(req);
  }

  async stream(
    req: CompletionRequest,
    onDelta: (delta: string) => void,
  ): Promise<CompletionResult> {
    return this.run(req, onDelta);
  }

  /**
   * Auflösung in genau dieser Kette: ausdrückliche Route der Aufgabe →
   * `defaults[empfohlene Klasse]` → nichts. Danach muss der Provider auch
   * benutzbar sein (vorhanden, eingeschaltet, Schlüssel da).
   */
  private resolve(task: TaskKind): Resolved | { error: LlmUnavailable } {
    const ref = this.routing.tasks[task] ?? this.routing.defaults[taskDefinition(task).suggested];
    if (!ref) return { error: { reason: 'no-route', task } };

    const config = this.providers.find((provider) => provider.id === ref.providerId);
    if (!config) {
      return {
        error: {
          reason: 'no-route',
          task,
          detail: 'Die Route zeigt auf einen entfernten Provider.',
        },
      };
    }
    if (!config.enabled) return { error: { reason: 'provider-disabled', task } };

    const key = this.keys.get(config.id);
    if (needsApiKey(config) && !key) return { error: { reason: 'no-key', task } };

    return { ref, config, key };
  }

  private async run(
    req: CompletionRequest,
    onDelta?: (delta: string) => void,
  ): Promise<CompletionResult> {
    throwIfAborted(req.signal);
    const resolved = this.resolve(req.task);
    if ('error' in resolved) throw new LlmUnavailableError(resolved.error);

    const { ref, config, key } = resolved;
    const provider = this.providerFor(config, key);
    const call: ProviderCall = {
      task: req.task,
      model: ref.model,
      messages: req.messages,
      ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.schema !== undefined ? { schema: req.schema } : {}),
    };

    const startedAt = this.now();
    for (let attempt = 0; ; attempt += 1) {
      // Sobald Text beim Aufrufer angekommen ist, verbietet sich ein zweiter Versuch:
      // er würde den Anfang der Antwort doppelt streamen.
      let emitted = false;
      const wrapped = onDelta
        ? (delta: string): void => {
            emitted = true;
            onDelta(delta);
          }
        : undefined;
      try {
        const result = await this.attempt(provider, call, wrapped, req);
        return {
          text: result.text,
          model: ref,
          latencyMs: this.now() - startedAt,
          ...(result.usage ? { usage: result.usage } : {}),
        };
      } catch (error) {
        if (isAbortError(error) || error instanceof LlmUnavailableError) throw error;
        if (attempt < this.retries && !emitted && isRetryableError(error)) {
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
        throw this.toUnavailable(req.task, error, key);
      }
    }
  }

  /** Ein Versuch, mit eigenem Timeout und durchgereichtem Abbruch des Aufrufers. */
  private async attempt(
    provider: LlmProvider,
    call: ProviderCall,
    onDelta: ((delta: string) => void) | undefined,
    req: CompletionRequest,
  ): Promise<ProviderResult> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const forwardAbort = (): void => controller.abort();
    req.signal?.addEventListener('abort', forwardAbort, { once: true });

    const withSignal: ProviderCall = { ...call, signal: controller.signal };
    try {
      return onDelta
        ? await provider.stream(withSignal, onDelta)
        : await provider.complete(withSignal);
    } catch (error) {
      // Der Abbruch kam vom Timeout, nicht vom Nutzer: das ist ein Zustand, kein Abbruch.
      if (timedOut && !req.signal?.aborted) {
        throw new LlmUnavailableError({
          reason: 'unreachable',
          task: call.task,
          detail: `Zeitüberschreitung nach ${this.timeoutMs} ms.`,
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener('abort', forwardAbort);
    }
  }

  /** Übersetzt einen Provider-Fehler in einen Zustand — ohne Schlüssel im Text. */
  private toUnavailable(task: TaskKind, error: unknown, key: string | null): LlmUnavailableError {
    const detail = sanitize(describeError(error), key, 200);
    const reason = reasonFor(error);
    return new LlmUnavailableError({ reason, task, detail });
  }

  private providerFor(config: ProviderConfig, key: string | null): LlmProvider {
    const cached = this.cache.get(config.id);
    if (cached) return cached;
    const provider = this.factory(config, key);
    this.cache.set(config.id, provider);
    return provider;
  }
}

/**
 * Welcher Zustand passt zu diesem Fehler?
 * 401/403 heißt fast immer: der Schlüssel stimmt nicht. 429 und 5xx heißen:
 * der Dienst antwortet gerade nicht. Alles andere ist ein echter Fehler.
 */
function reasonFor(error: unknown): LlmUnavailable['reason'] {
  if (error instanceof LlmHttpError) {
    if (error.status === 401 || error.status === 403) return 'no-key';
    if (error.status === 429 || error.status >= 500) return 'unreachable';
    return 'error';
  }
  return isRetryableError(error) ? 'unreachable' : 'error';
}
