/* The public surface of the LLM layer. Main wires things up from here;
   everything else only knows `LlmGateway`. */

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
export { judgeCapacity, type CapacityVerdict, type LimitingFactor } from './capacity';
export { applyVramOverride } from './machine-facts';
export {
  planRuntimeInstall,
  type RuntimePlan,
  type RuntimePlanInput,
  type RuntimeBlockedReason,
} from './runtime-plan';
export {
  ENGINE_ASSETS,
  LLAMACPP_RELEASE_TAG,
  archiveFormatOf,
  availableEngineBuilds,
  getEngineAsset,
  runtimeSupportsPlatform,
  totalEngineDownloadMb,
  type ArchiveFormat,
  type EngineArch,
  type EngineAssetDescriptor,
  type ExtraArchive,
} from './runtime/descriptors';
export {
  planRuntimeDownload,
  DISK_SAFETY_MARGIN_MB,
  type RuntimeDownloadInput,
  type RuntimeDownloadKind,
  type RuntimeDownloadPlan,
} from './runtime/plan';
export {
  selectEngineBuild,
  type EngineBuildInput,
  type EngineBuildChoice,
} from './runtime/engine-build';
export {
  createPullProgress,
  parsePullLines,
  type PullLine,
  type PullLineResult,
  type PullProgress,
  type PullProgressTracker,
} from './pull-parser';
export {
  TIER_ORDER,
  MIN_LOCAL_PARAMS_B_BY_TIER,
  cheapSizeBand,
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
export {
  loadCatalogue,
  loadCatalogueWithLiveData,
  parseCatalogue,
  CatalogueParseError,
  type Catalogue,
  type CatalogueEntry,
  type DataPolicy,
  type LiveCatalogue,
  type LoadCatalogueWithLiveDataDeps,
} from './catalogue';
export {
  fetchOpenRouterPrices,
  fetchOpenRouterEndpointPolicy,
  type OpenRouterPrice,
} from './catalogue/openrouter';
export { sanitize } from './redact';
export { searchHfModels, listHfModelFiles } from './hf/search';
export { parseQuantisation } from './hf/quant';
export {
  assessReachability,
  reachableOnly,
  type ReachabilityStatus,
  type ReachabilityReason,
  type ReachabilityResult,
} from './reachability';
export {
  filterForSensitiveTask,
  isAllowedForSensitiveTask,
  isSensitiveTask,
  judgeForSensitiveTask,
  judgeRouteForSensitiveTask,
  refusalsForSensitiveTask,
  type AllowedSensitiveCandidate,
  type SensitiveCandidate,
  type SensitiveJudgement,
  type SensitivePolicyInfo,
  type SensitiveProviderFacts,
  type SensitiveRefusalReason,
  type SensitiveRouteVerdict,
} from './sensitive';
export {
  recommendModels,
  type RecommendationReasonKey,
  type RecommendationSet,
  type RecommendationShortfall,
  type RecommendationTradeoffKey,
  type TaskRecommendation,
} from './recommend';
export * from './prompts';
