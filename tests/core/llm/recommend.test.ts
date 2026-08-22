import { describe, expect, it } from 'vitest';
import { recommendModels, TASK_KINDS, type CatalogueEntry } from '@core/llm';
import type { CapacityVerdict, ProviderConfig } from '@shared/types';

/* Fixtures for the four 019b D6 machine scenarios (local-only, cloud-only,
   both, nothing configured), plus a light sensitive-rule regression check. */

function entry(overrides: Partial<CatalogueEntry> = {}): CatalogueEntry {
  return {
    id: 'test/model',
    providerKind: 'openai-compatible',
    paramsB: null,
    sizeOnDiskGb: null,
    quantisation: null,
    priceInPerMTok: null,
    priceOutPerMTok: null,
    dataPolicy: 'unknown',
    policySource: 'test-fixture',
    policyReadAt: '2026-08-01',
    ...overrides,
  };
}

function provider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'provider-1',
    label: 'Test provider',
    kind: 'openai-compatible',
    baseUrl: 'https://example.com',
    hasKey: true,
    local: false,
    enabled: true,
    models: [],
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function verdict(overrides: Partial<CapacityVerdict> = {}): CapacityVerdict {
  return {
    limitingFactor: 'ram',
    maxComfortableParamsB: 20,
    maxPossibleParamsB: 40,
    tiersThatFit: ['3B', '7B', '8B', '13B', '34B'],
    heuristic: true,
    unknowns: [],
    ...overrides,
  };
}

// A small, self-contained catalogue covering every case D6 cares about:
// a local "cheap"-tier model, a "cheap" and a "balanced" and a "strong"
// cloud model with attributed no-training policies (both priced, so cost can
// be hand-computed), a cloud model that trains, and one with an unknown
// policy. Tier comes from `classifyModelTier`, which reads size/name tokens
// off the id — "7b" reads as cheap, "mini" as cheap, "sonnet" as balanced,
// "opus" as strong.
const LOCAL_CHEAP = entry({
  id: 'ollama/qwen2.5-coder:7b',
  providerKind: 'openai-compatible',
  paramsB: 7,
  sizeOnDiskGb: 4.7,
  dataPolicy: 'no-training',
  policySource: 'local model — never leaves the machine',
  policyReadAt: '2026-08-01',
});
const CLOUD_CHEAP = entry({
  id: 'openai/gpt-4o-mini',
  providerKind: 'openai-compatible',
  priceInPerMTok: 0.15,
  priceOutPerMTok: 0.6,
  dataPolicy: 'no-training',
  policySource: 'https://openai.com/enterprise-privacy/',
  policyReadAt: '2026-08-01',
});
const CLOUD_BALANCED = entry({
  id: 'anthropic/claude-sonnet',
  providerKind: 'anthropic',
  priceInPerMTok: 3,
  priceOutPerMTok: 15,
  dataPolicy: 'no-training',
  policySource: 'https://www.anthropic.com/legal/commercial-terms',
  policyReadAt: '2026-08-01',
});
const CLOUD_STRONG = entry({
  id: 'anthropic/claude-opus',
  providerKind: 'anthropic',
  priceInPerMTok: 15,
  priceOutPerMTok: 75,
  dataPolicy: 'no-training',
  policySource: 'https://www.anthropic.com/legal/commercial-terms',
  policyReadAt: '2026-08-01',
});
// Priced well above the equivalent no-training models so that, when it ties
// on tier with one of them (both land in the "strong"/"balanced" bucket via
// `classifyModelTier`'s name tokens), it never wins the cost tie-break —
// a null/free price would otherwise rank as 0 and out-rank a priced model
// that is actually the intended pick in the "both"/"cloud-only" fixtures.
const CLOUD_TRAINS = entry({
  id: 'vendor/trainer-large',
  providerKind: 'openai-compatible',
  priceInPerMTok: 50,
  priceOutPerMTok: 200,
  dataPolicy: 'trains',
  policySource: 'https://vendor.example/terms',
  policyReadAt: '2026-08-01',
});
const CLOUD_UNKNOWN_POLICY = entry({
  id: 'openai-compatible/unlisted-third-party',
  providerKind: 'openai-compatible',
  priceInPerMTok: 5,
  priceOutPerMTok: 20,
  dataPolicy: 'unknown',
  policySource: 'no published data-use policy found at curation time',
  policyReadAt: '2026-08-01',
});

const FULL_CATALOGUE = [
  LOCAL_CHEAP,
  CLOUD_CHEAP,
  CLOUD_BALANCED,
  CLOUD_STRONG,
  CLOUD_TRAINS,
  CLOUD_UNKNOWN_POLICY,
];

function catalogue(entries: CatalogueEntry[]) {
  return { generatedAt: '2026-08-01', entries, stale: false };
}

describe('recommendModels', () => {
  it('local-only: every task gets a local pick with no cost', () => {
    const localProvider = provider({
      id: 'ollama',
      kind: 'openai-compatible',
      local: true,
      hasKey: false,
    });
    // The full catalogue, including CLOUD_TRAINS and CLOUD_UNKNOWN_POLICY,
    // is used deliberately: `resolveProvider` only matches a candidate
    // whose `local` flag equals its own nature, so a configured local
    // provider must never make an unrelated cloud entry (sharing the same
    // `providerKind`) reachable. If that guard ever regressed, this test
    // would start picking a cloud model instead of the local one.
    const result = recommendModels(
      catalogue(FULL_CATALOGUE),
      [localProvider],
      ['ollama/qwen2.5-coder:7b'],
      verdict(),
    );

    expect(result.tasks).toHaveLength(11);
    expect(result.tasks.map((t) => t.task)).toEqual(TASK_KINDS);
    for (const task of result.tasks) {
      expect(task.pick).toEqual({ providerId: 'ollama', model: 'ollama/qwen2.5-coder:7b' });
      expect(task.costPerRun).toBeNull();
    }
  });

  it('cloud-only: sensitive tasks only pick a no-training cloud model; cost matches the hand-computed figure', () => {
    const cloudProvider = provider({
      id: 'openrouter',
      kind: 'openai-compatible',
      local: false,
      hasKey: true,
    });
    const anthropicProvider = provider({
      id: 'anthropic-direct',
      kind: 'anthropic',
      local: false,
      hasKey: true,
    });
    // Zero ceiling: the one local-capable entry (paramsB 7) exceeds capacity,
    // so no local model sneaks in as "needs-download" in this scenario.
    const blockLocal = verdict({ maxComfortableParamsB: 0, maxPossibleParamsB: 0 });

    const result = recommendModels(
      catalogue(FULL_CATALOGUE),
      [cloudProvider, anthropicProvider],
      [],
      blockLocal,
    );

    expect(result.tasks).toHaveLength(11);

    const sensitiveTasks = result.tasks.filter((t) =>
      ['classify-dump', 'extract-tasks', 'journal-chat'].includes(t.task),
    );
    for (const task of sensitiveTasks) {
      expect(task.pick).not.toBeNull();
      // The only reachable candidates with an attributed no-training policy
      // are the cheap/balanced cloud models — never the trainer or the
      // unknown-policy one.
      expect(['openai/gpt-4o-mini', 'anthropic/claude-sonnet', 'anthropic/claude-opus']).toContain(
        task.pick?.model,
      );
    }

    const titleTags = result.tasks.find((t) => t.task === 'title-tags');
    // title-tags is cheap/structured, not sensitive: gpt-4o-mini is the exact
    // tier match ("mini" -> cheap) and the cheapest of the reachable set.
    expect(titleTags?.pick).toEqual({ providerId: 'openrouter', model: 'openai/gpt-4o-mini' });
    expect(titleTags?.reasonKey).toBe('best-fit-for-task');
    // Hand-computed: (500/1e6)*0.15 + (60/1e6)*0.6 = 0.000075 + 0.000036
    expect(titleTags?.costPerRun).toBeCloseTo(0.000111, 10);

    const queryAnswer = result.tasks.find((t) => t.task === 'query-answer');
    // balanced/streaming, not sensitive: claude-sonnet is the exact tier match.
    expect(queryAnswer?.pick).toEqual({
      providerId: 'anthropic-direct',
      model: 'anthropic/claude-sonnet',
    });
    // Hand-computed: (3000/1e6)*3 + (500/1e6)*15 = 0.009 + 0.0075
    expect(queryAnswer?.costPerRun).toBeCloseTo(0.0165, 10);
  });

  it('both: local and cloud configured, ranking prefers tier fit then cost', () => {
    const localProvider = provider({
      id: 'ollama',
      kind: 'openai-compatible',
      local: true,
      hasKey: false,
    });
    const cloudProvider = provider({
      id: 'openrouter',
      kind: 'openai-compatible',
      local: false,
      hasKey: true,
    });
    const anthropicProvider = provider({
      id: 'anthropic-direct',
      kind: 'anthropic',
      local: false,
      hasKey: true,
    });

    const result = recommendModels(
      catalogue(FULL_CATALOGUE),
      [localProvider, cloudProvider, anthropicProvider],
      ['ollama/qwen2.5-coder:7b'],
      verdict(),
    );

    expect(result.tasks).toHaveLength(11);

    const titleTags = result.tasks.find((t) => t.task === 'title-tags');
    // Both the local model and gpt-4o-mini are cheap-tier exact matches, but
    // the local one's cost ranks as free (null -> 0 for ranking purposes),
    // which is cheaper than gpt-4o-mini's real cost, so the local pick wins.
    expect(titleTags?.pick).toEqual({ providerId: 'ollama', model: 'ollama/qwen2.5-coder:7b' });
    expect(titleTags?.costPerRun).toBeNull();
    expect(titleTags?.alternatives.length).toBeGreaterThan(0);
    expect(titleTags?.tradeoffKey).toBe('cheaper-alternative-available');

    const gardenerAudit = result.tasks.find((t) => t.task === 'gardener-audit');
    // strong/structured: only claude-opus matches the "strong" tier exactly.
    expect(gardenerAudit?.pick).toEqual({
      providerId: 'anthropic-direct',
      model: 'anthropic/claude-opus',
    });
    expect(gardenerAudit?.reasonKey).toBe('best-fit-for-task');
  });

  it('nothing configured: exactly eleven entries, every one pick: null with an honest reason, never throws', () => {
    // Zero ceiling keeps the local-capable entry from becoming reachable via
    // "needs-download" even with no local provider configured at all.
    const blockLocal = verdict({ maxComfortableParamsB: 0, maxPossibleParamsB: 0 });

    expect(() => recommendModels(catalogue(FULL_CATALOGUE), [], [], blockLocal)).not.toThrow();

    const result = recommendModels(catalogue(FULL_CATALOGUE), [], [], blockLocal);

    expect(result.tasks).toHaveLength(11);
    for (const task of result.tasks) {
      expect(task.pick).toBeNull();
      expect(task.costPerRun).toBeNull();
      expect(task.alternatives).toEqual([]);
      expect(['no-reachable-model', 'sensitive-rule-no-qualifying-target']).toContain(
        task.reasonKey,
      );
    }
    // Surfaces the catalogue's own generatedAt/stale so a later renderer
    // deliverable can show "prices may be stale" honestly.
    expect(result.catalogueGeneratedAt).toBe('2026-08-01');
    expect(result.catalogueStale).toBe(false);
  });

  it('surfaces catalogueStale from a stale catalogue without throwing', () => {
    const blockLocal = verdict({ maxComfortableParamsB: 0, maxPossibleParamsB: 0 });
    const result = recommendModels(
      { generatedAt: '2026-01-01', entries: [], stale: true },
      [],
      [],
      blockLocal,
    );

    expect(result.catalogueGeneratedAt).toBe('2026-01-01');
    expect(result.catalogueStale).toBe(true);
    expect(result.tasks).toHaveLength(11);
  });

  it('sensitive-rule regression: only a trains-on-input cloud model reachable, no local at all', () => {
    const cloudProvider = provider({
      id: 'openrouter',
      kind: 'openai-compatible',
      local: false,
      hasKey: true,
    });
    const blockLocal = verdict({ maxComfortableParamsB: 0, maxPossibleParamsB: 0 });

    const result = recommendModels(catalogue([CLOUD_TRAINS]), [cloudProvider], [], blockLocal);

    const sensitiveResults = result.tasks.filter((t) =>
      ['classify-dump', 'extract-tasks', 'journal-chat'].includes(t.task),
    );
    expect(sensitiveResults).toHaveLength(3);
    for (const task of sensitiveResults) {
      expect(task.pick).toBeNull();
      expect(task.reasonKey).toBe('sensitive-rule-no-qualifying-target');
    }

    // A non-sensitive task still gets the (only) reachable model.
    const titleTags = result.tasks.find((t) => t.task === 'title-tags');
    expect(titleTags?.pick).toEqual({ providerId: 'openrouter', model: 'vendor/trainer-large' });
  });

  it('attributes an installed local model to the specific runtime that actually has it, not the first enabled local provider', () => {
    // Two local runtimes configured (e.g. Ollama and LM Studio, both
    // `local: true` and both `openai-compatible`) — only one of them
    // actually lists this model as installed. `resolveProvider` must not
    // default to "the first enabled local candidate" here, or the write
    // would point at a runtime that doesn't have the model.
    const ollama = provider({
      id: 'ollama',
      kind: 'openai-compatible',
      local: true,
      hasKey: false,
      models: [],
    });
    const lmStudio = provider({
      id: 'lm-studio',
      kind: 'openai-compatible',
      local: true,
      hasKey: false,
      models: ['qwen2.5-coder:7b'],
    });

    const result = recommendModels(
      catalogue([LOCAL_CHEAP]),
      [ollama, lmStudio],
      ['qwen2.5-coder:7b'],
      verdict(),
    );

    const titleTags = result.tasks.find((t) => t.task === 'title-tags');
    expect(titleTags?.pick).toEqual({ providerId: 'lm-studio', model: 'ollama/qwen2.5-coder:7b' });
  });

  it('falls back to the download-target provider when no local runtime has the model installed yet', () => {
    const ollama = provider({
      id: 'ollama',
      kind: 'openai-compatible',
      local: true,
      hasKey: false,
      models: [],
    });

    const result = recommendModels(catalogue([LOCAL_CHEAP]), [ollama], [], verdict());

    const titleTags = result.tasks.find((t) => t.task === 'title-tags');
    expect(titleTags?.pick).toEqual({ providerId: 'ollama', model: 'ollama/qwen2.5-coder:7b' });
    expect(titleTags?.needsDownloadGb).toBe(4.7);
  });
});
