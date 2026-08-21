/* LLM layer: providers, models, task categories, and their assignment.
   No caller outside `core/llm` knows which provider is running. */

/** How to talk to a provider. */
export type ProviderKind =
  /** Anthropic Messages API. */
  | 'anthropic'
  /** Anything OpenAI-compatible: OpenAI, OpenRouter, Ollama, LM Studio, vLLM, Azure. */
  | 'openai-compatible'
  /** Deterministic responder for tests and demo mode. */
  | 'fake';

/** Template that gets a provider set up in two clicks. */
export interface ProviderPreset {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Does this provider need an API key? Local runtimes don't. */
  needsKey: boolean;
  /** Runs on this machine — may be recommended for sensitive tasks. */
  local: boolean;
  /** Can the model list be queried live? */
  canListModels: boolean;
  hint?: string;
}

export interface ProviderConfig {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Just a marker: the key itself lives encrypted in userData, never in the vault. */
  hasKey: boolean;
  local: boolean;
  enabled: boolean;
  /** Last known models (from `canListModels` or maintained manually). */
  models: string[];
  /** Result of the last connectivity test. */
  probe?: ProviderProbe;
  createdAt: string;
}

export interface ProviderProbe {
  ok: boolean;
  at: string;
  latencyMs?: number;
  error?: string;
  modelCount?: number;
}

/** Rough performance class. Steers the suggestions, not the mechanics. */
export type ModelTier = 'cheap' | 'balanced' | 'strong';

export const MODEL_TIERS: readonly ModelTier[] = ['cheap', 'balanced', 'strong'];

/**
 * Every LLM-backed task in the app is one of these categories. The user
 * assigns a provider + model to each category — a small model may handle
 * queries, a large one condensing knowledge.
 */
export type TaskKind =
  /** Read a dump and produce a filing proposal. */
  | 'classify-dump'
  /** Suggest title, slug, and tags. The app's cheapest task. */
  | 'title-tags'
  /** Extract todos, deadlines, "waiting on" entries from text. */
  | 'extract-tasks'
  /** Condense a source into a wiki source page. */
  | 'summarize-source'
  /** Write and link entity/concept pages. */
  | 'wiki-ingest'
  /** Answer a question against the Second Brain, with citations. */
  | 'query-answer'
  /** Sort/filter search hits for a question. */
  | 'query-rerank'
  /** Journal/coaching dialogue. */
  | 'journal-chat'
  /** Project status, next step, stagnation diagnosis. */
  | 'project-status'
  /** Maintenance run: find contradictions, stale claims, gaps. */
  | 'gardener-audit';

export interface TaskDefinition {
  kind: TaskKind;
  /** i18n key for the name. */
  labelKey: string;
  /** i18n key for the explanation of why this task needs which model. */
  hintKey: string;
  /** Recommended tier. */
  suggested: ModelTier;
  /** Operates on sensitive, personal content — prefer a local model. */
  sensitive: boolean;
  /** Responds with streaming (chat-like). */
  streams: boolean;
  /** Expects structured JSON back. */
  structured: boolean;
}

/** A concrete target: provider + model. */
export interface ModelRef {
  providerId: string;
  model: string;
}

/**
 * Mapping task → model. If an entry is missing, `defaults[tier]` applies;
 * if that's missing too, the task runs without an LLM — the app stays usable.
 */
export interface Routing {
  tasks: Partial<Record<TaskKind, ModelRef>>;
  defaults: Partial<Record<ModelTier, ModelRef>>;
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  task: TaskKind;
  messages: ChatTurn[];
  maxTokens?: number;
  temperature?: number;
  /** JSON schema, if the response should be structured. */
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface CompletionResult {
  text: string;
  model: ModelRef;
  usage?: Usage;
  latencyMs: number;
}

/** Why an LLM task couldn't run — as a state, not a crash. */
export interface LlmUnavailable {
  reason: 'no-route' | 'provider-disabled' | 'no-key' | 'unreachable' | 'error';
  task: TaskKind;
  detail?: string;
}

/** Whether a platform-specific fact could be determined. */
export type MachineDetection = 'not-attempted' | 'detected' | 'unknown';

/**
 * A flat snapshot of what this machine can carry for a local model. Deliberately
 * a flat object, not a nested one: every field is independently fillable and
 * fixture-able in tests, and there are no nested surprises for a later verdict
 * step to unpack. Numeric facts are `number | null` — `null` means "couldn't be
 * determined", never a guessed zero. Facts main can't detect cheaply (GPU/VRAM)
 * carry a `detection` marker next to the value so callers can tell "unknown" from
 * "detected as absent".
 */
export interface MachineFacts {
  totalRamMb: number | null;
  cpuCores: number | null;
  platform: string | null;
  arch: string | null;
  freeDiskMb: number | null;
  /** Dedicated VRAM, in MB. Filled in by platform-specific detection (D2). */
  vramMb: number | null;
  /** Name of the detected GPU, if any. Filled in by platform-specific detection (D2). */
  gpuName: string | null;
  /** Whether GPU detection (vramMb/gpuName) was attempted and, if so, whether it succeeded. */
  gpuDetection: MachineDetection;
  /** Why GPU detection didn't produce a value, if `gpuDetection` isn't `'detected'`. */
  gpuDetectionReason?: string;
}

/**
 * What ultimately capped the capacity estimate for a local model on this
 * machine. Lives in `@shared/types`, not in `core/llm/capacity.ts`, so the
 * renderer (a separate TypeScript project, see `tsconfig.web.json`) can read
 * the shape of `MachineScanResult.verdict` without pulling in the rest of
 * `core/llm` — only main is allowed to import and run `judgeCapacity` itself.
 */
export type LimitingFactor = 'ram' | 'vram' | 'cpu' | 'unknown';

/**
 * Structured result of the capacity judgement. Deliberately data, not a
 * sentence: the renderer assembles the actual copy from `t()` fragments plus
 * these fields, per guardrail 7 (no hardcoded language in core or renderer).
 */
export interface CapacityVerdict {
  limitingFactor: LimitingFactor;
  /** Conservative ceiling — leaves headroom for context and OS/app overhead. */
  maxComfortableParamsB: number | null;
  /** Optimistic ceiling — weights alone, no headroom. Above this, don't try. */
  maxPossibleParamsB: number | null;
  /** Coarse open-weight size buckets that fit under `maxComfortableParamsB`. */
  tiersThatFit: string[];
  /** Always true: this is a rule of thumb, never a measurement. */
  heuristic: true;
  /** Which input facts were missing or unusable for this judgement. */
  unknowns: string[];
}

/** Result of a machine scan: the facts, main's capacity verdict on them, and when they were taken. */
export interface MachineScanResult {
  facts: MachineFacts;
  verdict: CapacityVerdict;
  scannedAt: string;
}
