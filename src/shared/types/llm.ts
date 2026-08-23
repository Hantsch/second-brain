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
  /** Find things announced in the journal and never followed up on. */
  | 'journal-loose-ends'
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
  /** Rough typical input/output token counts for this task, used to estimate cost per
      run. A heuristic guess, not measured — see src/core/llm/tasks.ts for per-task
      reasoning. */
  typicalTokens: { in: number; out: number };
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
  /**
   * Dedicated VRAM, in MB — the effective value: `manualVramMb` wins over
   * `detectedVramMb` when both are present (028). Everything downstream
   * (`judgeCapacity`, the fact rows) reads this field and needs no separate
   * merge logic.
   */
  vramMb: number | null;
  /** Name of the detected GPU, if any. Filled in by platform-specific detection (D2). */
  gpuName: string | null;
  /** Whether GPU detection (vramMb/gpuName) was attempted and, if so, whether it succeeded. */
  gpuDetection: MachineDetection;
  /** Why GPU detection didn't produce a value, if `gpuDetection` isn't `'detected'`. */
  gpuDetectionReason?: string;
  /**
   * What platform-specific detection actually measured, before any manual
   * override is applied (028) — `null` when detection didn't produce a
   * number (matches `gpuDetection` not being `'detected'`). Optional (like
   * `gpuDetectionReason`) so existing fact literals built before the merge
   * step (D2) landed keep compiling; the merge step always sets it.
   */
  detectedVramMb?: number | null;
  /**
   * The VRAM figure the user typed in by hand (028's machine-local
   * `machine.vramOverrideMb` setting), independent of what detection found —
   * `null` when nothing was entered. Optional for the same reason as
   * `detectedVramMb`.
   */
  manualVramMb?: number | null;
  /**
   * Where the effective `vramMb` came from: `'manual'` when an entered value
   * is in effect (it always wins over detection), `'detected'` when only
   * detection produced a number, `'none'` when neither did. Optional for the
   * same reason as `detectedVramMb`.
   */
  vramSource?: 'detected' | 'manual' | 'none';
  /**
   * True when both a detected and a manually entered VRAM figure exist and
   * they disagree — surfaced so the user can resolve it (028, Q2) instead of
   * the app silently picking a winner. Optional for the same reason as
   * `detectedVramMb`.
   */
  vramConflict?: boolean;
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
  /**
   * The resource budget percentage the verdict was planned against (029),
   * when `judgeCapacity` was called with one — `undefined` for a verdict
   * produced before this parameter existed or without an explicit budget
   * (100%, i.e. no reduction). Optional so existing verdict literals built
   * before this deliverable keep compiling.
   */
  budgetPercent?: number;
  /** VRAM, in MB, the verdict was planned against after applying
      `budgetPercent` to `MachineFacts.vramMb` — `undefined` under the same
      conditions as `budgetPercent`. */
  plannedVramMb?: number;
  /** RAM, in MB, the verdict was planned against after applying
      `budgetPercent` to `MachineFacts.totalRamMb` — `undefined` under the
      same conditions as `budgetPercent`. */
  plannedRamMb?: number;
}

/** Result of a machine scan: the facts, main's capacity verdict on them, and when they were taken. */
export interface MachineScanResult {
  facts: MachineFacts;
  verdict: CapacityVerdict;
  scannedAt: string;
}

/**
 * Status of the Ollama runtime on this machine (019c, "a local runtime
 * without typing a command"): `'running'` if its endpoint answers,
 * `'installed-stopped'` if the binary is found (on `PATH` or at the known
 * per-platform default location) but the endpoint doesn't, `'absent'` if
 * neither. Lives in `@shared/types` so `src/shared/ipc.ts` can type the
 * `llm:localRuntimeStatus` channel without pulling in
 * `main/ipc/llm-detect.ts` — only main may import and run the detection
 * itself. Distinct from `llm:detectLocal`, which checks every local preset's
 * endpoint at once; this one is specific to guiding the "get a runtime" flow.
 */
export type LocalRuntimeStatus = 'absent' | 'installed-stopped' | 'running';

/**
 * Why an in-app install of the local runtime isn't possible on this machine.
 * Closed set. Lives in `@shared/types` (not in `core/llm/runtime-plan.ts`),
 * following the same convention as `LimitingFactor` — the renderer types the
 * plan without pulling in the rest of `core/llm`.
 *
 * - `'unsupported-platform'` — Ollama ships an official downloadable GUI
 *   installer only for Windows and macOS. Linux's official install path is a
 *   shell script (`curl | sh`), which this app's guardrails forbid running as
 *   a constructed shell command — a deliberate, documented scope decision.
 * - `'insufficient-disk'` — free disk space is below the installer size plus
 *   a safety margin.
 * - `'no-write-permission'` — the target temp directory refused a probe
 *   write. Main determines this (it is the one thing this judgement cannot
 *   stay pure and still know); `planRuntimeInstall` only reacts to it.
 */
export type RuntimeBlockedReason =
  'unsupported-platform' | 'insufficient-disk' | 'no-write-permission';

/**
 * Precondition judgement for getting the local runtime installed in-app
 * (019c, D1): whether an install can even be attempted here, and if so, what
 * it would cost and where things would go. Re-exported from
 * `core/llm/runtime-plan.ts` for that module's own callers, the same pattern
 * `capacity.ts` uses for `CapacityVerdict`.
 */
export interface RuntimePlan {
  canInstall: boolean;
  blockedReason: RuntimeBlockedReason | null;
  /** Size of the installer download, in MB. */
  downloadMb: number;
  /** Where the installer would be saved — a hint string, not a guarantee. */
  installerPath: string;
  /** Where Ollama would store pulled models on this machine. */
  modelDirHint: string;
}

/**
 * Why this target was picked, or why nothing was picked. Closed set. Lives in
 * `@shared/types` (not in `core/llm/recommend.ts`), so `src/shared/ipc.ts` —
 * used by the renderer via preload — can type the `llm:recommendModels`
 * channel without pulling in the rest of `core/llm`; only main may import and
 * run `recommendModels` itself. Re-exported from `core/llm/recommend.ts` for
 * that module's own callers' convenience.
 *
 * - `'best-fit-for-task'` — the pick's heuristic tier matches the task's
 *   `suggested` tier exactly.
 * - `'cheapest-reachable'` — no reachable candidate matched the suggested
 *   tier, so the cheapest reachable one was picked instead.
 * - `'only-local-option'` — every surviving candidate is a local model (there
 *   was nothing cloud-based to compare against), and none matched the
 *   suggested tier exactly either.
 * - `'no-reachable-model'` — nothing on the catalogue is reachable on this
 *   machine/configuration for this task.
 * - `'sensitive-rule-no-qualifying-target'` — the task reads personal content
 *   and every reachable candidate was refused by the sensitive-task rule
 *   (see `sensitive.ts`).
 */
export type RecommendationReasonKey =
  | 'best-fit-for-task'
  | 'cheapest-reachable'
  | 'only-local-option'
  | 'no-reachable-model'
  | 'sensitive-rule-no-qualifying-target';

/**
 * What the user gives up by taking the pick over an alternative. Deliberately
 * a single generic key rather than a per-comparison taxonomy (cost vs.
 * quality vs. privacy vs. speed): the story allows this simplification
 * explicitly, and a closed set of one is still closed. Set whenever
 * `alternatives` is non-empty; `null` when there is nothing to trade off.
 */
export type RecommendationTradeoffKey = 'cheaper-alternative-available';

export interface TaskRecommendation {
  task: TaskKind;
  pick: ModelRef | null;
  reasonKey: RecommendationReasonKey;
  tradeoffKey: RecommendationTradeoffKey | null;
  /** USD estimate for one run at the task's typical token counts, or `null`
   *  for a local model or when a catalogue price is missing. Never guessed. */
  costPerRun: number | null;
  /** Carried for every row (not only sensitive ones) — simpler than a
   *  sensitive-only branch, and the AC only requires it for sensitive rows. */
  policySource: string | null;
  policyReadAt: string | null;
  /** Set when the pick is a local model not yet installed, but this
   *  machine's capacity verdict says it can carry it (reachability's
   *  `'needs-download'` status) — the renderer labels this "needs a download
   *  of X GB" instead of a cost figure. `null` when the pick is already
   *  installed or is a cloud model. */
  needsDownloadGb: number | null;
  /** Remaining surviving candidates, capped so the UI has a short swap list
   *  rather than the whole catalogue. */
  alternatives: ModelRef[];
}

export interface RecommendationSet {
  catalogueGeneratedAt: string;
  catalogueStale: boolean;
  tasks: TaskRecommendation[];
}
