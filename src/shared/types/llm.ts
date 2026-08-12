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
