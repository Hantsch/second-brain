/* Hugging Face model search + file listing (033, D3) — anonymous access only
   (Decisions: "Hugging Face access"), no token, no secret storage. Mirrors
   `../http.ts`'s pattern: the same injected `FetchLike` so tests never touch
   the network, and every failure comes back as a typed, host-sanitised
   outcome rather than a thrown error carrying a full URL or query — a gated
   repo or an offline network is an honest state the caller shows, not a bug
   (guardrail 3, guardrail 6). Pure: never called from core itself, only from
   main's HF search handler (D8). */

import type { FetchLike } from '../types';
import { parseQuantisation } from './quant';
import type {
  HfApiModelEntry,
  HfApiTreeEntry,
  HfFileListOutcome,
  HfLookupReason,
  HfModelFile,
  HfModelSearchOutcome,
  HfModelSearchResult,
} from './types';

const HF_BASE_URL = 'https://huggingface.co';

/**
 * `GET /api/models?search=…&filter=gguf` — models whose name/description
 * matches `query`, restricted to repositories tagged `gguf`. An empty result
 * set is a normal success with `results: []`, never an error.
 */
export async function searchHfModels(
  fetchImpl: FetchLike,
  query: string,
): Promise<HfModelSearchOutcome> {
  const url = `${HF_BASE_URL}/api/models?search=${encodeURIComponent(query)}&filter=gguf`;
  const outcome = await fetchJsonArray(fetchImpl, url);
  if (!outcome.ok) return outcome;
  return { ok: true, results: outcome.data.map(toSearchResult).filter((r) => r.id.length > 0) };
}

/**
 * `GET /api/models/{id}/tree/main` — the repository's flat file list, filtered
 * down to `.gguf` files only (a repo mixing GGUF with READMEs, safetensors,
 * etc. must not surface those as downloadable model files). Each surviving
 * file carries its parsed quantisation and its resolve-download URL.
 */
export async function listHfModelFiles(
  fetchImpl: FetchLike,
  modelId: string,
): Promise<HfFileListOutcome> {
  const url = `${HF_BASE_URL}/api/models/${encodeModelId(modelId)}/tree/main`;
  const outcome = await fetchJsonArray(fetchImpl, url);
  if (!outcome.ok) return outcome;
  const files = outcome.data.filter(isGgufTreeEntry).map((entry) => toModelFile(modelId, entry));
  return { ok: true, files };
}

/** Each path segment of a model id (`author/name`) is encoded separately —
    encoding the whole id at once would turn its structural `/` into `%2F`
    and break the URL. */
function encodeModelId(modelId: string): string {
  return modelId.split('/').map(encodeURIComponent).join('/');
}

type FetchArrayOutcome = { ok: true; data: unknown[] } | { ok: false; reason: HfLookupReason };

/**
 * Runs the request and classifies the result: a thrown/rejected fetch is
 * `'network-error'`, 401/403 is `'gated'` (anonymous access only, so any
 * auth failure means the same thing), any other non-2xx or non-array body is
 * `'error'`. Never throws.
 */
async function fetchJsonArray(fetchImpl: FetchLike, url: string): Promise<FetchArrayOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: 'GET' });
  } catch {
    return { ok: false, reason: 'network-error' };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'gated' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'error' };
  }

  try {
    const data: unknown = await response.json();
    return Array.isArray(data) ? { ok: true, data } : { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

function toSearchResult(entry: unknown): HfModelSearchResult {
  const e = (entry ?? {}) as HfApiModelEntry;
  return {
    id: typeof e.id === 'string' ? e.id : '',
    downloads: typeof e.downloads === 'number' ? e.downloads : null,
    likes: typeof e.likes === 'number' ? e.likes : null,
    tags: Array.isArray(e.tags)
      ? e.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
  };
}

function isGgufTreeEntry(entry: unknown): entry is HfApiTreeEntry & { path: string } {
  const e = (entry ?? {}) as HfApiTreeEntry;
  return e.type === 'file' && typeof e.path === 'string' && e.path.toLowerCase().endsWith('.gguf');
}

function toModelFile(modelId: string, entry: HfApiTreeEntry & { path: string }): HfModelFile {
  return {
    path: entry.path,
    sizeBytes: typeof entry.size === 'number' ? entry.size : null,
    quantisation: parseQuantisation(entry.path) ?? null,
    // Same per-segment encoding as the model id: a file can sit in a
    // subdirectory, and only `/` between segments is meant literally.
    downloadUrl: `${HF_BASE_URL}/${encodeModelId(modelId)}/resolve/main/${encodeModelId(entry.path)}`,
  };
}
