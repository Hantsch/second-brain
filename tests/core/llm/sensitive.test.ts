import { describe, expect, it } from 'vitest';
import {
  assessReachability,
  filterForSensitiveTask,
  isAllowedForSensitiveTask,
  isSensitiveTask,
  judgeForSensitiveTask,
  reachableOnly,
  refusalsForSensitiveTask,
  sensitiveTasks,
  taskDefinition,
  type CatalogueEntry,
  type SensitiveCandidate,
} from '@core/llm';
import type { CapacityVerdict, ProviderConfig, TaskKind } from '@shared/types';

/* Fixtures for the 019b D5 rule: local or an attributed `no-training` policy
   qualifies for a sensitive task, nothing else does. */

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
    policySource: 'https://example.com/privacy',
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
    maxComfortableParamsB: 10,
    maxPossibleParamsB: 20,
    tiersThatFit: ['3B', '7B', '8B'],
    heuristic: true,
    unknowns: [],
    ...overrides,
  };
}

const localProvider = provider({ id: 'ollama', local: true, hasKey: false });
const cloudProvider = provider({ id: 'openrouter', local: false, hasKey: true });

describe('isAllowedForSensitiveTask', () => {
  it('allows a local model even when its data policy is unknown', () => {
    const local = entry({ id: 'ollama/qwen', dataPolicy: 'unknown', sizeOnDiskGb: 4.7 });

    expect(isAllowedForSensitiveTask(local, localProvider)).toBe(true);
  });

  it('allows a local model even when the catalogue claims the model trains', () => {
    const local = entry({ id: 'ollama/qwen', dataPolicy: 'trains', sizeOnDiskGb: 4.7 });

    expect(isAllowedForSensitiveTask(local, localProvider)).toBe(true);
  });

  it('allows a cloud model whose read policy says no training', () => {
    const cloud = entry({ id: 'anthropic/claude', dataPolicy: 'no-training' });

    expect(isAllowedForSensitiveTask(cloud, cloudProvider)).toBe(true);
  });

  it('REFUSES a cloud model whose policy is unknown', () => {
    const cloud = entry({ id: 'vendor/mystery', dataPolicy: 'unknown' });

    expect(isAllowedForSensitiveTask(cloud, cloudProvider)).toBe(false);
    expect(judgeForSensitiveTask(cloud, cloudProvider)).toEqual({
      allowed: false,
      reason: 'policy-unknown',
    });
  });

  it('refuses a cloud model that trains on input', () => {
    const cloud = entry({ id: 'vendor/trainer', dataPolicy: 'trains' });

    expect(isAllowedForSensitiveTask(cloud, cloudProvider)).toBe(false);
    expect(judgeForSensitiveTask(cloud, cloudProvider)).toEqual({
      allowed: false,
      reason: 'trains-on-input',
    });
  });

  it('refuses when no provider is known and the policy does not say no-training', () => {
    const cloud = entry({ dataPolicy: 'unknown' });

    // A missing provider must never read as "probably local".
    expect(isAllowedForSensitiveTask(cloud, undefined)).toBe(false);
    expect(isAllowedForSensitiveTask(cloud, null)).toBe(false);
  });

  it('refuses a provider whose local flag is not exactly true', () => {
    const cloud = entry({ dataPolicy: 'trains' });
    // Settings JSON crosses IPC untyped, so a truthy non-boolean can arrive.
    const sloppy = { local: 'yes' } as unknown as ProviderConfig; // deliberate: simulates untrusted input

    expect(isAllowedForSensitiveTask(cloud, sloppy)).toBe(false);
  });

  it('refuses a no-training claim that carries no read date', () => {
    const cloud = entry({ dataPolicy: 'no-training', policyReadAt: '' });

    expect(judgeForSensitiveTask(cloud, cloudProvider)).toEqual({
      allowed: false,
      reason: 'policy-unattributed',
    });
  });

  it('refuses an unrecognised policy value instead of falling through to an allow', () => {
    // The catalogue may be merged with live provider data at runtime.
    const cloud = entry({ dataPolicy: 'partner-program' as CatalogueEntry['dataPolicy'] });

    expect(isAllowedForSensitiveTask(cloud, cloudProvider)).toBe(false);
  });
});

describe('filterForSensitiveTask', () => {
  it('carries the policy source and read date through unchanged', () => {
    const cloud = entry({
      id: 'anthropic/claude',
      dataPolicy: 'no-training',
      policySource: 'https://www.anthropic.com/legal/commercial-terms',
      policyReadAt: '2026-08-01',
    });

    const [allowed] = filterForSensitiveTask([{ entry: cloud, provider: cloudProvider }]);

    expect(allowed?.policy).toEqual({
      policySource: 'https://www.anthropic.com/legal/commercial-terms',
      policyReadAt: '2026-08-01',
    });
    expect(allowed?.local).toBe(false);
    expect(allowed?.entry.id).toBe('anthropic/claude');
  });

  it('keeps the local entry and drops the unknown and training ones', () => {
    const candidates: SensitiveCandidate[] = [
      { entry: entry({ id: 'ollama/qwen', sizeOnDiskGb: 4.7 }), provider: localProvider },
      { entry: entry({ id: 'vendor/mystery', dataPolicy: 'unknown' }), provider: cloudProvider },
      { entry: entry({ id: 'vendor/trainer', dataPolicy: 'trains' }), provider: cloudProvider },
      {
        entry: entry({ id: 'anthropic/claude', dataPolicy: 'no-training' }),
        provider: cloudProvider,
      },
    ];

    expect(filterForSensitiveTask(candidates).map((c) => c.entry.id)).toEqual([
      'ollama/qwen',
      'anthropic/claude',
    ]);
    expect(refusalsForSensitiveTask(candidates).map((r) => r.reason)).toEqual([
      'policy-unknown',
      'trains-on-input',
    ]);
  });

  it('accounts for every candidate exactly once, allowed plus refused', () => {
    const candidates: SensitiveCandidate[] = [
      { entry: entry({ id: 'a', dataPolicy: 'no-training' }), provider: cloudProvider },
      { entry: entry({ id: 'b', dataPolicy: 'unknown' }), provider: cloudProvider },
      { entry: entry({ id: 'c', dataPolicy: 'trains' }) },
    ];

    expect(
      filterForSensitiveTask(candidates).length + refusalsForSensitiveTask(candidates).length,
    ).toBe(candidates.length);
  });

  it('returns an empty list instead of throwing on an empty candidate set', () => {
    expect(filterForSensitiveTask([])).toEqual([]);
    expect(refusalsForSensitiveTask([])).toEqual([]);
  });
});

describe('the mandated rule: only a trains-on-input cloud model available', () => {
  /* One reachable cloud model that trains on input, no local runtime at all —
     neither an installed weight nor a local provider. Built through the real
     reachability filter so the fixture is one D6 will actually see. */
  const trainer = entry({
    id: 'vendor/trainer-large',
    providerKind: 'openai-compatible',
    dataPolicy: 'trains',
    policySource: 'https://vendor.example/terms',
    policyReadAt: '2026-08-01',
  });
  const configured = [cloudProvider];
  const reachable = reachableOnly(assessReachability([trainer], configured, [], verdict()));
  const candidates: SensitiveCandidate[] = reachable.map(() => ({
    entry: trainer,
    provider: cloudProvider,
  }));

  it('the only model on offer is in fact reachable — it is the rule that refuses it', () => {
    expect(reachable.map((r) => r.modelId)).toEqual(['vendor/trainer-large']);
    expect(candidates).toHaveLength(1);
  });

  it('the sensitive task list is exactly the four personal-content tasks', () => {
    expect(sensitiveTasks().sort()).toEqual([
      'classify-dump',
      'extract-tasks',
      'journal-chat',
      'journal-loose-ends',
    ]);
  });

  const sensitiveKinds: TaskKind[] = [
    'classify-dump',
    'extract-tasks',
    'journal-chat',
    'journal-loose-ends',
  ];

  for (const kind of sensitiveKinds) {
    it(`${kind} comes back unrouted, with a reason`, () => {
      expect(isSensitiveTask(kind)).toBe(true);

      const allowed = filterForSensitiveTask(candidates);
      const refused = refusalsForSensitiveTask(candidates);
      const pick = allowed[0] ?? null;

      expect(pick).toBeNull();
      expect(refused.map((r) => r.reason)).toEqual(['trains-on-input']);
    });
  }

  it('a non-sensitive task is not subject to this filter at all', () => {
    // Whether the filter runs is a per-task branch on `sensitive` (D6's
    // recommend.ts); this module only answers for sensitive tasks.
    expect(taskDefinition('classify-dump').sensitive).toBe(true);
    expect(taskDefinition('summarize-source').sensitive).toBe(false);
    expect(isSensitiveTask('summarize-source')).toBe(false);

    // The same candidate list, unfiltered, still holds the model — so a
    // non-sensitive task keeps a routable option.
    expect(candidates.map((c) => c.entry.id)).toEqual(['vendor/trainer-large']);
  });
});
