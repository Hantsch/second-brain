import { describe, expect, it } from 'vitest';
import {
  LlmUnavailableError,
  OpenAiCompatibleProvider,
  RoutingGateway,
  MemoryKeyStore,
} from '@core/llm';
import type { ProviderCall } from '@core/llm';
import type { ProviderConfig } from '@shared/types';
import {
  createFetchFake,
  jsonResponse,
  sseChunks,
  sseResponse,
  textResponse,
} from '../../../fakes/llm';

const BASE = 'http://localhost:11434/v1';

function call(patch: Partial<ProviderCall> = {}): ProviderCall {
  return {
    task: 'title-tags',
    model: 'llama3.1:8b',
    messages: [
      { role: 'system', content: 'Sei knapp.' },
      { role: 'user', content: 'Titel für diesen Text?' },
    ],
    ...patch,
  };
}

function chatResponse(content: string): Response {
  return jsonResponse({
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 20, completion_tokens: 5 },
  });
}

describe('OpenAiCompatibleProvider: complete', () => {
  it('ruft /chat/completions mit Modell, Nachrichten und Schlüssel', async () => {
    const http = createFetchFake([chatResponse('Ein Titel')]);
    const provider = new OpenAiCompatibleProvider({
      baseUrl: BASE,
      apiKey: 'sk-test-1234567890',
      fetchImpl: http.fetch,
    });

    const result = await provider.complete(call());

    expect(result.text).toBe('Ein Titel');
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 5 });
    const [request] = http.calls;
    expect(request?.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(request?.method).toBe('POST');
    expect(request?.headers.authorization).toBe('Bearer sk-test-1234567890');
    expect(request?.body).toMatchObject({
      model: 'llama3.1:8b',
      stream: false,
      messages: [
        { role: 'system', content: 'Sei knapp.' },
        { role: 'user', content: 'Titel für diesen Text?' },
      ],
    });
  });

  it('schickt ohne Schlüssel keinen Authorization-Header', async () => {
    const http = createFetchFake([chatResponse('ok')]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: BASE, fetchImpl: http.fetch });
    await provider.complete(call());
    expect(http.calls[0]?.headers.authorization).toBeUndefined();
  });

  it('setzt maxTokens und temperature nur, wenn sie gesetzt sind', async () => {
    const http = createFetchFake([chatResponse('ok'), chatResponse('ok')]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: BASE, fetchImpl: http.fetch });
    await provider.complete(call());
    expect(http.calls[0]?.body).not.toHaveProperty('max_tokens');
    await provider.complete(call({ maxTokens: 100, temperature: 0.2 }));
    expect(http.calls[1]?.body).toMatchObject({ max_tokens: 100, temperature: 0.2 });
  });

  it('verträgt content als Liste von Teilen', async () => {
    const http = createFetchFake([
      jsonResponse({ choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }] }),
    ]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: BASE, fetchImpl: http.fetch });
    expect((await provider.complete(call())).text).toBe('ab');
  });
});

describe('OpenAiCompatibleProvider: strukturierte Ausgabe', () => {
  const schema = { type: 'object', properties: { title: { type: 'string' } } };

  it('nutzt response_format json_schema, wenn der Dienst es kann', async () => {
    const http = createFetchFake([chatResponse('{"title":"Fertig"}')]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: BASE, fetchImpl: http.fetch });

    const result = await provider.complete(call({ schema }));

    expect(result.text).toBe('{"title":"Fertig"}');
    expect(http.calls[0]?.body).toMatchObject({
      response_format: { type: 'json_schema', json_schema: { name: 'antwort', schema } },
    });
  });

  it('fällt auf das Schema im System-Prompt zurück, wenn der Dienst ablehnt', async () => {
    const http = createFetchFake([
      jsonResponse({ error: { message: 'response_format nicht unterstützt' } }, 400),
      chatResponse('```json\n{ "title": "Aus dem Prompt" }\n```'),
    ]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: BASE, fetchImpl: http.fetch });

    const result = await provider.complete(call({ schema }));

    // Der Fallback normalisiert die Antwort: Fences weg, kompaktes JSON.
    expect(result.text).toBe('{"title":"Aus dem Prompt"}');
    expect(http.calls).toHaveLength(2);
    expect(http.calls[1]?.body).not.toHaveProperty('response_format');
    const messages = http.calls[1]?.body?.messages as { role: string; content: string }[];
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('Sei knapp.');
    expect(messages[0]?.content).toContain('"title"');
    expect(messages[0]?.content).toContain('Code-Fences');
  });

  it('merkt sich das Nein und probiert json_schema nicht wieder', async () => {
    const http = createFetchFake((_c, index) =>
      index === 0 ? jsonResponse({}, 400) : chatResponse('{"title":"x"}'),
    );
    const provider = new OpenAiCompatibleProvider({ baseUrl: BASE, fetchImpl: http.fetch });
    await provider.complete(call({ schema }));
    await provider.complete(call({ schema }));
    expect(http.calls).toHaveLength(3);
    expect(http.calls[2]?.body).not.toHaveProperty('response_format');
  });

  it('verdeckt einen echten Serverfehler nicht mit dem Fallback', async () => {
    const http = createFetchFake([jsonResponse({}, 503)]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: BASE, fetchImpl: http.fetch });
    await expect(provider.complete(call({ schema }))).rejects.toMatchObject({ status: 503 });
    expect(http.calls).toHaveLength(1);
  });

  it('meldet einen klaren Fehler, wenn die Antwort kein JSON ist', async () => {
    const http = createFetchFake([chatResponse('Tut mir leid, das kann ich nicht.')]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: BASE, fetchImpl: http.fetch });
    await expect(provider.complete(call({ schema }))).rejects.toThrow(/JSON/);
  });
});

describe('OpenAiCompatibleProvider: stream', () => {
  it('setzt Deltas aus zerstückelten SSE-Chunks zusammen', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hal"}}]}\n\ndata: {"choices":[{"del',
      'ta":{"content":"lo "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Welt"}}]}\n\ndata: [DONE]\n\n',
    ];
    const http = createFetchFake([sseResponse(chunks)]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: BASE, fetchImpl: http.fetch });

    const deltas: string[] = [];
    const result = await provider.stream(call({ task: 'query-answer' }), (d) => deltas.push(d));

    expect(deltas).toEqual(['Hal', 'lo ', 'Welt']);
    expect(result.text).toBe('Hallo Welt');
    expect(http.calls[0]?.body).toMatchObject({ stream: true });
  });

  it('liest Usage aus dem Stream mit', async () => {
    const http = createFetchFake([
      sseResponse(
        sseChunks([
          { choices: [{ delta: { content: 'x' } }] },
          { choices: [{ delta: {} }], usage: { prompt_tokens: 7, completion_tokens: 1 } },
        ]),
      ),
    ]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: BASE, fetchImpl: http.fetch });
    const result = await provider.stream(call({ task: 'query-answer' }), () => {});
    expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 1 });
  });

  it('bricht mit einem Fehler ab, wenn der Stream einen Fehler meldet', async () => {
    const http = createFetchFake([
      sseResponse(['data: {"error":{"message":"Modell nicht geladen"}}\n\n']),
    ]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: BASE, fetchImpl: http.fetch });
    await expect(provider.stream(call({ task: 'query-answer' }), () => {})).rejects.toThrow(
      /Modell nicht geladen/,
    );
  });
});

describe('OpenAiCompatibleProvider: Modelle und Probe', () => {
  it('liest /models, entdoppelt und sortiert', async () => {
    const http = createFetchFake([
      jsonResponse({ data: [{ id: 'qwen2.5:14b' }, { id: 'llama3.1:8b' }, { id: 'llama3.1:8b' }] }),
    ]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: BASE, fetchImpl: http.fetch });
    expect(await provider.listModels()).toEqual(['llama3.1:8b', 'qwen2.5:14b']);
    expect(http.calls[0]?.url).toBe('http://localhost:11434/v1/models');
    expect(http.calls[0]?.method).toBe('GET');
  });

  it('probe misst Latenz und zählt Modelle', async () => {
    const http = createFetchFake([jsonResponse({ data: [{ id: 'a' }, { id: 'b' }] })]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: BASE, fetchImpl: http.fetch });
    const probe = await provider.probe();
    expect(probe.ok).toBe(true);
    expect(probe.modelCount).toBe(2);
    expect(probe.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('probe meldet einen Fehler als Text, ohne den Schlüssel zu nennen', async () => {
    const key = 'sk-geheim-abcdef123456';
    const http = createFetchFake([textResponse(`Bad key: ${key}`, 401)]);
    const provider = new OpenAiCompatibleProvider({
      baseUrl: BASE,
      apiKey: key,
      fetchImpl: http.fetch,
    });
    const probe = await provider.probe();
    expect(probe.ok).toBe(false);
    expect(probe.error).toBeTruthy();
    expect(probe.error).not.toContain(key);
    expect(probe.error).toContain('***');
  });
});

describe('OpenAiCompatibleProvider im Gateway', () => {
  const config: ProviderConfig = {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.test/v1',
    hasKey: true,
    local: false,
    enabled: true,
    models: ['gpt-4o'],
    createdAt: '2026-08-01T00:00:00.000Z',
  };

  it('reicht den Abbruch des Aufrufers bis in fetch durch', async () => {
    const http = createFetchFake([chatResponse('nie')]);
    const gateway = new RoutingGateway({
      routing: { tasks: { 'title-tags': { providerId: 'openai', model: 'gpt-4o' } }, defaults: {} },
      providers: [config],
      keys: new MemoryKeyStore({ openai: 'sk-a-1234567890' }),
      fetchImpl: http.fetch,
      retries: 0,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      gateway.complete({
        task: 'title-tags',
        messages: [{ role: 'user', content: 'x' }],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(http.calls).toHaveLength(0);
  });

  it('macht aus einem 500er nach Wiederholungen einen unreachable-Zustand', async () => {
    const http = createFetchFake(() => jsonResponse({ message: 'kaputt' }, 500));
    const gateway = new RoutingGateway({
      routing: { tasks: { 'title-tags': { providerId: 'openai', model: 'gpt-4o' } }, defaults: {} },
      providers: [config],
      keys: new MemoryKeyStore({ openai: 'sk-a-1234567890' }),
      fetchImpl: http.fetch,
      backoffMs: () => 0,
      sleep: async () => {},
    });
    const error = await gateway
      .complete({ task: 'title-tags', messages: [{ role: 'user', content: 'x' }] })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmUnavailableError);
    expect((error as LlmUnavailableError).info.reason).toBe('unreachable');
    expect(http.calls).toHaveLength(3);
  });
});
