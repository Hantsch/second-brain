/* Deterministic provider for tests and demo mode. No network, no timing.

   Usage (short version — the API is deliberately small):

     const provider = new FakeProvider({
       replies: { 'title-tags': '{"title":"Test","tags":["a"]}' },
       fallback: (call) => `Antwort auf ${call.task}`,
     });
     provider.setReply('query-answer', 'Steht in [[projects/work/x/project.md]].');
     provider.fail('wiki-ingest', 'Modell überlastet');   // simulated error
     provider.callCount;            // total calls
     provider.countFor('title-tags');
     provider.lastCall('title-tags')?.messages;
     provider.reset();              // clear counters and call list

   Streaming breaks the response into pieces of `chunkSize` characters, so
   consumers see real partial deltas. `signal` is respected. */

import type { ProviderProbe, TaskKind, Usage } from '@shared/types';
import { createAbortError, throwIfAborted } from '../abort';
import type { LlmProvider, ProviderCall, ProviderResult } from '../types';

/** Response as fixed text or as a function over the call. */
export type FakeReply = string | ((call: ProviderCall) => string);

export interface FakeProviderOptions {
  /** Response per task. */
  replies?: Partial<Record<TaskKind, FakeReply>>;
  /** Response for all tasks without their own entry. */
  fallback?: FakeReply;
  /** Simulated error per task — thrown instead of a response. */
  errors?: Partial<Record<TaskKind, string | Error>>;
  /** Simulated error for every task. */
  failEverything?: string | Error;
  models?: string[];
  /** Artificial delay per call in ms (default 0). */
  latencyMs?: number;
  /** Characters per stream delta (default 8). */
  chunkSize?: number;
  usage?: Usage;
  /** Result of `probe()` (default: reachable). */
  probeOk?: boolean;
}

/** A logged call. */
export interface FakeCall {
  task: TaskKind;
  model: string;
  messages: { role: string; content: string }[];
  streamed: boolean;
  schema: Record<string, unknown> | null;
}

export class FakeProvider implements LlmProvider {
  readonly kind = 'fake' as const;
  /** All calls in order — for assertions in tests. */
  readonly calls: FakeCall[] = [];

  private readonly options: FakeProviderOptions;
  private readonly replies: Map<TaskKind, FakeReply>;
  private readonly errors: Map<TaskKind, string | Error>;

  constructor(options: FakeProviderOptions = {}) {
    this.options = options;
    this.replies = new Map(Object.entries(options.replies ?? {}) as [TaskKind, FakeReply][]);
    this.errors = new Map(Object.entries(options.errors ?? {}) as [TaskKind, string | Error][]);
  }

  get callCount(): number {
    return this.calls.length;
  }

  countFor(task: TaskKind): number {
    return this.calls.filter((call) => call.task === task).length;
  }

  lastCall(task?: TaskKind): FakeCall | null {
    const matching = task ? this.calls.filter((call) => call.task === task) : this.calls;
    return matching.length > 0 ? (matching[matching.length - 1] as FakeCall) : null;
  }

  setReply(task: TaskKind, reply: FakeReply): void {
    this.replies.set(task, reply);
    this.errors.delete(task);
  }

  /** Makes this task fail from now on. */
  fail(task: TaskKind, error: string | Error): void {
    this.errors.set(task, error);
  }

  reset(): void {
    this.calls.length = 0;
  }

  async complete(call: ProviderCall): Promise<ProviderResult> {
    return this.run(call, false);
  }

  async stream(call: ProviderCall, onDelta: (delta: string) => void): Promise<ProviderResult> {
    const result = await this.run(call, true);
    const size = Math.max(1, this.options.chunkSize ?? 8);
    for (let i = 0; i < result.text.length; i += size) {
      throwIfAborted(call.signal);
      onDelta(result.text.slice(i, i + size));
    }
    return result;
  }

  async listModels(): Promise<string[]> {
    return [...(this.options.models ?? ['fake-small', 'fake-large'])];
  }

  async probe(): Promise<ProviderProbe> {
    const models = await this.listModels();
    const ok = this.options.probeOk !== false;
    const probe: ProviderProbe = {
      ok,
      at: '1970-01-01T00:00:00.000Z',
      latencyMs: this.options.latencyMs ?? 0,
      modelCount: models.length,
    };
    return ok ? probe : { ...probe, error: 'Fake-Provider ist abgeschaltet.' };
  }

  private async run(call: ProviderCall, streamed: boolean): Promise<ProviderResult> {
    this.calls.push({
      task: call.task,
      model: call.model,
      messages: call.messages.map((turn) => ({ role: turn.role, content: turn.content })),
      streamed,
      schema: call.schema ?? null,
    });
    throwIfAborted(call.signal);
    if (this.options.latencyMs) await wait(this.options.latencyMs, call.signal);
    throwIfAborted(call.signal);

    const failure = this.errors.get(call.task) ?? this.options.failEverything;
    if (failure) throw typeof failure === 'string' ? new Error(failure) : failure;

    const reply = this.replies.get(call.task) ?? this.options.fallback ?? defaultReply;
    const text = typeof reply === 'string' ? reply : reply(call);
    return this.options.usage ? { text, usage: this.options.usage } : { text };
  }
}

/**
 * Default response without configuration: an empty object when there's a
 * schema (stays JSON-parseable), otherwise a recognizable, deterministic text.
 */
function defaultReply(call: ProviderCall): string {
  if (call.schema) return '{}';
  const lastUser = [...call.messages].reverse().find((turn) => turn.role === 'user');
  const echo = (lastUser?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return `[fake:${call.task}] ${echo}`;
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(createAbortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
