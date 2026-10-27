/* The gateway is the only door to the LLM world: it resolves a task to a
   model, executes the call with timeout and retry, and measures what it
   cost.

   Two principles:
   - It doesn't guess. If there is no route, an `LlmUnavailableError` with a
     reason comes back — the UI can turn that into an honest state.
   - It doesn't talk. No key ever ends up in a message or a log. */

import { isAgentRoute } from '@shared/types';
import type {
  CompletionRequest,
  CompletionResult,
  LlmUnavailable,
  ModelRef,
  ProviderConfig,
  Routing,
  TaskKind,
} from '@shared/types';
import { AGENT_JOB_VERSION, agentJobId, type AgentJobStore } from '../agent/jobs';
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

/** After this time, a call counts as undeliverable. */
export const DEFAULT_TIMEOUT_MS = 120_000;
/** Two retries — more would only extend the user's wait time. */
export const DEFAULT_RETRIES = 2;

export interface RoutingGatewayOptions {
  routing: Routing;
  providers: readonly ProviderConfig[];
  keys: KeyStore;
  fetchImpl?: FetchLike;
  createProvider?: ProviderFactory;
  timeoutMs?: number;
  retries?: number;
  /** Wait time before attempt `attempt` (0-based). */
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Where tasks routed to the agent are filed. Without it, an agent route counts as no route. */
  agentJobs?: AgentJobStore;
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
  private readonly agentJobs: AgentJobStore | undefined;

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
    this.agentJobs = options.agentJobs;
  }

  /** After a change to settings: new routing, new providers. */
  update(patch: { routing?: Routing; providers?: readonly ProviderConfig[] }): void {
    if (patch.routing) this.routing = patch.routing;
    if (patch.providers) this.providers = patch.providers;
    this.cache.clear();
  }

  routeFor(task: TaskKind): ModelRef | null {
    const ref = this.agentRoute(task);
    if (ref) return ref;
    const resolved = this.resolve(task);
    return 'ref' in resolved ? resolved.ref : null;
  }

  isAvailable(task: TaskKind): boolean {
    return this.routeFor(task) !== null;
  }

  /**
   * Why `isAvailable(task)` is false — or `null` when it is true. A bare
   * boolean made every caller report "no model configured", even when a model
   * was routed and only its provider's key was missing.
   */
  unavailable(task: TaskKind): LlmUnavailable | null {
    if (this.agentRoute(task)) return null;
    const resolved = this.resolve(task);
    return 'error' in resolved ? resolved.error : null;
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
   * Resolution in exactly this chain: explicit route for the task →
   * `defaults[recommended tier]` → nothing. After that, the provider also
   * has to be usable (present, enabled, key available).
   */
  private resolve(task: TaskKind): Resolved | { error: LlmUnavailable } {
    const ref = this.refFor(task);
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
    if (!config.enabled) {
      return { error: { reason: 'provider-disabled', task, provider: config.label } };
    }

    const key = this.keys.get(config.id);
    if (needsApiKey(config) && !key) {
      return { error: { reason: 'no-key', task, provider: config.label } };
    }

    return { ref, config, key };
  }

  private refFor(task: TaskKind): ModelRef | undefined {
    return this.routing.tasks[task] ?? this.routing.defaults[taskDefinition(task).suggested];
  }

  /** The agent route for this task, when it has one and a job store to file into. */
  private agentRoute(task: TaskKind): ModelRef | null {
    const ref = this.refFor(task);
    return this.agentJobs && isAgentRoute(ref) ? (ref ?? null) : null;
  }

  private async run(
    req: CompletionRequest,
    onDelta?: (delta: string) => void,
  ): Promise<CompletionResult> {
    throwIfAborted(req.signal);
    const agentRef = this.agentRoute(req.task);
    if (agentRef && this.agentJobs) return this.runAgent(req, agentRef, this.agentJobs, onDelta);
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
      // Once text has reached the caller, a second attempt is off the table:
      // it would stream the beginning of the response twice.
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

  /**
   * The agent answers asynchronously: the first call files the job and reports
   * `agent-pending`, so the caller shows its honest waiting state or heuristic
   * fallback. A later call with the same request finds the agent's result and
   * returns it like any model answer — the caller still presents it as a
   * proposal.
   */
  private async runAgent(
    req: CompletionRequest,
    ref: ModelRef,
    jobs: AgentJobStore,
    onDelta?: (delta: string) => void,
  ): Promise<CompletionResult> {
    const id = agentJobId(req);
    const result = await jobs.result(id);
    if (result?.status === 'done') {
      onDelta?.(result.text);
      return { text: result.text, model: ref, latencyMs: 0 };
    }
    if (result) {
      throw new LlmUnavailableError({
        reason: 'agent-failed',
        task: req.task,
        detail: sanitize(result.reason, null, 200),
      });
    }
    await jobs.file({
      version: AGENT_JOB_VERSION,
      id,
      kind: 'llm-task',
      task: req.task,
      createdAt: new Date(this.now()).toISOString(),
      messages: req.messages,
      ...(req.schema !== undefined ? { schema: req.schema } : {}),
    });
    throw new LlmUnavailableError({ reason: 'agent-pending', task: req.task });
  }

  /** One attempt, with its own timeout and the caller's abort passed through. */
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
      // The abort came from the timeout, not the user: this is a state, not a cancellation.
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

  /** Translates a provider error into a state — without a key in the text. */
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
 * Which state fits this error?
 * 401/403 almost always means: the key is wrong. 429 and 5xx mean: the
 * service isn't responding right now. Everything else is a genuine error.
 */
function reasonFor(error: unknown): LlmUnavailable['reason'] {
  if (error instanceof LlmHttpError) {
    if (error.status === 401 || error.status === 403) return 'no-key';
    if (error.status === 429 || error.status >= 500) return 'unreachable';
    return 'error';
  }
  return isRetryableError(error) ? 'unreachable' : 'error';
}
