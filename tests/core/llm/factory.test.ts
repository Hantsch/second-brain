/* `createProviderFactory` picks the right provider class per `ProviderKind` and,
   for OpenRouter specifically, adds an attribution header so calls stay
   traceable to the app that made them (story 030, D5). */

import { describe, expect, it } from 'vitest';
import { createProviderFactory } from '@core/llm';
import type { OpenAiCompatibleProvider } from '@core/llm/providers/openai-compatible';
import type { ProviderConfig } from '@shared/types';
import { createFetchFake, jsonResponse } from '../../fakes/llm';

function openRouterConfig(patch: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'openrouter-1',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    hasKey: false,
    local: false,
    enabled: true,
    models: ['anthropic/claude-3.5-haiku'],
    createdAt: '2026-08-10T12:00:00.000Z',
    ...patch,
  };
}

describe('createProviderFactory: OpenRouter attribution header', () => {
  it('sends x-title: Gaston to OpenRouter, never the old product name', async () => {
    const http = createFetchFake([
      jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    ]);
    const factory = createProviderFactory({ fetchImpl: http.fetch });
    const provider = factory(openRouterConfig(), null) as OpenAiCompatibleProvider;

    await provider.complete({
      task: 'title-tags',
      model: 'anthropic/claude-3.5-haiku',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(http.calls[0]?.headers['x-title']).toBe('Gaston');
  });

  it('leaves a non-OpenRouter base URL without the header', async () => {
    const http = createFetchFake([
      jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    ]);
    const factory = createProviderFactory({ fetchImpl: http.fetch });
    const provider = factory(
      openRouterConfig({ baseUrl: 'http://localhost:11434/v1', local: true }),
      null,
    ) as OpenAiCompatibleProvider;

    await provider.complete({
      task: 'title-tags',
      model: 'anthropic/claude-3.5-haiku',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(http.calls[0]?.headers['x-title']).toBeUndefined();
  });
});
