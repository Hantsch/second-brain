import { describe, expect, it } from 'vitest';
import { assessReachability, reachableOnly, type CatalogueEntry } from '@core/llm';
import type { CapacityVerdict, ProviderConfig } from '@shared/types';

/* Fixtures for the four reachability outcomes named in the 019b D4 plan
   ("reachable now" splits into a local and a cloud case, hence five
   scenario entries across four outcome categories). */

function entry(overrides: Partial<CatalogueEntry>): CatalogueEntry {
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

function provider(overrides: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: 'provider-1',
    label: 'Test provider',
    kind: 'anthropic',
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
    maxComfortableParamsB: 10,
    maxPossibleParamsB: 20,
    tiersThatFit: ['3B', '7B', '8B'],
    heuristic: true,
    unknowns: [],
    ...overrides,
  };
}

describe('assessReachability', () => {
  it('a local model already installed is reachable now', () => {
    const local = entry({ id: 'local/qwen-7b', sizeOnDiskGb: 4.5, paramsB: 7 });
    const [result] = assessReachability([local], [], ['local/qwen-7b'], verdict());

    expect(result).toEqual({ modelId: 'local/qwen-7b', status: 'reachable', reason: 'installed' });
  });

  it('a cloud model with a matching enabled, keyed provider is reachable now', () => {
    const cloud = entry({ id: 'anthropic/claude', providerKind: 'anthropic' });
    const configured = [provider({ kind: 'anthropic', enabled: true, hasKey: true })];
    const [result] = assessReachability([cloud], configured, [], verdict());

    expect(result).toEqual({
      modelId: 'anthropic/claude',
      status: 'reachable',
      reason: 'provider-configured',
    });
  });

  it('a local-capable model not installed but within capacity needs a download', () => {
    const local = entry({ id: 'local/qwen-13b', sizeOnDiskGb: 8.2, paramsB: 13 });
    const [result] = assessReachability([local], [], [], verdict());

    expect(result).toEqual({
      modelId: 'local/qwen-13b',
      status: 'needs-download',
      needsDownloadGb: 8.2,
      reason: 'downloadable',
    });
  });

  it('a local-capable model exceeding the machine capacity is not reachable', () => {
    const tooBig = entry({ id: 'local/llama-70b', sizeOnDiskGb: 40, paramsB: 70 });
    const [result] = assessReachability([tooBig], [], [], verdict());

    expect(result).toEqual({
      modelId: 'local/llama-70b',
      status: 'not-here',
      reason: 'exceeds-machine-capacity',
    });
  });

  it('a cloud model with no matching provider configured at all is not reachable', () => {
    const cloud = entry({ id: 'openai/gpt', providerKind: 'openai-compatible' });
    const configured = [provider({ kind: 'anthropic' })];
    const [result] = assessReachability([cloud], configured, [], verdict());

    expect(result).toEqual({
      modelId: 'openai/gpt',
      status: 'not-here',
      reason: 'no-provider-configured',
    });
  });

  it('a cloud model whose only matching provider is disabled is not reachable', () => {
    const cloud = entry({ id: 'anthropic/claude', providerKind: 'anthropic' });
    const configured = [provider({ kind: 'anthropic', enabled: false })];
    const [result] = assessReachability([cloud], configured, [], verdict());

    expect(result?.status).toBe('not-here');
    expect(result?.reason).toBe('provider-disabled');
  });

  it('a cloud model whose matching provider is enabled but has no key is not reachable', () => {
    const cloud = entry({ id: 'openai/gpt', providerKind: 'openai-compatible' });
    const configured = [
      provider({ kind: 'openai-compatible', enabled: true, hasKey: false, local: false }),
    ];
    const [result] = assessReachability([cloud], configured, [], verdict());

    expect(result?.status).toBe('not-here');
    expect(result?.reason).toBe('no-key');
  });

  it('a configured local runtime does not satisfy an unrelated cloud entry sharing its providerKind', () => {
    // Ollama and OpenRouter are both `openai-compatible`; a cloud catalogue
    // entry (no `sizeOnDiskGb`) must not be marked reachable just because a
    // local runtime of the same providerKind is configured — that would
    // let `sensitive.ts`'s `local` check pass without ever consulting the
    // cloud entry's actual `dataPolicy` (the false negative the story's
    // Model Hints warn about for D5).
    const cloud = entry({ id: 'openrouter/some-model', providerKind: 'openai-compatible' });
    const configured = [
      provider({ kind: 'openai-compatible', enabled: true, hasKey: false, local: true }),
    ];
    const [result] = assessReachability([cloud], configured, [], verdict());

    expect(result?.status).toBe('not-here');
    expect(result?.reason).toBe('no-provider-configured');
  });

  it("a local-capable entry is installed-reachable via the runtime's bare model id, not the catalogue's vendor-prefixed id", () => {
    // Catalogue ids carry a vendor prefix (`ollama/qwen2.5-coder:7b`); the
    // provider's own `listModels()` reports the bare id it was pulled under
    // (`qwen2.5-coder:7b`), with no prefix at all.
    const local = entry({ id: 'ollama/qwen2.5-coder:7b', sizeOnDiskGb: 4.7, paramsB: 7 });
    const [result] = assessReachability([local], [], ['qwen2.5-coder:7b'], verdict());

    expect(result).toEqual({
      modelId: 'ollama/qwen2.5-coder:7b',
      status: 'reachable',
      reason: 'installed',
    });
  });

  it('never throws and returns exactly one result per catalogue entry', () => {
    const entries = [
      entry({ id: 'a', sizeOnDiskGb: 4, paramsB: 7 }),
      entry({ id: 'b', providerKind: 'anthropic' }),
    ];
    const results = assessReachability(entries, [], [], verdict({ maxPossibleParamsB: null }));

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.modelId)).toEqual(['a', 'b']);
  });
});

describe('reachableOnly', () => {
  it('never returns a not-here entry from a mixed fixture set', () => {
    const local = entry({ id: 'local/qwen-7b', sizeOnDiskGb: 4.5, paramsB: 7 });
    const tooBig = entry({ id: 'local/llama-70b', sizeOnDiskGb: 40, paramsB: 70 });
    const cloudOk = entry({ id: 'anthropic/claude', providerKind: 'anthropic' });
    const cloudMissing = entry({ id: 'openai/gpt', providerKind: 'openai-compatible' });
    const configured = [provider({ kind: 'anthropic', enabled: true, hasKey: true })];

    const results = assessReachability(
      [local, tooBig, cloudOk, cloudMissing],
      configured,
      ['local/qwen-7b'],
      verdict(),
    );
    const filtered = reachableOnly(results);

    expect(filtered.some((r) => r.status === 'not-here')).toBe(false);
    expect(filtered.map((r) => r.modelId).sort()).toEqual(['anthropic/claude', 'local/qwen-7b']);
  });
});
