/* Picks the flags the llama.cpp engine is started with on this machine (034):
   how many model layers go to the GPU, how large the context is, how many
   threads run on the CPU. Pure arithmetic over facts that are already known or
   `null` — no filesystem, no process, no Electron. Same facts plus same budget
   in, same plan out; spawning, the model path and the port stay in main (D3),
   so neither appears in `argv`.

   Planned memory is NOT re-derived here. `judgeCapacity` (`./capacity.ts`)
   already does raw figure − fixed reserve × budget percent, in that order, and
   this module consumes its `plannedVramMb`/`plannedRamMb` unchanged. Every
   number below is spent on top of those two figures. That means the VRAM
   headroom `capacity.ts` reserves (a flat driver/allocator margin, taken
   before the budget) and the KV cache estimated here (context-dependent, taken
   from the budgeted figure) overlap a little. Deliberate: offloading too many
   layers means the engine fails to start, offloading too few only means it is
   slower — so the plan errs low.

   The three values are interdependent, so the resolution order is fixed:

     1. total layers   — `model.totalLayers` when the caller knows it, else the
                         `LAYER_LANDMARKS` table from `model.paramsB`. An
                         estimated count is marked in the reason code, because
                         every layer figure downstream inherits its error.
     2. context tokens — highest rung of `CONTEXT_LADDER` whose KV-cache
                         estimate stays inside `KV_CACHE_BUDGET_SHARE` of the
                         planned memory of the path we are on (VRAM when there
                         is a GPU figure, RAM otherwise). Chosen BEFORE the
                         layer count on purpose: a context is a capability the
                         user notices when it is missing, while a smaller
                         offload only costs speed. Simplification: on the GPU
                         path the context is sized against VRAM even though a
                         plan that ends at 0 offloaded layers would in fact
                         keep its KV cache in RAM — the tighter figure wins.
     3. gpu layers     — what is left of the planned VRAM after step 2's KV
                         cache, divided by the per-layer share of the file.
                         Simplification: the KV cache of *all* layers is
                         charged to VRAM even when only part of the model is
                         offloaded, for the same conservative reason as above.
     4. threads        — independent of the other two.

   Reason codes. Every value carries `<code>:<numbers>[:estimated]` — a code,
   never a sentence (guardrail 7); the card in D4 translates it via `t()`. The
   optional trailing `:estimated` segment says the layer count came from the
   landmark table rather than from the model itself. The vocabulary:

     gpuLayers      `vram-fit:<n>/<total>`      derived from the planned VRAM
                    `no-vram:0/<total>`         no GPU figure to plan against
                    `unknown-size:0/<total>`    file size unusable, can't size
                    `manual:<n>/<total>`        hand-entered (Decisions, Q1)
     contextTokens  `context-fits:<tokens>`     highest ladder rung that fits
                    `context-floor:<tokens>`    nothing fit; floor used anyway
                    `manual:<tokens>`           hand-entered
     threads        `threads-budget:<n>/<cores>` derived from cores × budget
                    `threads-default:<n>`       core count unknown */

import { judgeCapacity } from './capacity';
import type {
  LlamaModelFile,
  LlamaOverrides,
  LlamaStartPlan,
  LlamaStartValue,
  LlamaStartWarning,
  MachineFacts,
} from '@shared/types';

/** Context sizes offered, largest first (Decisions, Q4). */
const CONTEXT_LADDER: readonly number[] = [8192, 4096, 2048];

/**
 * The context the engine is started with when not even the smallest rung fits
 * (Decisions, Q4). A floor to start at, never a refusal threshold: the user
 * chose "start small and warn" over "refuse", so this value ships with a
 * `'slow-floor-context'` warning rather than an error.
 */
export const MIN_CONTEXT_TOKENS = 2048;

/**
 * Upper bound for a hand-entered context (Decisions, Q1). 128k is the largest
 * window common local models advertise; above it the number is a typo, not a
 * setting, and clamping is friendlier than refusing the whole plan.
 */
const MAX_CONTEXT_TOKENS = 131072;

/**
 * KB of KV cache per token per layer at f16. Landmark arithmetic, not
 * measured: Llama-2-7B (no GQA, 4096-wide KV) costs 2 × 4096 × 2 bytes = 16 KB
 * per token per layer, a GQA model like Llama-3-8B (1024-wide KV) costs 4 KB.
 * 8 KB sits between the two — conservative for modern GQA files without
 * collapsing every plan on a small GPU, which a flat 16 KB would.
 */
const KV_CACHE_KB_PER_TOKEN_PER_LAYER = 8;

/**
 * Share of the planned memory the KV cache may claim. A context only "fits" if
 * it leaves room for the weights that use it: at 100% a rung whose cache eats
 * the whole budget would be reported as fitting while offloading zero layers.
 */
const KV_CACHE_BUDGET_SHARE = 0.5;

/** Threads used when the core count is unknown — llama.cpp's own default. */
const DEFAULT_THREADS = 4;

/**
 * Layer count used when neither `totalLayers` nor `paramsB` is known. The 7B/8B
 * landmark below: the most common size of a local GGUF, and the middle of the
 * table, so the error is bounded in both directions.
 */
const DEFAULT_TOTAL_LAYERS = 32;

/**
 * Rule-of-thumb transformer block counts for the llama-family sizes people
 * actually run, in the same spirit as `TIER_LANDMARKS_B` in `capacity.ts`:
 * familiar landmarks, not a catalog. Read as "up to `maxParamsB` billion
 * parameters, assume `layers` blocks" — Llama-3.2-1B has 16, Llama-3.2-3B 28,
 * Llama-2-7B and Llama-3-8B 32, Llama-2-13B 40, CodeLlama-34B 48, Llama-3-70B
 * 80. Only ever a fallback: a real count from the caller always wins.
 */
const LAYER_LANDMARKS: readonly { maxParamsB: number; layers: number }[] = [
  { maxParamsB: 1.5, layers: 16 },
  { maxParamsB: 3.5, layers: 28 },
  { maxParamsB: 9, layers: 32 },
  { maxParamsB: 15, layers: 40 },
  { maxParamsB: 40, layers: 48 },
  { maxParamsB: 80, layers: 80 },
];

/**
 * Landmark block count for a parameter size. Above the largest landmark the
 * largest count stands rather than an extrapolation — nobody offloads a 405B
 * model onto a consumer GPU, and a guessed number would look precise. Nonsense
 * input (`NaN`, `<= 0`) degrades to the default instead of throwing.
 */
export function estimateTotalLayers(paramsB: number): number {
  if (!Number.isFinite(paramsB) || paramsB <= 0) return DEFAULT_TOTAL_LAYERS;
  for (const landmark of LAYER_LANDMARKS) {
    if (paramsB <= landmark.maxParamsB) return landmark.layers;
  }
  return LAYER_LANDMARKS[LAYER_LANDMARKS.length - 1]!.layers;
}

export interface LlamaStartInput {
  facts: MachineFacts;
  /** 029's resource budget, passed straight through to `judgeCapacity`. */
  budgetPercent: number;
  model: LlamaModelFile;
  /** `machine.llamaOverrides` (Decisions, Q1); `null` fields derive as usual. */
  overrides?: LlamaOverrides;
}

/**
 * Facts + budget + model file → the flags to start with. Never throws and
 * never refuses: an unusable machine still gets a plan, at the context floor
 * and entirely on the CPU, with the warnings that say so.
 */
export function planLlamaStart({
  facts,
  budgetPercent,
  model,
  overrides,
}: LlamaStartInput): LlamaStartPlan {
  const verdict = judgeCapacity(facts, budgetPercent);
  // `undefined` (no GPU at all, or no RAM figure) and 0 are the same thing for
  // planning: nothing to plan against on that path.
  const plannedVramMb = verdict.plannedVramMb ?? 0;
  const plannedRamMb = verdict.plannedRamMb ?? 0;

  const { totalLayers, estimated } = resolveTotalLayers(model);
  const contextMemoryMb = plannedVramMb > 0 ? plannedVramMb : plannedRamMb;

  const context = resolveContext(overrides?.contextTokens, contextMemoryMb, totalLayers);
  const contextTokens = context.value;
  const gpuLayers = resolveGpuLayers({
    override: overrides?.gpuLayers,
    plannedVramMb,
    fileSizeMb: model.fileSizeMb,
    totalLayers,
    contextTokens: contextTokens.value,
    estimated,
  });
  const threads = resolveThreads(facts.cpuCores, budgetPercent);

  // Fixed order, so two identical inputs produce two identical arrays.
  const warnings: LlamaStartWarning[] = [];
  // Not only the "no GPU figure" case: a plan that offloads nothing runs on
  // the CPU whatever the reason, and the card must say so either way.
  if (gpuLayers.value === 0) warnings.push('cpu-only');
  if (context.hitFloor) warnings.push('slow-floor-context');
  // `cpuCores === null` always shows up as `'cpu'` in `unknowns`, so the thread
  // fallback is covered; the explicit check also catches a nonsense core count.
  if (verdict.unknowns.length > 0 || threads.source === 'fallback') {
    warnings.push('facts-unknown');
  }

  return {
    gpuLayers,
    contextTokens,
    threads,
    warnings,
    argv: [
      '-ngl',
      String(gpuLayers.value),
      '-c',
      String(contextTokens.value),
      '-t',
      String(threads.value),
    ],
  };
}

/** MB of KV cache a context of this size costs across this many layers. */
function kvCacheMb(contextTokens: number, totalLayers: number): number {
  return (contextTokens * totalLayers * KV_CACHE_KB_PER_TOKEN_PER_LAYER) / 1024;
}

/** Clamp that also swallows `NaN`/`Infinity`, so no non-number reaches `argv`. */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** An override counts as set only if it is an actual number; anything else derives. */
function overrideValue(raw: number | null | undefined): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function resolveTotalLayers(model: LlamaModelFile): { totalLayers: number; estimated: boolean } {
  if (model.totalLayers !== null && Number.isFinite(model.totalLayers) && model.totalLayers > 0) {
    return { totalLayers: Math.floor(model.totalLayers), estimated: false };
  }
  if (model.paramsB !== null) {
    return { totalLayers: estimateTotalLayers(model.paramsB), estimated: true };
  }
  return { totalLayers: DEFAULT_TOTAL_LAYERS, estimated: true };
}

function resolveContext(
  override: number | null | undefined,
  plannedMemoryMb: number,
  totalLayers: number,
): { value: LlamaStartValue<number>; hitFloor: boolean } {
  const manual = overrideValue(override);
  if (manual !== null) {
    const value = clamp(Math.floor(manual), MIN_CONTEXT_TOKENS, MAX_CONTEXT_TOKENS);
    // A hand-entered floor value is a choice, not a shortfall: no warning.
    return { value: { value, source: 'manual', reason: `manual:${value}` }, hitFloor: false };
  }

  const kvBudgetMb = plannedMemoryMb * KV_CACHE_BUDGET_SHARE;
  for (const rung of CONTEXT_LADDER) {
    if (kvCacheMb(rung, totalLayers) <= kvBudgetMb) {
      return {
        value: { value: rung, source: 'derived', reason: `context-fits:${rung}` },
        hitFloor: false,
      };
    }
  }
  return {
    value: {
      value: MIN_CONTEXT_TOKENS,
      source: 'floor',
      reason: `context-floor:${MIN_CONTEXT_TOKENS}`,
    },
    hitFloor: true,
  };
}

function resolveGpuLayers(input: {
  override: number | null | undefined;
  plannedVramMb: number;
  fileSizeMb: number;
  totalLayers: number;
  contextTokens: number;
  estimated: boolean;
}): LlamaStartValue<number> {
  const { plannedVramMb, fileSizeMb, totalLayers, contextTokens } = input;
  const suffix = input.estimated ? ':estimated' : '';

  const manual = overrideValue(input.override);
  if (manual !== null) {
    const value = clamp(Math.floor(manual), 0, totalLayers);
    return { value, source: 'manual', reason: `manual:${value}/${totalLayers}${suffix}` };
  }
  if (plannedVramMb <= 0) {
    return { value: 0, source: 'derived', reason: `no-vram:0/${totalLayers}${suffix}` };
  }

  const perLayerMb = fileSizeMb > 0 ? fileSizeMb / totalLayers : 0;
  if (perLayerMb <= 0) {
    return { value: 0, source: 'derived', reason: `unknown-size:0/${totalLayers}${suffix}` };
  }
  const remainingVramMb = plannedVramMb - kvCacheMb(contextTokens, totalLayers);
  const value = clamp(Math.floor(remainingVramMb / perLayerMb), 0, totalLayers);
  return { value, source: 'derived', reason: `vram-fit:${value}/${totalLayers}${suffix}` };
}

/**
 * Threads get the budgeted share of the cores but never the last one — a
 * llama.cpp run that owns every core makes the machine itself unresponsive,
 * which is the opposite of what the budget setting is for.
 */
function resolveThreads(cpuCores: number | null, budgetPercent: number): LlamaStartValue<number> {
  if (cpuCores === null || !Number.isFinite(cpuCores) || cpuCores < 1) {
    return {
      value: DEFAULT_THREADS,
      source: 'fallback',
      reason: `threads-default:${DEFAULT_THREADS}`,
    };
  }
  const cores = Math.floor(cpuCores);
  const value = clamp(Math.round(cores * (budgetPercent / 100)), 1, Math.max(1, cores - 1));
  return { value, source: 'derived', reason: `threads-budget:${value}/${cores}` };
}
