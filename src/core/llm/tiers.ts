/* Leistungsklasse aus dem Modellnamen erraten. Das ist eine Heuristik und sagt
   das auch: sie steuert nur Vorschläge, niemals die Technik.

   Reihenfolge der Signale (das erste, das greift, entscheidet):
   1. Parametergröße im Namen — das verlässlichste Signal (`llama3.1:8b`).
   2. Namensmarken für klein (`mini`, `haiku`, `flash`, `small`).
   3. Namensmarken für groß (`opus`, `large`, `fable`).
   4. Namensmarken für mittel (`sonnet`, `4o`, `mixtral`).
   5. Sonst: `balanced` — die ehrlichste Annahme über ein unbekanntes Modell. */

import type { ModelTier, ProviderConfig } from '@shared/types';

export const TIER_ORDER: readonly ModelTier[] = ['cheap', 'balanced', 'strong'];

/** Bis zu dieser Größe (Milliarden Parameter) gilt ein Modell als klein. */
const CHEAP_MAX_B = 8;
/** Bis hierhin als mittel; darüber als groß. */
const BALANCED_MAX_B = 34;

const CHEAP_TOKENS = ['mini', 'nano', 'micro', 'tiny', 'small', 'haiku', 'flash', 'lite'];
const STRONG_TOKENS = ['opus', 'fable', 'large', 'ultra', 'max', 'heavy'];
const BALANCED_TOKENS = ['sonnet', 'medium', 'mixtral', 'turbo', '4o'];

/**
 * Größe in Milliarden Parametern aus dem Namen, oder null.
 * Mixture-of-Experts (`8x7b`) wird mit der doppelten Expertengröße gerechnet:
 * aktiv ist nur ein Bruchteil der Gewichte, die Qualität liegt entsprechend tiefer.
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

/** Grobe Leistungsklasse eines Modellnamens. Nie ein Fehler, immer ein Ergebnis. */
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
 * Zerlegt den Namen in Wörter. Das vermeidet Treffer mitten in Wörtern —
 * `gemini` enthält `mini`, ist aber kein kleines Modell.
 */
function tokensOf(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9.]+/)
      .filter((token) => token.length > 0),
  );
}

/** Ein einsetzbares Ziel: Provider, Modell, geschätzte Klasse, lokal oder nicht. */
export interface ModelCandidate {
  providerId: string;
  model: string;
  tier: ModelTier;
  local: boolean;
}

/** Alle Modelle aller eingeschalteten Provider, in Provider-Reihenfolge. */
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
  /** Sensible Aufgaben gehören auf lokale Provider, wenn es welche gibt. */
  sensitive: boolean;
}

/**
 * Bewertung: kleiner ist besser. Abstand zur gewünschten Klasse zählt am
 * meisten; danach entscheidet, ob lokal passt.
 */
function score(candidate: ModelCandidate, wanted: ModelTier, options: PickOptions): number {
  const distance = Math.abs(TIER_ORDER.indexOf(candidate.tier) - TIER_ORDER.indexOf(wanted));
  let value = distance * 10;
  if (options.sensitive) {
    // Ein lokales Modell der falschen Klasse ist besser als ein Cloud-Modell mit Tagebuchinhalt.
    value += candidate.local ? 0 : 50;
  } else if (wanted === 'strong') {
    // Für die großen Urteile ist Cloud in der Regel stärker.
    value += candidate.local ? 3 : 0;
  } else {
    // Reicht es lokal, kostet es nichts.
    value += candidate.local ? 0 : 3;
  }
  return value;
}

/** Bestes Modell für eine gewünschte Klasse, oder null wenn es keine Modelle gibt. */
export function pickCandidate(
  candidates: readonly ModelCandidate[],
  wanted: ModelTier,
  options: PickOptions,
): ModelCandidate | null {
  let best: ModelCandidate | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const value = score(candidate, wanted, options);
    // Strikt kleiner: bei Gleichstand gewinnt der zuerst angelegte Provider.
    if (value < bestScore) {
      best = candidate;
      bestScore = value;
    }
  }
  return best;
}
