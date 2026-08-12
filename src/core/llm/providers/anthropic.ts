/* Anthropic Messages API, ohne SDK.

   Drei Eigenheiten gegenüber OpenAI-kompatiblen Diensten:
   - Authentifizierung über `x-api-key` plus `anthropic-version`.
   - Der System-Prompt ist ein eigenes Feld, kein `messages`-Eintrag.
   - Strukturierte Ausgabe läuft über ein Werkzeug mit `input_schema` und
     erzwungenem `tool_choice`; kann der Dienst das nicht, greift derselbe
     Prompt-Fallback wie beim OpenAI-Weg. */

import type { ChatTurn, ProviderProbe, Usage } from '@shared/types';
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

/** Vertragsversion der Messages-API. Wird als Header mitgeschickt. */
export const ANTHROPIC_VERSION = '2023-06-01';

/** Ohne `max_tokens` lehnt die API ab — also ein vernünftiger Vorgabewert. */
const DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicConfig {
  baseUrl?: string;
  apiKey?: string | null;
  fetchImpl?: FetchLike;
  headers?: Record<string, string>;
  schemaSupport?: SchemaSupport;
}

interface ContentBlock {
  type?: string;
  text?: unknown;
  input?: unknown;
}

interface MessagesResponse {
  content?: ContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface StreamEvent {
  type?: string;
  delta?: { type?: string; text?: unknown; partial_json?: unknown };
  usage?: { input_tokens?: number; output_tokens?: number };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  error?: { message?: string };
}

export class AnthropicProvider implements LlmProvider {
  readonly kind = 'anthropic' as const;

  private readonly config: AnthropicConfig;
  private readonly baseUrl: string;
  private readonly http: HttpContext;
  private schemaSupport: SchemaSupport;

  constructor(config: AnthropicConfig = {}) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
    this.schemaSupport = config.schemaSupport ?? 'auto';
    this.http = {
      fetchImpl: config.fetchImpl ?? ((url, init) => fetch(url, init)),
      secret: config.apiKey ?? null,
    };
  }

  async complete(call: ProviderCall): Promise<ProviderResult> {
    return this.withSchemaFallback(call, async (native) => {
      const data = await requestJson<MessagesResponse>(
        this.url('/v1/messages'),
        this.init(this.buildBody(call, { stream: false, native }), call.signal),
        this.http,
      );
      return this.finish(call, textOf(data.content), usageOf(data.usage));
    });
  }

  async stream(call: ProviderCall, onDelta: (delta: string) => void): Promise<ProviderResult> {
    return this.withSchemaFallback(call, async (native) => {
      const response = await request(
        this.url('/v1/messages'),
        this.init(this.buildBody(call, { stream: true, native }), call.signal),
        this.http,
      );
      let text = '';
      let usage: Usage | undefined;
      await readSseStream(response.body, (event) => {
        const parsed = parseEvent(event.data);
        if (!parsed) return;
        if (parsed.type === 'error' || parsed.error) {
          throw new Error(
            sanitize(parsed.error?.message ?? 'Fehler im Stream', this.config.apiKey, 200),
          );
        }
        if (parsed.type === 'content_block_delta') {
          const delta = parsed.delta;
          // Text streamt als `text_delta`, ein Werkzeug-Aufruf als `input_json_delta`.
          const piece =
            typeof delta?.text === 'string'
              ? delta.text
              : typeof delta?.partial_json === 'string'
                ? delta.partial_json
                : '';
          if (piece) {
            text += piece;
            onDelta(piece);
          }
          return;
        }
        // `message_start` bringt die Eingabe-Token, `message_delta` die Ausgabe-Token.
        usage = mergeUsage(usage, usageOf(parsed.usage ?? parsed.message?.usage));
      });
      return this.finish(call, text, usage);
    });
  }

  async listModels(): Promise<string[]> {
    const data = await requestJson<{ data?: { id?: string }[] }>(
      this.url('/v1/models?limit=100'),
      { method: 'GET', headers: this.headers() },
      this.http,
    );
    const names = (data.data ?? [])
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
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
    const turns =
      call.schema !== undefined && !useNative
        ? withSchemaInstruction(call.messages, call.schema)
        : call.messages;
    const { system, messages } = splitSystem(turns);

    const body: Record<string, unknown> = {
      model: call.model,
      max_tokens: call.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages,
      stream: options.stream,
    };
    if (system) body.system = system;
    if (call.temperature !== undefined) body.temperature = call.temperature;
    if (useNative && call.schema) {
      body.tools = [
        {
          name: SCHEMA_NAME,
          description: 'Gibt das Ergebnis strukturiert zurück.',
          input_schema: call.schema,
        },
      ];
      body.tool_choice = { type: 'tool', name: SCHEMA_NAME };
    }
    return body;
  }

  private finish(call: ProviderCall, text: string, usage: Usage | undefined): ProviderResult {
    const value = call.schema !== undefined ? normalizeJsonText(text) : text;
    return usage ? { text: value, usage } : { text: value };
  }

  private url(path: string): string {
    return joinUrl(this.baseUrl, path);
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
      'anthropic-version': ANTHROPIC_VERSION,
      ...this.config.headers,
    };
    if (this.config.apiKey) headers['x-api-key'] = this.config.apiKey;
    return headers;
  }
}

/**
 * Trennt System-Anweisungen von den Gesprächsrunden. Mehrere System-Turns werden
 * zusammengefasst, weil die API nur ein Feld dafür hat.
 */
export function splitSystem(turns: readonly ChatTurn[]): {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
} {
  const system = turns
    .filter((turn) => turn.role === 'system')
    .map((turn) => turn.content)
    .join('\n\n');
  const messages = turns
    .filter((turn): turn is ChatTurn & { role: 'user' | 'assistant' } => turn.role !== 'system')
    .map((turn) => ({ role: turn.role, content: turn.content }));
  return { system, messages };
}

/** Text aus den Content-Blöcken; ein `tool_use`-Block liefert sein `input` als JSON. */
function textOf(content: ContentBlock[] | undefined): string {
  if (!content) return '';
  return content
    .map((block) => {
      if (block.type === 'tool_use') return JSON.stringify(block.input ?? {});
      return typeof block.text === 'string' ? block.text : '';
    })
    .join('');
}

function parseEvent(data: string): StreamEvent | null {
  try {
    return JSON.parse(data) as StreamEvent;
  } catch {
    return null;
  }
}

function usageOf(
  usage: { input_tokens?: number; output_tokens?: number } | undefined,
): Usage | undefined {
  if (!usage) return undefined;
  const result: Usage = {};
  if (typeof usage.input_tokens === 'number') result.inputTokens = usage.input_tokens;
  if (typeof usage.output_tokens === 'number') result.outputTokens = usage.output_tokens;
  return Object.keys(result).length > 0 ? result : undefined;
}

function mergeUsage(before: Usage | undefined, next: Usage | undefined): Usage | undefined {
  if (!next) return before;
  if (!before) return next;
  return { ...before, ...next };
}
