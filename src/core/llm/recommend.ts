/* The recommendation engine (019b D6): for every task in `TASK_DEFINITIONS`,
   picks the best reachable, rule-compliant target and reports what a run of
   it would cost. Pure — no Electron, no I/O, no network. The catalogue (with
   its `stale`/`generatedAt` marker) and the machine/provider facts are all
   passed in by the caller; this module only ranks and explains.

   Structured data only (guardrail 7): `reasonKey`/`tradeoffKey` are a closed
   set of i18n keys, never a sentence. The renderer turns a key into a
   translated sentence via `t()`. */

import type { CapacityVerdict } from './capacity';
import type { Catalogue, CatalogueEntry } from './catalogue';
import { assessReachability, isInstalled, reachableOnly } from './reachability';
import {
  filterForSensitiveTask,
  type SensitiveCandidate,
  type SensitivePolicyInfo,
} from './sensitive';
import { TASK_KINDS, taskDefinition } from './tasks';
import { classifyModelTier } from './tiers';
import type {
  ModelRef,
  ModelTier,
  ProviderConfig,
  RecommendationReasonKey,
  RecommendationSet,
  RecommendationTradeoffKey,
  TaskKind,
  TaskRecommendation,
} from '@shared/types';

/* `RecommendationReasonKey`, `RecommendationTradeoffKey`, `TaskRecommendation`,
   and `RecommendationSet` live in `@shared/types` (not here), so the
   renderer's separate TypeScript project (`tsconfig.web.json`) can type the
   `llm:recommendModels` channel's result without pulling in the rest of
   `core/llm` — only main may import and call `recommendModels` itself.
   Re-exported here so existing callers of `./recommend` and the `core/llm`
   barrel keep working. */
export type {
  RecommendationReasonKey,
  RecommendationSet,
  RecommendationTradeoffKey,
  TaskRecommendation,
};

/** Cap on `alternatives`: enough for a "use the cheaper/local one instead"
 *  swap list without dumping the whole catalogue into the UI. */
const MAX_ALTERNATIVES = 3;

/** A local-capable entry is one that carries a disk footprint — cloud entries
 *  never do. Mirrors `reachability.ts`'s private helper of the same name;
 *  kept local here rather than exported from there to avoid coupling two
 *  modules over an implementation detail. */
function isLocalCapable(entry: CatalogueEntry): boolean {
  return entry.sizeOnDiskGb !== null;
}

/**
 * The concrete provider config a candidate would run through, for building
 * its `ModelRef` and for the sensitive-task rule's `local` check. Local and
 * cloud providers can share a `providerKind` (Ollama and OpenRouter are both
 * "openai-compatible"), so a candidate only ever considers providers whose
 * `local` flag matches its own nature — exactly, no fallback to "any enabled
 * match of the right kind". A fallback would let a configured local Ollama
 * provider stand in for an unrelated *cloud* entry, which then reports
 * `local: true` to the sensitive-task rule without that entry's `dataPolicy`
 * ever being consulted — the false negative the story's Model Hints warn
 * about for D5. `reachability.ts`'s `matchingProviders` enforces the same
 * exclusion for the same reason; keep both in sync.
 *
 * For a local-capable entry with *two* local runtimes configured (e.g.
 * Ollama and LM Studio, both `local: true` and both `openai-compatible`),
 * "any enabled local match" would attribute an installed model to whichever
 * runtime happens to be enabled first, even if that runtime never pulled it
 * — the write would then point at a provider that doesn't actually have the
 * model. So among local candidates, the one whose own `models` list
 * (`isInstalled`, the same bare-id match `reachability.ts` uses for
 * installed status) actually carries this entry wins first; only when none
 * do (the not-yet-installed/needs-download case, where no provider has it
 * yet) does the first enabled local candidate serve as the download target.
 */
function resolveProvider(
  entry: CatalogueEntry,
  configuredProviders: readonly ProviderConfig[],
): ProviderConfig | undefined {
  const wantsLocal = isLocalCapable(entry);
  const candidates = configuredProviders.filter(
    (provider) =>
      provider.kind === entry.providerKind && provider.enabled && provider.local === wantsLocal,
  );
  if (wantsLocal) {
    const holder = candidates.find((provider) => isInstalled(entry, provider.models));
    if (holder) return holder;
  }
  return candidates[0];
}

/** `(in/1e6)*priceIn + (out/1e6)*priceOut` when both catalogue prices are
 *  known; `null` for a local model or a partially-priced cloud one — never a
 *  guessed number. */
function costPerRun(
  entry: CatalogueEntry,
  typicalTokens: { in: number; out: number },
): number | null {
  if (entry.priceInPerMTok === null || entry.priceOutPerMTok === null) return null;
  return (
    (typicalTokens.in / 1e6) * entry.priceInPerMTok +
    (typicalTokens.out / 1e6) * entry.priceOutPerMTok
  );
}

/** One surviving candidate, with everything the ranking and the result shape
 *  need already resolved. */
interface Candidate {
  entry: CatalogueEntry;
  providerId: string;
  local: boolean;
  tier: ModelTier;
  cost: number | null;
  policy: SensitivePolicyInfo;
  /** From reachability's `'needs-download'` status — `null` unless this
   *  candidate is a local model not yet installed but within capacity. */
  needsDownloadGb: number | null;
}

function buildCandidate(
  entry: CatalogueEntry,
  provider: ProviderConfig | undefined,
  policy: SensitivePolicyInfo,
  typicalTokens: { in: number; out: number },
  needsDownloadGb: number | null,
): Candidate {
  return {
    entry,
    // No provider is configured yet for a merely-downloadable local model —
    // fall back to the provider kind itself as a stable placeholder id
    // (documented deviation: ModelRef normally names a configured provider).
    providerId: provider?.id ?? entry.providerKind,
    local: isLocalCapable(entry),
    tier: classifyModelTier(entry.id),
    cost: costPerRun(entry, typicalTokens),
    policy,
    needsDownloadGb,
  };
}

function toModelRef(candidate: Candidate): ModelRef {
  return { providerId: candidate.providerId, model: candidate.entry.id };
}

/**
 * Ranks survivors: exact tier match to `suggested` first, then cheapest cost
 * (a `null`/local cost ranks as free, for ranking only — never for display),
 * ties broken by the entry's position in the catalogue.
 */
function rankCandidates(
  candidates: readonly Candidate[],
  suggested: ModelTier,
  catalogueOrder: ReadonlyMap<string, number>,
): Candidate[] {
  return [...candidates].sort((a, b) => {
    const aFits = a.tier === suggested ? 0 : 1;
    const bFits = b.tier === suggested ? 0 : 1;
    if (aFits !== bFits) return aFits - bFits;

    const aCost = a.cost ?? 0;
    const bCost = b.cost ?? 0;
    if (aCost !== bCost) return aCost - bCost;

    return (catalogueOrder.get(a.entry.id) ?? 0) - (catalogueOrder.get(b.entry.id) ?? 0);
  });
}

function reasonKeyFor(
  top: Candidate,
  ranked: readonly Candidate[],
  suggested: ModelTier,
): RecommendationReasonKey {
  if (top.tier === suggested) return 'best-fit-for-task';
  if (ranked.every((candidate) => candidate.local)) return 'only-local-option';
  return 'cheapest-reachable';
}

/** Every candidate for one task that survived reachability and (for a
 *  sensitive task) the sensitive-task rule, with their policy provenance. */
function survivingCandidates(
  kind: TaskKind,
  reachableEntries: readonly CatalogueEntry[],
  configuredProviders: readonly ProviderConfig[],
  typicalTokens: { in: number; out: number },
  downloadGbById: ReadonlyMap<string, number>,
): Candidate[] {
  if (!taskDefinition(kind).sensitive) {
    return reachableEntries.map((entry) =>
      buildCandidate(
        entry,
        resolveProvider(entry, configuredProviders),
        entry,
        typicalTokens,
        downloadGbById.get(entry.id) ?? null,
      ),
    );
  }

  const sensitiveCandidates: SensitiveCandidate[] = reachableEntries.map((entry) => ({
    entry,
    provider: resolveProvider(entry, configuredProviders),
  }));
  return filterForSensitiveTask(sensitiveCandidates).map((allowed) =>
    buildCandidate(
      allowed.entry,
      resolveProvider(allowed.entry, configuredProviders),
      allowed.policy,
      typicalTokens,
      downloadGbById.get(allowed.entry.id) ?? null,
    ),
  );
}

function recommendForTask(
  kind: TaskKind,
  reachableEntries: readonly CatalogueEntry[],
  configuredProviders: readonly ProviderConfig[],
  catalogueOrder: ReadonlyMap<string, number>,
  downloadGbById: ReadonlyMap<string, number>,
): TaskRecommendation {
  const definition = taskDefinition(kind);
  const survivors = survivingCandidates(
    kind,
    reachableEntries,
    configuredProviders,
    definition.typicalTokens,
    downloadGbById,
  );

  if (survivors.length === 0) {
    return {
      task: kind,
      pick: null,
      reasonKey: definition.sensitive
        ? 'sensitive-rule-no-qualifying-target'
        : 'no-reachable-model',
      tradeoffKey: null,
      costPerRun: null,
      policySource: null,
      policyReadAt: null,
      needsDownloadGb: null,
      alternatives: [],
    };
  }

  const ranked = rankCandidates(survivors, definition.suggested, catalogueOrder);
  // `survivors.length > 0` was just checked above, so `ranked` (same length)
  // always has a first element — the non-null assertion just avoids a
  // redundant runtime check the type system can't see through here.
  const top = ranked[0]!;
  const rest = ranked.slice(1);
  const alternatives = rest.slice(0, MAX_ALTERNATIVES).map(toModelRef);

  return {
    task: kind,
    pick: toModelRef(top),
    reasonKey: reasonKeyFor(top, ranked, definition.suggested),
    tradeoffKey: alternatives.length > 0 ? 'cheaper-alternative-available' : null,
    costPerRun: top.cost,
    policySource: top.policy.policySource,
    policyReadAt: top.policy.policyReadAt,
    needsDownloadGb: top.needsDownloadGb,
    alternatives,
  };
}

/**
 * Per task, filters the catalogue by reachability on this machine/config,
 * applies the sensitive-task rule where it applies, ranks the survivors, and
 * reports the pick plus its cost and alternatives. Never throws: a task with
 * nothing reachable comes back with `pick: null` and an honest reason.
 */
export function recommendModels(
  catalogue: Catalogue & { stale?: boolean },
  configuredProviders: readonly ProviderConfig[],
  installedLocalModelIds: readonly string[],
  verdict: CapacityVerdict,
): RecommendationSet {
  const reachability = assessReachability(
    catalogue.entries,
    configuredProviders as ProviderConfig[],
    installedLocalModelIds as string[],
    verdict,
  );
  const survivingReachability = reachableOnly(reachability);
  const reachableIds = new Set(survivingReachability.map((result) => result.modelId));
  const reachableEntries = catalogue.entries.filter((entry) => reachableIds.has(entry.id));
  const catalogueOrder = new Map(catalogue.entries.map((entry, index) => [entry.id, index]));
  // Only 'needs-download' results carry a GB figure; everything else (already
  // installed, or a cloud model) has nothing to label as a pending download.
  const downloadGbById = new Map(
    survivingReachability
      .filter(
        (result) => result.status === 'needs-download' && result.needsDownloadGb !== undefined,
      )
      .map((result) => [result.modelId, result.needsDownloadGb as number]),
  );

  const tasks = TASK_KINDS.map((kind) =>
    recommendForTask(kind, reachableEntries, configuredProviders, catalogueOrder, downloadGbById),
  );

  return {
    catalogueGeneratedAt: catalogue.generatedAt,
    catalogueStale: catalogue.stale ?? false,
    tasks,
  };
}
