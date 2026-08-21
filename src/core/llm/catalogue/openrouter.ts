/* Live enrichment source: OpenRouter's public catalogue endpoints.
   Both functions take an injected `fetchImpl` (mirroring the pattern in
   `../providers/openai-compatible.ts`) so tests never touch the network and
   callers control retries/caching themselves — this file makes no decision
   about staleness or fallback, that's `index.ts`'s job. */

import type { FetchLike } from '../types';
import type { DataPolicy } from './index';

const MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** Only the fields a response actually carries are set — a partial response
 * (e.g. only `prompt` pricing present) must not fabricate the other side. */
export interface OpenRouterPrice {
  priceInPerMTok?: number;
  priceOutPerMTok?: number;
}

/**
 * Fetches `GET /api/v1/models` and extracts per-model USD-per-million-token
 * pricing, keyed by the model id OpenRouter reports.
 *
 * Assumption (documented since the exact real-world shape wasn't verified
 * live): each entry looks like `{ id, pricing: { prompt, completion } }`
 * where `prompt`/`completion` are USD-per-token as strings (OpenRouter's
 * documented convention), converted here to USD-per-million-token.
 */
export async function fetchOpenRouterPrices(
  fetchImpl: FetchLike,
): Promise<Map<string, OpenRouterPrice>> {
  const response = await fetchImpl(MODELS_URL, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`OpenRouter models endpoint returned HTTP ${response.status}.`);
  }
  const data = (await response.json()) as unknown;

  const prices = new Map<string, OpenRouterPrice>();
  for (const entry of extractArray(data, 'data')) {
    const id = readString(entry, 'id');
    if (!id) continue;

    const price: OpenRouterPrice = {};
    const priceIn = readPricePerMillion(entry, 'prompt');
    const priceOut = readPricePerMillion(entry, 'completion');
    if (priceIn !== undefined) price.priceInPerMTok = priceIn;
    if (priceOut !== undefined) price.priceOutPerMTok = priceOut;

    if (price.priceInPerMTok !== undefined || price.priceOutPerMTok !== undefined) {
      prices.set(id, price);
    }
  }
  return prices;
}

/**
 * Fetches `GET /api/v1/models/:author/:slug/endpoints` and extracts the
 * per-endpoint data-collection/training policy.
 *
 * Assumption (documented, since D2's own tests control the fixture shape
 * anyway): the response looks like
 * `{ data: { endpoints: [{ data_policy: { training: boolean } }] } }`,
 * matching OpenRouter's documented per-endpoint `data_policy` object. The
 * first endpoint's policy is used. Any missing/unexpected shape is treated
 * as "unable to determine" (`null`), never a crash.
 */
export async function fetchOpenRouterEndpointPolicy(
  fetchImpl: FetchLike,
  author: string,
  slug: string,
): Promise<DataPolicy | null> {
  const url = `https://openrouter.ai/api/v1/models/${encodeURIComponent(author)}/${encodeURIComponent(slug)}/endpoints`;
  const response = await fetchImpl(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`OpenRouter endpoints endpoint returned HTTP ${response.status}.`);
  }
  const data = (await response.json()) as unknown;
  return extractEndpointPolicy(data);
}

function extractArray(data: unknown, key: string): unknown[] {
  if (typeof data !== 'object' || data === null) return [];
  const value = (data as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

function readString(entry: unknown, key: string): string | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const value = (entry as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPricePerMillion(entry: unknown, field: 'prompt' | 'completion'): number | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined;
  const pricing = (entry as Record<string, unknown>).pricing;
  if (typeof pricing !== 'object' || pricing === null) return undefined;
  const raw = (pricing as Record<string, unknown>)[field];
  const perToken = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  return Number.isFinite(perToken) ? perToken * 1_000_000 : undefined;
}

function extractEndpointPolicy(data: unknown): DataPolicy | null {
  if (typeof data !== 'object' || data === null) return null;
  const inner = (data as Record<string, unknown>).data;
  if (typeof inner !== 'object' || inner === null) return null;
  const endpoints = (inner as Record<string, unknown>).endpoints;
  if (!Array.isArray(endpoints) || endpoints.length === 0) return null;

  const first = endpoints[0];
  if (typeof first !== 'object' || first === null) return null;
  const policy = (first as Record<string, unknown>).data_policy;
  if (typeof policy !== 'object' || policy === null) return null;
  const training = (policy as Record<string, unknown>).training;
  if (typeof training !== 'boolean') return null;
  return training ? 'trains' : 'no-training';
}
