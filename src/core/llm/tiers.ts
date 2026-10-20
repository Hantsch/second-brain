/* Guessing the performance tier from the model name. This is a heuristic and
   says so: it only steers suggestions, never the actual mechanics.

   Order of signals (the first one that matches decides):
   1. Parameter size in the name — the most reliable signal (`llama3.1:8b`).
   2. Name markers for small (`mini`, `haiku`, `flash`, `small`).
   3. Name markers for large (`opus`, `large`, `fable`).
   4. Name markers for medium (`sonnet`, `4o`, `mixtral`).
   5. Otherwise: `balanced` — the most honest assumption about an unknown model. */

import type { ModelTier, ProviderConfig } from '@shared/types';

export const TIER_ORDER: readonly ModelTier[] = ['cheap', 'balanced', 'strong'];

/** Up to this size (billions of parameters), a model counts as small. */
const CHEAP_MAX_B = 8;
/** Up to here as medium; above it as large. */
const BALANCED_MAX_B = 34;

/** Up to this size, a `cheap` model counts as `tiny` (032). */
const TINY_MAX_B = 2;
/** Up to this size, a `cheap` model counts as `small`, otherwise `mid` (032). */
const SMALL_MAX_B = 4;

const CHEAP_TOKENS = ['mini', 'nano', 'micro', 'tiny', 'small', 'haiku', 'flash', 'lite'];
const STRONG_TOKENS = ['opus', 'fable', 'large', 'ultra', 'max', 'heavy'];
const BALANCED_TOKENS = ['sonnet', 'medium', 'mixtral', 'turbo', '4o'];

/**
 * Size in billions of parameters from the name, or null.
 * Mixture-of-experts (`8x7b`) is computed as double the expert size: only a
 * fraction of the weights are active, so the quality sits correspondingly lower.
 */
export function parameterBillions(name: string): number | null {
  const lower = name.toLowerCase();
  const moe = /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*b(?![a-z0-9])/.exec(lower);
  if (moe?.[2]) return Number(moe[2]) * 2;

  let biggest: number | null = null;
  for (const match of lower.matchAll(/(\d+(?:\.\d+)?)\s*b(?![a-z0-9])/g)) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && (biggest === null || value > biggest)) biggest = value;
  }
  return biggest;
}

/** Rough performance tier of a model name. Never an error, always a result. */
export function classifyModelTier(name: string): ModelTier {
  const tokens = tokensOf(name);

  const size = parameterBillions(name);
  if (size !== null) {
    if (size <= CHEAP_MAX_B) return 'cheap';
    if (size <= BALANCED_MAX_B) return 'balanced';
    return 'strong';
  }

  if (CHEAP_TOKENS.some((token) => tokens.has(token))) return 'cheap';
  if (STRONG_TOKENS.some((token) => tokens.has(token))) return 'strong';
  if (BALANCED_TOKENS.some((token) => tokens.has(token))) return 'balanced';
  return 'balanced';
}

/**
 * Finer-grained size band inside the `cheap` tier (032): a 1.2B model and an
 * 8B model are both `cheap`, but only one of them can carry a task's actual
 * work — this band is the signal `minLocalParamsB` checks against. Only
 * meaningful for models already classified `cheap` (paramsB <= CHEAP_MAX_B),
 * but the function itself doesn't enforce that.
 */
export function cheapSizeBand(paramsB: number): 'tiny' | 'small' | 'mid' {
  if (paramsB <= TINY_MAX_B) return 'tiny';
  if (paramsB <= SMALL_MAX_B) return 'small';
  return 'mid';
}

/**
 * Floor, in billions of parameters, a local model must clear to run a task of
 * this tier at all — independent of `CHEAP_MAX_B`/`BALANCED_MAX_B`, which only
 * say what still counts as fast/cheap, not what's capable enough. A task can
 * override this with `TaskDefinition.minLocalParamsB` (032).
 */
export const MIN_LOCAL_PARAMS_B_BY_TIER: Record<ModelTier, number> = {
  cheap: 3, // First `TIER_LANDMARKS_B` landmark in src/core/llm/capacity.ts.
  balanced: 7, // Second `TIER_LANDMARKS_B` landmark in src/core/llm/capacity.ts.
  strong: 13, // First `TIER_LANDMARKS_B` landmark above CHEAP_MAX_B.
};

/**
 * Splits the name into words. This avoids matches in the middle of words —
 * `gemini` contains `mini`, but is not a small model.
 */
function tokensOf(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9.]+/)
      .filter((token) => token.length > 0),
  );
}

/** A usable target: provider, model, estimated tier, local or not. */
export interface ModelCandidate {
  providerId: string;
  model: string;
  tier: ModelTier;
  local: boolean;
}

/** All models of all enabled providers, in provider order. */
export function collectCandidates(providers: readonly ProviderConfig[]): ModelCandidate[] {
  const candidates: ModelCandidate[] = [];
  for (const provider of providers) {
    if (!provider.enabled) continue;
    for (const model of provider.models) {
      candidates.push({
        providerId: provider.id,
        model,
        tier: classifyModelTier(model),
        local: provider.local,
      });
    }
  }
  return candidates;
}

export interface PickOptions {
  /** Sensitive tasks belong on local providers, if any are available. */
  sensitive: boolean;
}

/**
 * Scoring: smaller is better. Distance to the desired tier counts the
 * most; after that, whether local fits decides.
 */
function score(candidate: ModelCandidate, wanted: ModelTier, options: PickOptions): number {
  const distance = Math.abs(TIER_ORDER.indexOf(candidate.tier) - TIER_ORDER.indexOf(wanted));
  let value = distance * 10;
  if (options.sensitive) {
    // A local model of the wrong tier is better than a cloud model with journal content.
    value += candidate.local ? 0 : 50;
  } else if (wanted === 'strong') {
    // For the big judgment calls, cloud is usually stronger.
    value += candidate.local ? 3 : 0;
  } else {
    // If local is good enough, it costs nothing.
    value += candidate.local ? 0 : 3;
  }
  return value;
}

/** Best model for a desired tier, or null if there are no models. */
export function pickCandidate(
  candidates: readonly ModelCandidate[],
  wanted: ModelTier,
  options: PickOptions,
): ModelCandidate | null {
  let best: ModelCandidate | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const value = score(candidate, wanted, options);
    // Strictly less than: in a tie, the provider created first wins.
    if (value < bestScore) {
      best = candidate;
      bestScore = value;
    }
  }
  return best;
}
