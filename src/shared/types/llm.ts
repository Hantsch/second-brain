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
  /** Answer a question against Gaston's vault, with citations. */
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
  | 'gardener-audit'
  /** Condense an area's notes, todos and day entries into a shorter overview. */
  | 'condense-area'
  /** Condense an entire project into one artifact file. */
  | 'condense-project'
  /** Condense a module's wiki pages into one overview: decided, open, contradictions. */
  | 'condense-module';

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
  /**
   * Overrides the tier-derived minimum local model size (032,
   * `MIN_LOCAL_PARAMS_B_BY_TIER` in `src/core/llm/tiers.ts`) for this specific
   * task — for format-shaped tasks whose output is small enough that a ~1B
   * model suffices, even though the tier's general floor is higher.
   * `undefined` means "use the tier's floor".
   */
  minLocalParamsB?: number;
}

/** A concrete target: provider + model. */
export interface ModelRef {
  providerId: string;
  model: string;
}

/**
 * The route that hands a task to the coding agent instead of a model: the
 * gateway files it as a job in `.secondbrain/agent/jobs/` and answers with the
 * agent's result once one exists. A reserved provider id rather than a new
 * routing shape, so settings, IPC and the routing table carry it unchanged.
 */
export const AGENT_ROUTE: ModelRef = { providerId: 'agent', model: 'agent' };

export function isAgentRoute(ref: ModelRef | null | undefined): boolean {
  return ref?.providerId === AGENT_ROUTE.providerId;
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
  reason:
    | 'no-route'
    | 'provider-disabled'
    | 'no-key'
    | 'unreachable'
    | 'error'
    /* Routed to the agent: the job is filed and waits for its result. */
    | 'agent-pending'
    /* The agent answered the job with `failed` or `skipped`; `detail` carries its reason. */
    | 'agent-failed';
  task: TaskKind;
  /** Label of the provider the route points at, when the provider is the cause. */
  provider?: string;
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
 * Which local runtime a channel or plan is about (033). Ollama stays the
 * recommended default (Decisions, Q5); llama.cpp is the explicit-choice
 * option for GPU-offload/context control. Closed set — the runtime channels
 * (`llm:localRuntimeStatus`, `llm:runtimeInstallPlan`, ...) dispatch on this
 * rather than assuming Ollama, so a second runtime is additive, not a
 * parallel channel set (Decisions, Q6).
 */
export type RuntimeId = 'ollama' | 'llamacpp';

/**
 * Which build of the llama.cpp engine to fetch — the knob Ollama hides that
 * this whole story exists to expose (GPU offload, context size). Closed set,
 * one entry per asset in `core/llm/runtime/descriptors.ts`'s table:
 * `'cuda'`/`'vulkan'`/`'cpu'` on Windows and Linux, `'macos'` for Apple
 * Silicon (a single universal build there, no vendor branching needed).
 * Chosen by `core/llm/runtime/engine-build.ts` (033, D2) from the GPU scan,
 * shown as a preselected, overridable choice (guardrail 2).
 */
export type EngineBuildId = 'cuda' | 'vulkan' | 'cpu' | 'macos';

/**
 * Structured reasoning behind a preselected engine build (033, D2/D10) — a
 * closed shape rather than a composed sentence, so the renderer can
 * translate it into the UI language via `t()` instead of displaying English
 * prose inside a German dialog. `gpuName` is the one piece of free text in
 * here, shown as data (a proper noun, like the hardware name already shown
 * elsewhere in Settings → Models), never as part of a translated sentence.
 */
export type EngineBuildReason =
  | { kind: 'no-gpu' }
  | { kind: 'macos' }
  | {
      kind: 'gpu';
      gpuName: string;
      /** Whether the scan was sure of this GPU name (`gpuDetection: 'detected'`)
          or only reported it without confirming (`'unknown'`). */
      confident: boolean;
      /** The vendor-preferred build before checking platform support. */
      requestedBuild: EngineBuildId;
      /** What was actually picked — equal to `requestedBuild` unless the
          platform's asset table had no entry for it. */
      actualBuild: EngineBuildId;
    };

/**
 * Precondition judgement for fetching a local runtime's engine OR a model
 * file into it (033, D1) — the generalisation of `RuntimePlan` (019c, Ollama
 * installer only) that both fetches share, since they differ only in what
 * asset/size they refer to, not in how platform/disk/writability are judged.
 * Lives in `@shared/types` for the same reason as `RuntimePlan`: the
 * renderer types a plan without pulling in the rest of `core/llm`. Re-
 * exported from `core/llm/runtime/plan.ts` for that module's own callers.
 */
export interface RuntimeDownloadPlan {
  runtime: RuntimeId;
  /** Which half of the flow this plan is for — an engine archive fetch or a
      model file fetch; both share this one shape (AC 4). */
  kind: 'engine' | 'model';
  canDownload: boolean;
  blockedReason: RuntimeBlockedReason | null;
  /** Size of the download, in MB — the summed engine archive(s) for
      `kind: 'engine'`, the picked file's size for `kind: 'model'`. */
  downloadMb: number;
  /** Where the fetch would be written — a hint string, not a guarantee. */
  targetPath: string;
  /** Free disk at plan time, in MB — `null` when undetermined. Carried
      through (not just used internally) so a refusal can name the actual
      number the UI shows (AC 5: "refused with the number named"). */
  freeDiskMb: number | null;
}

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
  /**
   * The engine build the GPU scan selected, and why (033, D2/D10) —
   * `undefined` for Ollama, which has no build variants. `options` lists
   * every build this platform has an asset for, so the install dialog can
   * offer the preselected one as an overridable choice rather than a fixed
   * fact (guardrail 2: the app proposes, the user confirms).
   */
  build?: { id: EngineBuildId; reason: EngineBuildReason; options: EngineBuildId[] };
}

/**
 * Why a Hugging Face lookup (search or file-list) came back without data —
 * closed set so a later renderer (D11) can show its own honest state instead
 * of a generic error, per the story's guardrail-3 rule against guessing.
 * Anonymous access only (Decisions: "Hugging Face access"): no token, so a
 * 401/403 always means the same thing — `'gated'` — never "wrong key".
 *
 * - `'gated'` — the repository needs access on huggingface.co (401/403).
 * - `'network-error'` — the request itself failed (DNS, connection, TLS).
 * - `'error'` — any other non-2xx response (e.g. a malformed id, a 5xx).
 */
export type HfLookupReason = 'gated' | 'network-error' | 'error';

/**
 * One Hugging Face model repository hit from a GGUF search (033, D3). Plain
 * and serialisable so it crosses the IPC boundary (D4) unchanged — no class,
 * no method. `downloads`/`likes` are `null` when the API response omits them
 * (never a guessed zero, same convention as `MachineFacts`).
 */
export interface HfModelSearchResult {
  id: string;
  downloads: number | null;
  likes: number | null;
  tags: string[];
}

/**
 * One `.gguf` file found in a model repository's tree (033, D3), already
 * filtered from whatever else the repo holds (READMEs, safetensors, …) and
 * carrying its own resolvable download URL so a caller never has to rebuild
 * it. `sizeBytes` is `null` when the tree entry didn't report a size.
 */
export interface HfModelFile {
  path: string;
  sizeBytes: number | null;
  /** Parsed from `path` by `core/llm/hf/quant.ts` — `null` when the filename
      carries no recognisable quantisation token. */
  quantisation: string | null;
  downloadUrl: string;
}

/**
 * A Hugging Face file `llm:pullModel` should fetch for the `'llamacpp'`
 * runtime (033, D7) — the fields `llamacpp-pull.ts` needs and nothing more:
 * enough to name the target file, download it, and size the free-disk check
 * against it. `llm:pullModel`'s `modelId` stays what it always was (Ollama's
 * model tag); this is carried alongside it as an optional field rather than
 * replacing `modelId`, since Ollama's pull needs no change (033 Plan, step 3:
 * "a small, contained contract extension, not a new channel"). `repoId` is
 * kept even though `downloadUrl` alone would be enough to fetch, because a
 * refusal or a log line naming the repository is more useful than a bare URL.
 */
export interface HfPullFile {
  repoId: string;
  /** The file's path inside the repository, e.g. `Q4_K_M/model.gguf` — used
      to derive the file name written under `models/gguf/`. */
  path: string;
  downloadUrl: string;
  /** `null` when Hugging Face's tree listing didn't report a size — the
      free-disk check then can't refuse in advance and the download itself is
      the honest source of truth. */
  sizeBytes: number | null;
}

/**
 * Outcome of a Hugging Face model search — a discriminated union rather than
 * a thrown error, since a gated repo or an offline network is an honest state
 * the UI names, not a bug (guardrail 3). An empty `results` array is still
 * `ok: true`: zero hits is a normal, valid answer, not a failure.
 */
export type HfModelSearchOutcome =
  { ok: true; results: HfModelSearchResult[] } | { ok: false; reason: HfLookupReason };

/** Outcome of listing a model repository's `.gguf` files — same shape and
    same reasoning as `HfModelSearchOutcome`. */
export type HfFileListOutcome =
  { ok: true; files: HfModelFile[] } | { ok: false; reason: HfLookupReason };

/**
 * Request for the `llm:searchModelFiles` channel (033, D4) — a discriminated
 * union rather than two channels, since D3's flow is always "search, then
 * list files for one of the hits" and both steps share the same honest-
 * failure shape (`HfLookupReason`). `step` doubles as the tag the response
 * carries back, so the renderer can narrow which outcome it got from one
 * response type instead of two.
 */
export type HfModelSearchRequest =
  { step: 'search'; query: string } | { step: 'files'; modelId: string };

/** Response for `llm:searchModelFiles` — `HfModelSearchOutcome` tagged with
    `step: 'search'`, or `HfFileListOutcome` tagged with `step: 'files'`. */
export type HfModelSearchResponse =
  ({ step: 'search' } & HfModelSearchOutcome) | ({ step: 'files' } & HfFileListOutcome);

/**
 * One installed `.gguf` file as far as the start-flag derivation (034, D1)
 * needs to know it: big enough to size the GPU offload against, small enough
 * that main can build it by looking at the file on disk. Deliberately no path
 * — `core/llm/llama-args.ts` must stay pure, and a model path is exactly what
 * guardrail 6 keeps out of anything derived (only main knows where the file
 * lives). `paramsB`/`totalLayers` are `null` when unknown rather than a
 * guessed zero (same convention as `MachineFacts`); 033 persists no metadata
 * catalog, so both usually arrive parsed from the file name and the plan then
 * marks its layer count as estimated.
 */
export interface LlamaModelFile {
  fileName: string;
  fileSizeMb: number;
  paramsB: number | null;
  totalLayers: number | null;
}

/**
 * Where one value in a `LlamaStartPlan` came from. Closed set, read by the
 * engine card (D4/D5) to label a row: `'manual'` is the hand-entered override
 * (Decisions, Q1), `'floor'` is `MIN_CONTEXT_TOKENS` used because nothing
 * larger fit (Decisions, Q4), `'fallback'` is a default substituted for a fact
 * the machine scan couldn't determine, `'derived'` is the normal case.
 */
export type LlamaValueSource = 'derived' | 'manual' | 'floor' | 'fallback';

/**
 * One planned start value plus why it has that number. `reason` is a reason
 * *code* with numbers in it (`'vram-fit:28/33'`), never a sentence — guardrail
 * 7: the renderer turns the code into UI-language copy via `t()`. The
 * vocabulary is documented at the top of `src/core/llm/llama-args.ts`.
 */
export interface LlamaStartValue<T> {
  value: T;
  source: LlamaValueSource;
  reason: string;
}

/**
 * A caveat about the plan the card has to show honestly (034, AC 3):
 * `'cpu-only'` — no layer goes to the GPU; `'slow-floor-context'` — started at
 * the context floor because nothing bigger fit (Decisions, Q4: warn, never
 * refuse); `'facts-unknown'` — at least one machine fact was missing, so a
 * default stood in for it.
 */
export type LlamaStartWarning = 'cpu-only' | 'slow-floor-context' | 'facts-unknown';

/**
 * The flags the llama.cpp engine would be started with, plus the reasoning
 * behind each of them. Data, not copy — the card (D4) composes the sentences.
 * `argv` carries only the derived flags: the model path and the port are
 * spawn-time concerns main appends (D3), and a path in here would leak into
 * every plan that crosses IPC (guardrail 6).
 */
export interface LlamaStartPlan {
  gpuLayers: LlamaStartValue<number>;
  contextTokens: LlamaStartValue<number>;
  threads: LlamaStartValue<number>;
  warnings: LlamaStartWarning[];
  argv: string[];
}

/**
 * The two numbers the user may set by hand behind the card's "advanced"
 * disclosure (Decisions, Q1), stored machine-local as
 * `machine.llamaOverrides`. `null` means "derive it" — never a magic 0, so
 * clearing a field is a real state and not a value that happens to disable
 * the GPU.
 */
export interface LlamaOverrides {
  gpuLayers: number | null;
  contextTokens: number | null;
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
 * - `'beyond-this-machine'` (032) — the task's minimum local model size is
 *   above what this machine's capacity verdict says it can carry at all, and
 *   no cloud candidate survived either. Deliberately no pick: naming a model
 *   too small for the task would route it to something that produces mush.
 *   Always accompanied by a `shortfall`.
 */
export type RecommendationReasonKey =
  | 'best-fit-for-task'
  | 'cheapest-reachable'
  | 'only-local-option'
  | 'no-reachable-model'
  | 'sensitive-rule-no-qualifying-target'
  | 'beyond-this-machine';

/**
 * The numbers behind a `'beyond-this-machine'` row (032): what the task needs,
 * what this machine carries, and whether there is an honest alternative to
 * point at. Data, not a sentence — the renderer builds the copy from `t()`.
 */
export interface RecommendationShortfall {
  /** Billions of parameters a local model must clear for this task
   *  (`MIN_LOCAL_PARAMS_B_BY_TIER`, or the task's own `minLocalParamsB`). */
  requiredParamsB: number;
  /** The machine's optimistic ceiling (`CapacityVerdict.maxPossibleParamsB`)
   *  — `null` only if that ceiling was unknown, which is never the case for a
   *  row that got here, since an unknown ceiling is never read as a block. */
  machineParamsB: number | null;
  /** Whether the catalogue holds a cloud model this task could use instead —
   *  for a sensitive task, only one the sensitive-task rule allows. Says
   *  nothing about whether a provider for it is already configured: the row
   *  names the honest options ("a cloud model for this one task, or nothing"),
   *  it does not promise one click. */
  cloudOptionAvailable: boolean;
}

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
   *  rather than the whole catalogue. As long as at least one candidate clears
   *  the task's minimum local size, one below it never appears here either
   *  (032, Q3a) — it must not be one click away in the swap list. When nothing
   *  reachable clears the minimum and the machine itself is not the limiting
   *  factor, the pre-032 list stands instead (below-floor entries included):
   *  `pick` is then one of them too, and hiding its peers would misrepresent
   *  the choice rather than improve it. */
  alternatives: ModelRef[];
  /**
   * Set exactly when `reasonKey` is `'beyond-this-machine'` (032), `null` for
   * every other reason. Optional, like `CapacityVerdict.budgetPercent`, so
   * recommendation literals written before this field existed keep compiling;
   * `recommendModels` itself always sets it explicitly.
   */
  shortfall?: RecommendationShortfall | null;
}

export interface RecommendationSet {
  catalogueGeneratedAt: string;
  catalogueStale: boolean;
  tasks: TaskRecommendation[];
}
