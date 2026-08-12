/* Von der Konfiguration zum sprechenden Provider. Die einzige Stelle, die weiß,
   welche Klasse zu welcher `ProviderKind` gehört — Registry und Gateway teilen sie. */

import type { ProviderConfig } from '@shared/types';
import { AnthropicProvider } from './providers/anthropic';
import { FakeProvider } from './providers/fake';
import { OpenAiCompatibleProvider } from './providers/openai-compatible';
import type { FetchLike, LlmProvider } from './types';

/** Erzeugt einen Provider zu einer Konfiguration. Tests schieben hier einen Fake herein. */
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
          ...(isOpenRouter(config.baseUrl) ? { headers: { 'x-title': 'Second Brain' } } : {}),
        });
    }
  };
}

/** OpenRouter mag einen Titel im Header, damit Aufrufe zuordenbar bleiben. */
function isOpenRouter(baseUrl: string): boolean {
  return baseUrl.includes('openrouter.ai');
}
