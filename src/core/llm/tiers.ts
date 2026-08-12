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
