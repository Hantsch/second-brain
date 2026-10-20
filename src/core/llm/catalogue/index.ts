/* Curated catalogue of LLM models — local and cloud — with pricing and
   data-training policy, used by later deliverables (reachability filter,
   sensitive-task rule, recommendation engine) to steer model recommendations.

   `models.json` is hand-curated once per release from provider pricing pages
   and provider privacy/ToS pages; its `generatedAt` date is bumped by hand
   when the list is refreshed. Nothing in this file fetches anything live —
   a later deliverable merges live provider data over this bundled baseline.

   Every numeric/optional fact follows the same convention as `MachineFacts`
   in `@shared/types`: `null` means "not applicable or not known", never a
   guessed value. */

import type { ProviderKind } from '@shared/types';
import type { FetchLike } from '../types';
import { fetchOpenRouterEndpointPolicy, fetchOpenRouterPrices } from './openrouter';
import rawCatalogue from './models.json';

/** Whether a model's provider trains on submitted data. Never guessed. */
export type DataPolicy = 'no-training' | 'trains' | 'unknown';

/** One curated model entry. */
export interface CatalogueEntry {
  id: string;
  providerKind: ProviderKind;
  /** Parameter count in billions, or `null` when the provider doesn't disclose it. */
  paramsB: number | null;
  /** Local-only concept: disk footprint of the weights, or `null` for cloud models. */
  sizeOnDiskGb: number | null;
  /** e.g. "Q4_K_M", or `null` when not applicable (cloud) or not published. */
  quantisation: string | null;
  /** Cloud-only: USD per million input tokens, or `null` for local models. */
  priceInPerMTok: number | null;
  /** Cloud-only: USD per million output tokens, or `null` for local models. */
  priceOutPerMTok: number | null;
  dataPolicy: DataPolicy;
  /** Where the data-policy claim was read — a URL, or a short provider note for local models. */
  policySource: string;
  /** ISO date the policy was last read/confirmed. */
  policyReadAt: string;
}

/** Parsed, validated catalogue: the bundled `generatedAt` plus its entries. */
export interface Catalogue {
  generatedAt: string;
  entries: CatalogueEntry[];
}

/**
 * Thrown when a catalogue entry fails validation, naming which entry (by
 * position/id) and which field caused the rejection — never a generic
 * TypeError that leaves the caller guessing.
 */
export class CatalogueParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueParseError';
  }
}

const VALID_DATA_POLICIES: readonly DataPolicy[] = ['no-training', 'trains', 'unknown'];
const VALID_PROVIDER_KINDS: readonly ProviderKind[] = ['anthropic', 'openai-compatible', 'fake'];

/** Fields every entry must have; anything else is optional and defaults to `null`. */
function validateEntry(candidate: unknown, index: number): CatalogueEntry {
  if (typeof candidate !== 'object' || candidate === null) {
    throw new CatalogueParseError(`Catalogue entry #${index} is not an object.`);
  }
  // Narrowing an unknown JSON shape field by field before it becomes a
  // trusted CatalogueEntry — not an `any`, so no lint suppression needed.
  const entry = candidate as Record<string, unknown>;

  const id = entry.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new CatalogueParseError(`Catalogue entry #${index} is missing a valid "id".`);
  }

  const providerKind = entry.providerKind;
  if (
    typeof providerKind !== 'string' ||
    !VALID_PROVIDER_KINDS.includes(providerKind as ProviderKind)
  ) {
    throw new CatalogueParseError(
      `Catalogue entry "${id}" has an invalid "providerKind": ${JSON.stringify(providerKind)}.`,
    );
  }

  const dataPolicy = entry.dataPolicy;
  if (typeof dataPolicy !== 'string' || !VALID_DATA_POLICIES.includes(dataPolicy as DataPolicy)) {
    throw new CatalogueParseError(
      `Catalogue entry "${id}" has an invalid "dataPolicy": ${JSON.stringify(dataPolicy)}.`,
    );
  }

  const policySource = entry.policySource;
  if (typeof policySource !== 'string' || policySource.length === 0) {
    throw new CatalogueParseError(`Catalogue entry "${id}" is missing a valid "policySource".`);
  }

  return {
    id,
    providerKind: providerKind as ProviderKind,
    paramsB: nullableNumber(entry.paramsB),
    sizeOnDiskGb: nullableNumber(entry.sizeOnDiskGb),
    quantisation: nullableString(entry.quantisation),
    priceInPerMTok: nullableNumber(entry.priceInPerMTok),
    priceOutPerMTok: nullableNumber(entry.priceOutPerMTok),
    dataPolicy: dataPolicy as DataPolicy,
    policySource,
    policyReadAt: typeof entry.policyReadAt === 'string' ? entry.policyReadAt : '',
  };
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Validates an already-parsed catalogue shape (bundled JSON, or a live
 * response in a later deliverable). Throws `CatalogueParseError` naming the
 * offending entry/field rather than a generic error. The `_comment` field is
 * curator documentation, not data, and is ignored here — it isn't part of
 * the `entries` array, so it never reaches `validateEntry`.
 *
 * Exported (not just used internally by `loadCatalogue`) so tests can assert
 * rejection of a malformed entry against an in-memory fixture, without
 * corrupting the real bundled file.
 */
export function parseCatalogue(data: unknown): Catalogue {
  if (typeof data !== 'object' || data === null) {
    throw new CatalogueParseError('Catalogue must be an object with "generatedAt" and "entries".');
  }
  const candidate = data as { generatedAt?: unknown; entries?: unknown };

  if (typeof candidate.generatedAt !== 'string' || candidate.generatedAt.length === 0) {
    throw new CatalogueParseError('Catalogue is missing a valid top-level "generatedAt".');
  }
  if (!Array.isArray(candidate.entries)) {
    throw new CatalogueParseError('Catalogue is missing an "entries" array.');
  }

  const entries = candidate.entries.map((entry, index) => validateEntry(entry, index));

  return { generatedAt: candidate.generatedAt, entries };
}

/**
 * Parses and validates the bundled catalogue file. Throws `CatalogueParseError`
 * naming the offending entry/field rather than a generic error.
 */
export function loadCatalogue(): Catalogue {
  return parseCatalogue(rawCatalogue);
}

/** The bundled catalogue plus whether live enrichment succeeded this call. */
export type LiveCatalogue = Catalogue & { stale: boolean };

export interface LoadCatalogueWithLiveDataDeps {
  fetchImpl?: FetchLike;
  now?: () => Date;
  /** How long a successful live merge is reused before fetching again. */
  cacheTtlMs?: number;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/** Module-scoped cache of the last successful live merge — simplest thing
 * that avoids re-fetching OpenRouter on every call within the TTL. Cleared
 * only by process restart; a later deliverable can invalidate it explicitly
 * if that turns out to matter. */
let liveCache: { fetchedAt: number; result: Catalogue } | null = null;

/**
 * Loads the bundled catalogue and, best-effort, merges live OpenRouter
 * prices and per-endpoint data policy over it. Merging is field-by-field: a
 * live entry only overwrites the fields it actually carries, so a partial
 * response never blanks out bundled facts it didn't report.
 *
 * On any failure (network error, non-OK response, malformed body) this
 * catches it and returns the bundled catalogue unchanged with `stale: true`
 * — never throws, per the "no error screen" guardrail.
 */
export async function loadCatalogueWithLiveData(
  deps: LoadCatalogueWithLiveDataDeps = {},
): Promise<LiveCatalogue> {
  const bundled = loadCatalogue();
  const fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  const now = deps.now ?? (() => new Date());
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

  const nowMs = now().getTime();
  if (liveCache && nowMs - liveCache.fetchedAt < cacheTtlMs) {
    return { ...liveCache.result, stale: false };
  }

  try {
    const prices = await fetchOpenRouterPrices(fetchImpl);
    const entries = await Promise.all(
      bundled.entries.map((entry) => mergeEntryWithLiveData(entry, prices, fetchImpl, now)),
    );
    const merged: Catalogue = { generatedAt: bundled.generatedAt, entries };
    liveCache = { fetchedAt: nowMs, result: merged };
    return { ...merged, stale: false };
  } catch {
    return { ...bundled, stale: true };
  }
}

/**
 * Applies live price fields (if reported) and attempts a per-entry policy
 * lookup. A policy-lookup failure for one entry is swallowed here — it must
 * not take down the whole merge — leaving that entry's bundled policy as-is.
 */
async function mergeEntryWithLiveData(
  entry: CatalogueEntry,
  prices: Map<string, { priceInPerMTok?: number; priceOutPerMTok?: number }>,
  fetchImpl: FetchLike,
  now: () => Date,
): Promise<CatalogueEntry> {
  const merged: CatalogueEntry = { ...entry };

  const price = prices.get(entry.id);
  if (price?.priceInPerMTok !== undefined) merged.priceInPerMTok = price.priceInPerMTok;
  if (price?.priceOutPerMTok !== undefined) merged.priceOutPerMTok = price.priceOutPerMTok;

  const authorSlug = splitAuthorSlug(entry.id);
  if (authorSlug) {
    try {
      const policy = await fetchOpenRouterEndpointPolicy(
        fetchImpl,
        authorSlug.author,
        authorSlug.slug,
      );
      // The sensitive-task rule (src/core/llm/sensitive.ts) shows "which policy it
      // read and when" verbatim from these two fields — a live-upgraded dataPolicy
      // without a matching source/date would display a stale claim as current.
      if (policy) {
        merged.dataPolicy = policy;
        merged.policySource = `https://openrouter.ai/api/v1/models/${authorSlug.author}/${authorSlug.slug}/endpoints`;
        merged.policyReadAt = now().toISOString();
      }
    } catch {
      // Leave the bundled policy untouched — one entry's endpoint lookup
      // failing is not grounds to discard the whole live merge.
    }
  }

  return merged;
}

/** OpenRouter model ids are "author/slug"; catalogue ids mostly follow the
 * same shape, so the first segment is reused as the author. */
function splitAuthorSlug(id: string): { author: string; slug: string } | null {
  const separatorIndex = id.indexOf('/');
  if (separatorIndex <= 0 || separatorIndex === id.length - 1) return null;
  return { author: id.slice(0, separatorIndex), slug: id.slice(separatorIndex + 1) };
}
