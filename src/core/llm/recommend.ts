/* The recommendation engine (019b D6): for every task in `TASK_DEFINITIONS`,
   picks the best reachable, rule-compliant target and reports what a run of
   it would cost. Pure — no Electron, no I/O, no network. The catalogue (with
   its `stale`/`generatedAt` marker) and the machine/provider facts are all
   passed in by the caller; this module only ranks and explains.

   Structured data only (guardrail 7): `reasonKey`/`tradeoffKey` are a closed
   set of i18n keys, never a sentence. The renderer turns a key into a
   translated sentence via `t()`.

   032 adds a size floor on top of that: a local model below the task's
   minimum parameter count (`requiredParamsB`) is no candidate at all, and a
   task whose floor this machine cannot reach comes back with no pick and a
   `shortfall` instead of the biggest thing that happens to fit. */

import type { CapacityVerdict } from './capacity';
import type { Catalogue, CatalogueEntry } from './catalogue';
import { assessReachability, isInstalled, reachableOnly } from './reachability';
import {
  filterForSensitiveTask,
  isAllowedForSensitiveTask,
  type SensitiveCandidate,
  type SensitivePolicyInfo,
} from './sensitive';
import { TASK_KINDS, taskDefinition } from './tasks';
import { classifyModelTier, MIN_LOCAL_PARAMS_B_BY_TIER } from './tiers';
import type {
  ModelRef,
  ModelTier,
  ProviderConfig,
  RecommendationReasonKey,
  RecommendationSet,
  RecommendationShortfall,
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
  RecommendationShortfall,
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
 * The floor, in billions of parameters, a *local* model must clear to count
 * as capable of this task at all (032, Q3): the documented tier ladder in
 * `MIN_LOCAL_PARAMS_B_BY_TIER`, overridden by the task's own
 * `minLocalParamsB` where one is set (`title-tags`, `query-rerank`).
 */
function requiredParamsB(kind: TaskKind): number {
  const definition = taskDefinition(kind);
  return definition.minLocalParamsB ?? MIN_LOCAL_PARAMS_B_BY_TIER[definition.suggested];
}

/**
 * Whether a candidate carries enough parameters for the task. A cloud entry
 * (`paramsB: null`) always does (032, Q3d): its provider publishes no
 * parameter count, and inventing one to compare against would be a guess
 * (guardrail 3). Only a local entry with a known, too-small size fails here.
 */
function meetsMinimum(candidate: Candidate, minParamsB: number): boolean {
  return candidate.entry.paramsB === null || candidate.entry.paramsB >= minParamsB;
}

/**
 * Whether *this machine* — not the configured providers, not the catalogue —
 * is what puts `minParamsB` out of reach. Only a known ceiling below the
 * requirement counts as proof, mirroring `reachability.ts`'s `fitsCapacity`:
 * an unknown ceiling is never read as a block.
 */
function machineFallsShort(minParamsB: number, maxPossibleParamsB: number | null): boolean {
  return maxPossibleParamsB !== null && maxPossibleParamsB < minParamsB;
}

/**
 * Whether the catalogue holds a cloud model this task could honestly use
 * instead — one with no local size floor to clear (Q3d) and, for a sensitive
 * task, one the sensitive-task rule allows on its read policy alone, so
 * "a cloud model for this one task" is never an invitation to hand the
 * journal to a trainer (AC 6).
 *
 * Asked of the whole catalogue on purpose, not of the reachable set: a
 * reachable, rule-allowed cloud entry always survives into the pick set (it
 * meets every minimum), so there would be no shortfall row left to annotate
 * and a "reachable" reading of this flag could only ever be false. What the
 * row has to say is "a cloud model for this one task, or nothing" — that
 * alternative may still need a provider set up first.
 */
function cloudOptionExists(kind: TaskKind, entries: readonly CatalogueEntry[]): boolean {
  const sensitive = taskDefinition(kind).sensitive;
  return entries.some(
    (entry) => !isLocalCapable(entry) && (!sensitive || isAllowedForSensitiveTask(entry)),
  );
}

/**
 * 0 for a candidate that fits under the machine's comfortable ceiling, 1 for
 * one that only fits under the possible ceiling (032, Q3c). A cloud entry has
 * no local memory footprint and an unknown ceiling is not evidence of
 * anything, so both count as comfortable — this criterion may demote a local
 * model that is genuinely too big for comfort, never anything else.
 */
function comfortRank(candidate: Candidate, maxComfortableParamsB: number | null): number {
  if (candidate.entry.paramsB === null || maxComfortableParamsB === null) return 0;
  return candidate.entry.paramsB <= maxComfortableParamsB ? 0 : 1;
}

/**
 * Sort key for right-sizing: among equals, the smallest local model wins, so
 * a weak machine spends only the memory the task actually needs (Q3c). A
 * cloud entry has no size to right-size and sorts after every local one on
 * this criterion — the only safe direction, since it can move a local model
 * ahead of a cloud one in an exact tier-and-cost tie but never the reverse.
 * (A "neutral" key would make the comparator intransitive and leave a
 * three-way tie's outcome to the sort implementation.)
 */
function sizeRank(candidate: Candidate): number {
  return candidate.entry.paramsB ?? Number.POSITIVE_INFINITY;
}

/**
 * Ranks survivors: exact tier match to `suggested` first, then cheapest cost
 * (a `null`/local cost ranks as free, for ranking only — never for display),
 * then — 032, Q3c, only when `applySizeCriteria` — comfortable before merely
 * possible, then smallest local first, ties broken by the entry's position in
 * the catalogue.
 *
 * The two size criteria come *after* tier fit and cost deliberately: they can
 * only break a tie the 019b ranking left to catalogue order, so no existing
 * pick moves because of them.
 *
 * `applySizeCriteria` is `false` for exactly one caller: the fallback pick set
 * where *every* candidate is below the task's minimum (see `recommendForTask`).
 * Right-sizing means "of the models that can do the job, take the smallest" —
 * among candidates that can none of them do the job it would mean "take the
 * least capable one", inverting the story's headline requirement. There, 019b's
 * catalogue-order tie-break decides exactly as it did before 032.
 */
function rankCandidates(
  candidates: readonly Candidate[],
  suggested: ModelTier,
  catalogueOrder: ReadonlyMap<string, number>,
  maxComfortableParamsB: number | null,
  applySizeCriteria: boolean,
): Candidate[] {
  return [...candidates].sort((a, b) => {
    const aFits = a.tier === suggested ? 0 : 1;
    const bFits = b.tier === suggested ? 0 : 1;
    if (aFits !== bFits) return aFits - bFits;

    const aCost = a.cost ?? 0;
    const bCost = b.cost ?? 0;
    if (aCost !== bCost) return aCost - bCost;

    if (applySizeCriteria) {
      const aComfort = comfortRank(a, maxComfortableParamsB);
      const bComfort = comfortRank(b, maxComfortableParamsB);
      if (aComfort !== bComfort) return aComfort - bComfort;

      // Compared, not subtracted: two cloud entries both key as Infinity, and
      // `Infinity - Infinity` is NaN, which a comparator must never return.
      const aSize = sizeRank(a);
      const bSize = sizeRank(b);
      if (aSize !== bSize) return aSize < bSize ? -1 : 1;
    }

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

/** Everything one task's recommendation is derived from, gathered once per
 *  `recommendModels` call rather than threaded through as seven positional
 *  arguments. */
interface RecommendationContext {
  /** Catalogue entries that survived the reachability filter. */
  reachableEntries: readonly CatalogueEntry[];
  /** The catalogue as a whole — the reachable set says what can be used now,
   *  this says what exists at all (see `cloudOptionExists`). */
  allEntries: readonly CatalogueEntry[];
  configuredProviders: readonly ProviderConfig[];
  catalogueOrder: ReadonlyMap<string, number>;
  downloadGbById: ReadonlyMap<string, number>;
  verdict: CapacityVerdict;
}

function recommendForTask(kind: TaskKind, context: RecommendationContext): TaskRecommendation {
  const definition = taskDefinition(kind);
  const survivors = survivingCandidates(
    kind,
    context.reachableEntries,
    context.configuredProviders,
    definition.typicalTokens,
    context.downloadGbById,
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
      shortfall: null,
    };
  }

  const minParamsB = requiredParamsB(kind);
  const sufficient = survivors.filter((candidate) => meetsMinimum(candidate, minParamsB));

  if (
    sufficient.length === 0 &&
    machineFallsShort(minParamsB, context.verdict.maxPossibleParamsB)
  ) {
    return {
      task: kind,
      pick: null,
      reasonKey: 'beyond-this-machine',
      tradeoffKey: null,
      costPerRun: null,
      policySource: null,
      policyReadAt: null,
      needsDownloadGb: null,
      alternatives: [],
      shortfall: {
        requiredParamsB: minParamsB,
        machineParamsB: context.verdict.maxPossibleParamsB,
        cloudOptionAvailable: cloudOptionExists(kind, context.allEntries),
      },
    };
  }

  /* 032, Q3a: a local candidate below the task's minimum is dropped from the
     pick set *and* from `alternatives` — a model that would produce mush must
     not be the pick, and must not sit one click away in the swap list either.

     The one case where the insufficient survivors stay is the case where
     dropping them would make the row lie. The requirement scopes the no-pick
     rule to "where a task is beyond what THIS MACHINE can carry"; the reason
     key says exactly that, and the shortfall the renderer prints is "needs
     X B, this machine carries Y". On a machine that comfortably carries the
     minimum and whose *reachable set* merely holds nothing that large, that
     sentence would be false, and the row would also flip 019b picks the story
     requires to stay put (`recommend.test.ts`'s local-only fixture: one 7B
     local model is all there is, and it still has to be named for the
     `strong` tasks). There, 019b's own answer stands and is already honest
     about itself — `only-local-option` / `cheapest-reachable` both say the
     pick is not a tier match. */
  const hasSufficient = sufficient.length > 0;
  const pickSet = hasSufficient ? sufficient : survivors;

  const ranked = rankCandidates(
    pickSet,
    definition.suggested,
    context.catalogueOrder,
    context.verdict.maxComfortableParamsB,
    // Right-sizing applies only among candidates that actually clear the floor:
    // in the fallback set none of them do, and "smallest wins" would pick the
    // most insufficient one instead of leaving 019b's order alone.
    hasSufficient,
  );
  // `pickSet` is non-empty in both branches above, so `ranked` (same length)
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
    shortfall: null,
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

  const context: RecommendationContext = {
    reachableEntries,
    allEntries: catalogue.entries,
    configuredProviders,
    catalogueOrder,
    downloadGbById,
    verdict,
  };
  const tasks = TASK_KINDS.map((kind) => recommendForTask(kind, context));

  return {
    catalogueGeneratedAt: catalogue.generatedAt,
    catalogueStale: catalogue.stale ?? false,
    tasks,
  };
}
