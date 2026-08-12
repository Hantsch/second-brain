/* Alles, was `/chat/completions` spricht: OpenAI, OpenRouter, Ollama, LM Studio,
   vLLM, llama.cpp. Kein SDK — nur `fetch`, injizierbar.

   Streaming läuft über SSE (`data:`-Zeilen bis `[DONE]`), strukturierte Ausgabe
   über `response_format: json_schema` mit Prompt-Fallback für Runtimes, die das
   nicht kennen. */

import type { ProviderProbe, Usage } from '@shared/types';
import { normalizeJsonText } from '../json';
import { describeError, joinUrl, request, requestJson, type HttpContext } from '../http';
import { sanitize } from '../redact';
import {
  SCHEMA_NAME,
  meansSchemaUnsupported,
  withSchemaInstruction,
  type SchemaSupport,
} from '../structured';
import { readSseStream } from '../sse';
import {
  LlmHttpError,
  type FetchLike,
  type LlmProvider,
  type ProviderCall,
  type ProviderResult,
} from '../types';

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  apiKey?: string | null;
  fetchImpl?: FetchLike;
  /** Zusatz-Header, etwa `HTTP-Referer`/`X-Title` für OpenRouter. */
  headers?: Record<string, string>;
  /** 'auto' probiert `json_schema` einmal aus, 'prompt' nimmt direkt den Fallback. */
  schemaSupport?: SchemaSupport;
}

interface ChatChoice {
  message?: { content?: unknown };
  delta?: { content?: unknown };
  finish_reason?: string | null;
}

interface ChatResponse {
  choices?: ChatChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

interface ModelListResponse {
  data?: { id?: string; name?: string }[];
  models?: { id?: string; name?: string }[];
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly kind = 'openai-compatible' as const;

  private readonly config: OpenAiCompatibleConfig;
  private readonly http: HttpContext;
  private schemaSupport: SchemaSupport;

  constructor(config: OpenAiCompatibleConfig) {
    this.config = config;
    this.schemaSupport = config.schemaSupport ?? 'auto';
    this.http = {
      fetchImpl: config.fetchImpl ?? ((url, init) => fetch(url, init)),
      secret: config.apiKey ?? null,
    };
  }

  async complete(call: ProviderCall): Promise<ProviderResult> {
    const run = async (native: boolean): Promise<ProviderResult> => {
      const body = this.buildBody(call, { stream: false, native });
      const data = await requestJson<ChatResponse>(
        this.url('/chat/completions'),
        this.init(body, call.signal),
        this.http,
      );
      const text = contentOf(data.choices?.[0]?.message?.content);
      return this.finish(call, text, usageOf(data));
    };
    return this.withSchemaFallback(call, run);
  }

  async stream(call: ProviderCall, onDelta: (delta: string) => void): Promise<ProviderResult> {
    const run = async (native: boolean): Promise<ProviderResult> => {
      const body = this.buildBody(call, { stream: true, native });
      const response = await request(
        this.url('/chat/completions'),
        this.init(body, call.signal),
        this.http,
      );
      let text = '';
      let usage: Usage | undefined;
      await readSseStream(response.body, (event) => {
        if (event.data === '[DONE]') return;
        const parsed = parseChunk(event.data);
        if (!parsed) return;
        if (parsed.error) {
          throw new Error(
            sanitize(parsed.error.message ?? 'Fehler im Stream', this.config.apiKey, 200),
          );
        }
        const delta = contentOf(parsed.choices?.[0]?.delta?.content);
        if (delta) {
          text += delta;
          onDelta(delta);
        }
        usage = usageOf(parsed) ?? usage;
      });
      return this.finish(call, text, usage);
    };
    return this.withSchemaFallback(call, run);
  }

  async listModels(): Promise<string[]> {
    const data = await requestJson<ModelListResponse>(
      this.url('/models'),
      { method: 'GET', headers: this.headers() },
      this.http,
    );
    const entries = data.data ?? data.models ?? [];
    const names = entries
      .map((entry) => entry.id ?? entry.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }

  async probe(): Promise<ProviderProbe> {
    const startedAt = Date.now();
    try {
      const models = await this.listModels();
      return {
        ok: true,
        at: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        modelCount: models.length,
      };
    } catch (error) {
      return {
        ok: false,
        at: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        error: sanitize(describeError(error), this.config.apiKey, 200),
      };
    }
  }

  /**
   * Versucht den nativen Schema-Weg und weicht bei einer Ablehnung auf den
   * Prompt-Fallback aus. Die Entscheidung wird gemerkt, damit nicht jeder
   * Aufruf denselben Fehlschlag bezahlt.
   */
  private async withSchemaFallback(
    call: ProviderCall,
    run: (native: boolean) => Promise<ProviderResult>,
  ): Promise<ProviderResult> {
    const native = call.schema !== undefined && this.schemaSupport !== 'prompt';
    if (!native) return run(false);
    try {
      const result = await run(true);
      this.schemaSupport = 'native';
      return result;
    } catch (error) {
      if (error instanceof LlmHttpError && meansSchemaUnsupported(error.status)) {
        this.schemaSupport = 'prompt';
        return run(false);
      }
      throw error;
    }
  }

  private buildBody(
    call: ProviderCall,
    options: { stream: boolean; native: boolean },
  ): Record<string, unknown> {
    const useNative = options.native && call.schema !== undefined;
    const messages =
      call.schema !== undefined && !useNative
        ? withSchemaInstruction(call.messages, call.schema)
        : call.messages;
    const body: Record<string, unknown> = {
      model: call.model,
      messages: messages.map((turn) => ({ role: turn.role, content: turn.content })),
      stream: options.stream,
    };
    if (call.maxTokens !== undefined) body.max_tokens = call.maxTokens;
    if (call.temperature !== undefined) body.temperature = call.temperature;
    if (useNative && call.schema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: SCHEMA_NAME, schema: call.schema },
      };
    }
    return body;
  }

  private finish(call: ProviderCall, text: string, usage: Usage | undefined): ProviderResult {
    const value = call.schema !== undefined ? normalizeJsonText(text) : text;
    return usage ? { text: value, usage } : { text: value };
  }

  private url(path: string): string {
    return joinUrl(this.config.baseUrl, path);
  }

  private init(body: Record<string, unknown>, signal?: AbortSignal): RequestInit {
    const init: RequestInit = {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    };
    if (signal) init.signal = signal;
    return init;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
      ...this.config.headers,
    };
    if (this.config.apiKey) headers.authorization = `Bearer ${this.config.apiKey}`;
    return headers;
  }
}

function parseChunk(data: string): ChatResponse | null {
  try {
    return JSON.parse(data) as ChatResponse;
  } catch {
    // Ein halber Chunk ist kein Fehler: der Dekoder liefert nur vollständige Ereignisse,
    // aber manche Runtimes schicken Kommentar- oder Keep-alive-Zeilen als data.
    return null;
  }
}

/** Manche Runtimes liefern `content` als Array von Teilen statt als String. */
function contentOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        const text = (part as { text?: unknown } | null)?.text;
        return typeof text === 'string' ? text : '';
      })
      .join('');
  }
  return '';
}

function usageOf(data: ChatResponse): Usage | undefined {
  const usage = data.usage;
  if (!usage) return undefined;
  const result: Usage = {};
  if (typeof usage.prompt_tokens === 'number') result.inputTokens = usage.prompt_tokens;
  if (typeof usage.completion_tokens === 'number') result.outputTokens = usage.completion_tokens;
  return Object.keys(result).length > 0 ? result : undefined;
}
