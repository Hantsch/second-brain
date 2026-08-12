/* Die öffentliche Fläche der LLM-Schicht. Der Main verdrahtet von hier aus;
   alles andere kennt nur `LlmGateway`. */

export type {
  FetchLike,
  KeyStore,
  LlmGateway,
  LlmProvider,
  ProviderCall,
  ProviderResult,
} from './types';
export {
  LlmHttpError,
  LlmNetworkError,
  LlmUnavailableError,
  isAbortError,
  isRetryableError,
} from './types';
export { createAbortError, throwIfAborted } from './abort';

export { RoutingGateway, DEFAULT_RETRIES, DEFAULT_TIMEOUT_MS } from './gateway';
export { ProviderRegistry, suggestRouting, type NewProviderInput } from './registry';
export { MemoryKeyStore } from './key-store';
export { createProviderFactory, type ProviderFactory } from './factory';

export { PROVIDER_PRESETS, CUSTOM_PRESET_ID, findPreset, needsApiKey } from './presets';
export {
  TASK_DEFINITIONS,
  TASK_KINDS,
  sensitiveTasks,
  suggestedTier,
  taskDefinition,
} from './tasks';
export {
  TIER_ORDER,
  classifyModelTier,
  collectCandidates,
  parameterBillions,
  pickCandidate,
  type ModelCandidate,
} from './tiers';

export { AnthropicProvider, ANTHROPIC_VERSION } from './providers/anthropic';
export { OpenAiCompatibleProvider } from './providers/openai-compatible';
export {
  FakeProvider,
  type FakeCall,
  type FakeProviderOptions,
  type FakeReply,
} from './providers/fake';

export { JsonParseError, parseJsonLoose, normalizeJsonText } from './json';
export { sanitize } from './redact';
export * from './prompts';
