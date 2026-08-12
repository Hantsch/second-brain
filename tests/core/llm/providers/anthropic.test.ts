import { describe, expect, it } from 'vitest';
import { ANTHROPIC_VERSION, AnthropicProvider } from '@core/llm';
import type { ProviderCall } from '@core/llm';
import { createFetchFake, jsonResponse, sseResponse, textResponse } from '../../../fakes/llm';

const KEY = 'sk-ant-test-1234567890';

function call(patch: Partial<ProviderCall> = {}): ProviderCall {
  return {
    task: 'journal-chat',
    model: 'claude-sonnet-4-5',
    messages: [
      { role: 'system', content: 'Du hörst zu.' },
      { role: 'user', content: 'Heute war viel.' },
    ],
    ...patch,
  };
}

function provider(fetchImpl: ReturnType<typeof createFetchFake>['fetch']): AnthropicProvider {
  return new AnthropicProvider({ baseUrl: 'https://api.anthropic.test', apiKey: KEY, fetchImpl });
}

function messagesResponse(text: string): Response {
  return jsonResponse({
    content: [{ type: 'text', text }],
    usage: { input_tokens: 30, output_tokens: 9 },
  });
}

describe('AnthropicProvider: complete', () => {
  it('ruft /v1/messages mit den richtigen Headern', async () => {
    const http = createFetchFake([messagesResponse('Ich höre.')]);
    const result = await provider(http.fetch).complete(call());

    expect(result.text).toBe('Ich höre.');
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 9 });
    const [request] = http.calls;
    expect(request?.url).toBe('https://api.anthropic.test/v1/messages');
    expect(request?.headers['x-api-key']).toBe(KEY);
    expect(request?.headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
    expect(request?.headers.authorization).toBeUndefined();
  });

  it('schickt den System-Prompt als eigenes Feld, nicht als Nachricht', async () => {
    const http = createFetchFake([messagesResponse('ok')]);
    await provider(http.fetch).complete(call());

    const body = http.calls[0]?.body;
    expect(body?.system).toBe('Du hörst zu.');
    expect(body?.messages).toEqual([{ role: 'user', content: 'Heute war viel.' }]);
  });

  it('fasst mehrere System-Turns zusammen', async () => {
    const http = createFetchFake([messagesResponse('ok')]);
    await provider(http.fetch).complete(
      call({
        messages: [
          { role: 'system', content: 'Eins.' },
          { role: 'system', content: 'Zwei.' },
          { role: 'user', content: 'Frage' },
        ],
      }),
    );
    expect(http.calls[0]?.body?.system).toBe('Eins.\n\nZwei.');
  });

  it('setzt max_tokens, weil die API es verlangt', async () => {
    const http = createFetchFake([messagesResponse('ok'), messagesResponse('ok')]);
    const p = provider(http.fetch);
    await p.complete(call());
    expect(http.calls[0]?.body?.max_tokens).toBe(4096);
    await p.complete(call({ maxTokens: 256 }));
    expect(http.calls[1]?.body?.max_tokens).toBe(256);
  });
});

describe('AnthropicProvider: strukturierte Ausgabe', () => {
  const schema = { type: 'object', properties: { scope: { type: 'string' } } };

  it('erzwingt ein Werkzeug und liest dessen input als JSON', async () => {
    const http = createFetchFake([
      jsonResponse({ content: [{ type: 'tool_use', input: { scope: 'work' } }] }),
    ]);
    const result = await provider(http.fetch).complete(call({ schema }));

    expect(result.text).toBe('{"scope":"work"}');
    expect(http.calls[0]?.body).toMatchObject({
      tools: [{ name: 'antwort', input_schema: schema }],
      tool_choice: { type: 'tool', name: 'antwort' },
    });
  });

  it('fällt bei Ablehnung auf das Schema im System-Prompt zurück', async () => {
    const http = createFetchFake([
      textResponse('tools not supported', 400),
      messagesResponse('```json\n{"scope":"private"}\n```'),
    ]);
    const result = await provider(http.fetch).complete(call({ schema }));

    expect(result.text).toBe('{"scope":"private"}');
    expect(http.calls).toHaveLength(2);
    expect(http.calls[1]?.body).not.toHaveProperty('tools');
    expect(String(http.calls[1]?.body?.system)).toContain('"scope"');
  });
});

describe('AnthropicProvider: stream', () => {
  it('liest content_block_delta aus zerstückelten Chunks', async () => {
    const chunks = [
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":11}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Ich "}}\n\nevent: content_block_delta\nda',
      'ta: {"type":"content_block_delta","delta":{"type":"text_delta","text":"höre."}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":4}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];
    const http = createFetchFake([sseResponse(chunks)]);

    const deltas: string[] = [];
    const result = await provider(http.fetch).stream(call(), (delta) => deltas.push(delta));

    expect(deltas).toEqual(['Ich ', 'höre.']);
    expect(result.text).toBe('Ich höre.');
    // Eingabe-Token kommen aus message_start, Ausgabe-Token aus message_delta.
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 4 });
    expect(http.calls[0]?.body).toMatchObject({ stream: true });
  });

  it('bricht bei einem Fehler-Ereignis ab', async () => {
    const http = createFetchFake([
      sseResponse(['event: error\ndata: {"type":"error","error":{"message":"überlastet"}}\n\n']),
    ]);
    await expect(provider(http.fetch).stream(call(), () => {})).rejects.toThrow(/überlastet/);
  });

  it('sammelt bei erzwungenem Werkzeug die JSON-Stücke', async () => {
    const http = createFetchFake([
      sseResponse([
        'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\\"scope\\":"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"\\"work\\"}"}}\n\n',
      ]),
    ]);
    const result = await provider(http.fetch).stream(
      call({ schema: { type: 'object' } }),
      () => {},
    );
    expect(result.text).toBe('{"scope":"work"}');
  });
});

describe('AnthropicProvider: Modelle und Probe', () => {
  it('liest /v1/models', async () => {
    const http = createFetchFake([
      jsonResponse({ data: [{ id: 'claude-sonnet-4-5' }, { id: 'claude-opus-4-6' }] }),
    ]);
    expect(await provider(http.fetch).listModels()).toEqual([
      'claude-opus-4-6',
      'claude-sonnet-4-5',
    ]);
    expect(http.calls[0]?.url).toContain('/v1/models');
    expect(http.calls[0]?.headers['x-api-key']).toBe(KEY);
  });

  it('probe nennt bei einem Fehler nie den Schlüssel', async () => {
    const http = createFetchFake([textResponse(`invalid x-api-key: ${KEY}`, 401)]);
    const probe = await provider(http.fetch).probe();
    expect(probe.ok).toBe(false);
    expect(probe.error).not.toContain(KEY);
  });
});
