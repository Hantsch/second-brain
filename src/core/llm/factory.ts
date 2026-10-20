/* From configuration to a working provider. The only place that knows which
   class belongs to which `ProviderKind` — the registry and the gateway share it. */

import type { ProviderConfig } from '@shared/types';
import { isOpenRouterBaseUrl } from './openrouter-host';
import { AnthropicProvider } from './providers/anthropic';
import { FakeProvider } from './providers/fake';
import { OpenAiCompatibleProvider } from './providers/openai-compatible';
import type { FetchLike, LlmProvider } from './types';

/** Creates a provider for a configuration. Tests inject a fake here. */
export type ProviderFactory = (config: ProviderConfig, apiKey: string | null) => LlmProvider;

export interface FactoryOptions {
  fetchImpl?: FetchLike;
}

export function createProviderFactory(options: FactoryOptions = {}): ProviderFactory {
  return (config, apiKey) => {
    const shared = {
      apiKey,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    };
    switch (config.kind) {
      case 'anthropic':
        return new AnthropicProvider({ baseUrl: config.baseUrl, ...shared });
      case 'fake':
        return new FakeProvider();
      case 'openai-compatible':
      default:
        return new OpenAiCompatibleProvider({
          baseUrl: config.baseUrl,
          ...shared,
          // OpenRouter likes a title in the header, so calls stay attributable.
          ...(isOpenRouterBaseUrl(config.baseUrl) ? { headers: { 'x-title': 'Gaston' } } : {}),
        });
    }
  };
}
