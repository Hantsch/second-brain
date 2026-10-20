/* Reachability filter (019b D4): for every catalogue entry, decides whether
   this machine/configuration can actually use the model right now, after a
   local download, or not at all. Pure — no Electron, no I/O, no network.
   Everything it needs (catalogue, configured providers, installed local
   model ids, the 019a capacity verdict) is passed in by the caller.

   This module never writes UI copy (guardrail 7): `reason` is a closed set
   of reason codes, not a sentence. The renderer turns a code into a
   translated sentence via `t()`. */

import type { CatalogueEntry } from './catalogue';
import type { CapacityVerdict } from './capacity';
import type { ProviderConfig } from '@shared/types';

export type ReachabilityStatus = 'reachable' | 'needs-download' | 'not-here';

/**
 * Closed set of reason codes, one per outcome this filter can produce:
 * - `'installed'` — a local model already present (its id is in
 *   `installedLocalModelIds`).
 * - `'provider-configured'` — a cloud model whose provider is configured,
 *   enabled, and (if the entry isn't the local/no-key case) has a key.
 * - `'downloadable'` — a local-capable model not yet installed, but the
 *   machine's capacity verdict says it can carry it.
 * - `'no-provider-configured'` — a cloud model with no matching enabled
 *   `ProviderConfig` at all.
 * - `'exceeds-machine-capacity'` — a local-capable model whose `paramsB`
 *   exceeds `maxPossibleParamsB`.
 * - `'no-key'` — a matching provider exists and is enabled, but has no key
 *   configured.
 * - `'provider-disabled'` — a matching provider exists but is disabled.
 */
export type ReachabilityReason =
  | 'installed'
  | 'provider-configured'
  | 'downloadable'
  | 'no-provider-configured'
  | 'exceeds-machine-capacity'
  | 'no-key'
  | 'provider-disabled';

export interface ReachabilityResult {
  modelId: string;
  status: ReachabilityStatus;
  /** Only set when status is 'needs-download': how many GB would have to be fetched. */
  needsDownloadGb?: number;
  reason: ReachabilityReason;
}

/** A local-capable entry is one that carries a disk footprint — cloud
 * entries never do (see `CatalogueEntry.sizeOnDiskGb`). */
function isLocalCapable(entry: CatalogueEntry): boolean {
  return entry.sizeOnDiskGb !== null;
}

/**
 * Catalogue ids carry a vendor prefix (`ollama/qwen2.5-coder:7b`); a local
 * runtime's own model listing (`ProviderConfig.models`, from
 * `OpenAiCompatibleProvider.listModels()`) reports the bare id
 * (`qwen2.5-coder:7b`) it was pulled under, with no vendor prefix at all.
 * Matching by exact string would never succeed for a real installation, so
 * an installed id also matches the catalogue id's suffix after its first
 * `/`. Exported so `recommend.ts` can find which *specific* configured
 * local provider actually has an entry installed, rather than only whether
 * it's installed somewhere — two local runtimes (e.g. Ollama and LM Studio)
 * can be configured at once, and only one of them may actually carry a
 * given model. */
export function isInstalled(
  entry: CatalogueEntry,
  installedLocalModelIds: readonly string[],
): boolean {
  const bareId = entry.id.slice(entry.id.indexOf('/') + 1);
  return installedLocalModelIds.some((id) => id === entry.id || id === bareId);
}

/** Null-safe "does the machine's ceiling allow this many params": an unknown
 * on either side is never treated as a hard block — only a known, exceeded
 * ceiling disqualifies a model. */
function fitsCapacity(paramsB: number | null, maxPossibleParamsB: number | null): boolean {
  return paramsB === null || maxPossibleParamsB === null || paramsB <= maxPossibleParamsB;
}

/**
 * Providers configured for this (cloud) entry's `providerKind`. Local and
 * cloud providers can share a `providerKind` — Ollama and OpenRouter are
 * both `openai-compatible` — so this only considers non-local providers:
 * a local runtime satisfies the local-capable branch above via
 * `installedLocalModelIds`, never this one. Without that exclusion, a
 * configured local Ollama provider would satisfy an unrelated *cloud*
 * catalogue entry (sharing the same `providerKind`) without ever checking
 * that entry's `dataPolicy` or requiring a key — exactly the false-negative
 * the sensitive-task rule (`sensitive.ts`) exists to prevent, since
 * `isAllowedForSensitiveTask` trusts `provider.local` as proof nothing
 * leaves the machine. Most-usable-first isn't needed beyond that — any
 * enabled+keyed non-local match is enough to call it reachable, so the
 * first one found is used. */
function matchingProviders(
  entry: CatalogueEntry,
  configuredProviders: ProviderConfig[],
): ProviderConfig[] {
  return configuredProviders.filter(
    (provider) => provider.kind === entry.providerKind && !provider.local,
  );
}

/**
 * Judges one catalogue entry against the machine/configuration facts. Never
 * throws — every entry gets exactly one result.
 */
function assessEntry(
  entry: CatalogueEntry,
  configuredProviders: ProviderConfig[],
  installedLocalModelIds: string[],
  verdict: CapacityVerdict,
): ReachabilityResult {
  if (isLocalCapable(entry)) {
    if (isInstalled(entry, installedLocalModelIds)) {
      return { modelId: entry.id, status: 'reachable', reason: 'installed' };
    }
    if (!fitsCapacity(entry.paramsB, verdict.maxPossibleParamsB)) {
      return { modelId: entry.id, status: 'not-here', reason: 'exceeds-machine-capacity' };
    }
    return {
      modelId: entry.id,
      status: 'needs-download',
      needsDownloadGb: entry.sizeOnDiskGb ?? undefined,
      reason: 'downloadable',
    };
  }

  // Cloud model: reachability depends entirely on a configured provider.
  const matches = matchingProviders(entry, configuredProviders);
  if (matches.length === 0) {
    return { modelId: entry.id, status: 'not-here', reason: 'no-provider-configured' };
  }

  const enabled = matches.find((provider) => provider.enabled);
  if (!enabled) {
    return { modelId: entry.id, status: 'not-here', reason: 'provider-disabled' };
  }

  // `matchingProviders` already excludes local runtimes for this (cloud)
  // branch, so `enabled` is always a remote provider here: no key configured
  // means it can't actually be called.
  if (!enabled.hasKey) {
    return { modelId: entry.id, status: 'not-here', reason: 'no-key' };
  }

  return { modelId: entry.id, status: 'reachable', reason: 'provider-configured' };
}

/**
 * Takes the catalogue, the configured providers, the local models already
 * installed, and the 019a capacity verdict, and returns one
 * `ReachabilityResult` per catalogue entry.
 */
export function assessReachability(
  catalogue: CatalogueEntry[],
  configuredProviders: ProviderConfig[],
  installedLocalModelIds: string[],
  verdict: CapacityVerdict,
): ReachabilityResult[] {
  return catalogue.map((entry) =>
    assessEntry(entry, configuredProviders, installedLocalModelIds, verdict),
  );
}

/**
 * Filters out every `'not-here'` result, so later stages (e.g. the
 * recommendation engine) can never surface a model that isn't reachable now
 * or after a download.
 */
export function reachableOnly(results: ReachabilityResult[]): ReachabilityResult[] {
  return results.filter((result) => result.status !== 'not-here');
}
