/* Per-request no-training enforcement (Story 019b, D7).

   Sensitive tasks on OpenRouter must carry `provider.data_collection: 'deny'`
   in the request body — and nothing else may change in the body. */

import { describe, expect, it } from 'vitest';
import { OpenAiCompatibleProvider } from '@core/llm';
import type { ProviderCall } from '@core/llm';
import { createFetchFake, jsonResponse, sseChunks, sseResponse } from '../../../fakes/llm';

const OPENROUTER = 'https://openrouter.ai/api/v1';
const LOCAL = 'http://localhost:11434/v1';

function call(patch: Partial<ProviderCall> = {}): ProviderCall {
  return {
    task: 'classify-dump',
    model: 'anthropic/claude-3.5-haiku',
    messages: [{ role: 'user', content: 'Where does this thought belong?' }],
    ...patch,
  };
}

function chatResponse(content: string): Response {
  return jsonResponse({ choices: [{ message: { content }, finish_reason: 'stop' }] });
}

/** OpenRouter's response when no endpoint satisfies the routing constraint. */
function noEndpointResponse(): Response {
  return jsonResponse({ error: { message: 'No endpoints found matching your data policy.' } }, 404);
}

function providerFieldOf(body: Record<string, unknown> | null | undefined): unknown {
  return body?.provider;
}

describe('OpenAiCompatibleProvider: no-training on OpenRouter', () => {
  it('sets data_collection deny for a sensitive task', async () => {
    const http = createFetchFake([chatResponse('ok')]);
    const provider = new OpenAiCompatibleProvider({
      baseUrl: OPENROUTER,
      apiKey: 'sk-or-test-1234567890',
      fetchImpl: http.fetch,
    });

    await provider.complete(call({ task: 'classify-dump' }));

    expect(providerFieldOf(http.calls[0]?.body)).toEqual({ data_collection: 'deny' });
  });

  it('sets the constraint on a stream too — journal-chat is the real-world case', async () => {
    const http = createFetchFake([
      sseResponse(sseChunks([{ choices: [{ delta: { content: 'x' } }] }])),
    ]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: OPENROUTER, fetchImpl: http.fetch });

    await provider.stream(call({ task: 'journal-chat' }), () => {});

    expect(providerFieldOf(http.calls[0]?.body)).toEqual({ data_collection: 'deny' });
  });

  it('leaves the body unchanged for a non-sensitive task', async () => {
    const http = createFetchFake([chatResponse('A title')]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: OPENROUTER, fetchImpl: http.fetch });

    await provider.complete(call({ task: 'title-tags' }));

    // No empty `provider` object, no extra key: exactly the old body shape.
    expect(http.calls[0]?.body).not.toHaveProperty('provider');
    expect(Object.keys(http.calls[0]?.body ?? {}).sort()).toEqual(['messages', 'model', 'stream']);
  });

  it('leaves the body unchanged for a local base URL', async () => {
    const http = createFetchFake([chatResponse('ok')]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: LOCAL, fetchImpl: http.fetch });

    await provider.complete(call({ task: 'journal-chat' }));

    expect(http.calls[0]?.body).not.toHaveProperty('provider');
  });

  it('does not mistake a look-alike host for OpenRouter', async () => {
    const http = createFetchFake([chatResponse('ok')]);
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'https://notopenrouter.ai/v1',
      fetchImpl: http.fetch,
    });

    await provider.complete(call({ task: 'journal-chat' }));

    expect(http.calls[0]?.body).not.toHaveProperty('provider');
  });
});

describe('OpenAiCompatibleProvider: refused endpoint', () => {
  it('surfaces the refusal as an error instead of swallowing it', async () => {
    const http = createFetchFake([noEndpointResponse()]);
    const provider = new OpenAiCompatibleProvider({ baseUrl: OPENROUTER, fetchImpl: http.fetch });

    await expect(provider.complete(call({ task: 'extract-tasks' }))).rejects.toMatchObject({
      name: 'LlmHttpError',
      status: 404,
    });
    expect(http.calls).toHaveLength(1);
  });

  it('never retries without the constraint — not even through the schema fallback', async () => {
    // A 404 reads to the schema-support detection as "json_schema unknown"
    // and triggers exactly one second attempt. That retry must not drop the
    // constraint.
    const http = createFetchFake(() => noEndpointResponse());
    const provider = new OpenAiCompatibleProvider({ baseUrl: OPENROUTER, fetchImpl: http.fetch });

    await expect(
      provider.complete(
        call({ task: 'extract-tasks', schema: { type: 'object', properties: {} } }),
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(http.calls.length).toBeGreaterThan(1);
    for (const attempt of http.calls) {
      expect(providerFieldOf(attempt.body)).toEqual({ data_collection: 'deny' });
    }
  });
});
