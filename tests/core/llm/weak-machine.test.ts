import { describe, expect, it } from 'vitest';
import { judgeCapacity, loadCatalogue, recommendModels, TASK_KINDS } from '@core/llm';
import type { MachineFacts, ProviderConfig, TaskKind } from '@shared/types';

/* 032 D3, end to end on the machine the story was written for: a laptop with
   no discrete GPU, 8 GB of RAM and 4 cores. Scan facts -> `judgeCapacity` ->
   `recommendModels`, over the *bundled* catalogue rather than a hand-made
   one, so the recommendation is judged against the models the app actually
   ships with (D1's 1.2B and 3.2B entries among them).

   Nothing here mocks the capacity verdict: if a sizing constant in
   capacity.ts moves, this test is supposed to notice. */

function facts(overrides: Partial<MachineFacts>): MachineFacts {
  return {
    totalRamMb: null,
    cpuCores: null,
    platform: 'win32',
    arch: 'x64',
    freeDiskMb: null,
    vramMb: null,
    gpuName: null,
    gpuDetection: 'not-attempted',
    ...overrides,
  };
}

/** No VRAM detected, 8 GB RAM, 4 cores — the weak fixture machine. */
const WEAK_MACHINE = facts({ totalRamMb: 8192, cpuCores: 4, freeDiskMb: 60000 });

/** The local models this machine has actually pulled. The bundled 8B entry is
 *  deliberately absent: it must fail on capacity, not be waved through as
 *  "already installed" (`reachability.ts` checks installed before capacity). */
const INSTALLED_LOCAL = ['llama3.2:1b', 'llama3.2:3b', 'qwen2.5-coder:7b'];

const ollama: ProviderConfig = {
  id: 'ollama',
  label: 'Ollama',
  kind: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:11434/v1',
  hasKey: false,
  local: true,
  enabled: true,
  models: INSTALLED_LOCAL,
  createdAt: '2026-08-23T00:00:00Z',
};

/** Tasks whose minimum this machine cannot reach — the `strong` tier's 13B
 *  floor against a ceiling of ~7.3B. */
const BEYOND_THIS_MACHINE: readonly TaskKind[] = [
  'wiki-ingest',
  'gardener-audit',
  'condense-area',
  'condense-project',
  'condense-module',
];

describe('a weak machine, from scan facts to recommendation', () => {
  const verdict = judgeCapacity(WEAK_MACHINE);
  const catalogue = loadCatalogue();

  it('sizes the machine at roughly 3.6B comfortable / 7.3B possible, RAM-bound', () => {
    // (8192 - 4096 RAM reserve) / 1024 / 0.55 GB-per-B = 7.27 possible;
    // x 0.5 CPU-only penalty = 3.64 comfortable. 4 cores is exactly the
    // minimum, so no extra low-core penalty applies.
    expect(verdict.limitingFactor).toBe('ram');
    expect(verdict.maxComfortableParamsB).toBeCloseTo(3.636, 2);
    expect(verdict.maxPossibleParamsB).toBeCloseTo(7.273, 2);
    expect(verdict.unknowns).toEqual([]);
  });

  it('names a local model for every task the machine can carry — never "nothing fits"', () => {
    const result = recommendModels(catalogue, [ollama], INSTALLED_LOCAL, verdict);

    expect(result.tasks.map((task) => task.task)).toEqual(TASK_KINDS);
    for (const task of result.tasks) {
      if (BEYOND_THIS_MACHINE.includes(task.task)) continue;
      expect(task.pick, `${task.task} has no pick`).not.toBeNull();
      expect(task.pick?.providerId).toBe('ollama');
      expect(task.pick?.model.startsWith('ollama/')).toBe(true);
      expect(task.reasonKey).not.toBe('no-reachable-model');
      expect(task.reasonKey).not.toBe('sensitive-rule-no-qualifying-target');
    }
  });

  it('right-sizes: title-tags takes the 1.2B, classify-dump the 3.2B, balanced tasks the 7B', () => {
    const result = recommendModels(catalogue, [ollama], INSTALLED_LOCAL, verdict);
    const pick = (kind: TaskKind) => result.tasks.find((task) => task.task === kind)?.pick?.model;

    // Format-shaped, 1B floor (Q3b): the smallest model that clears it wins.
    expect(pick('title-tags')).toBe('ollama/llama3.2:1b');
    expect(pick('query-rerank')).toBe('ollama/llama3.2:1b');
    // Cheap tier, 3B floor: the 1.2B is out, the 3.2B is the smallest left
    // and the only one still under the comfortable ceiling.
    expect(pick('classify-dump')).toBe('ollama/llama3.2:3b');
    expect(pick('extract-tasks')).toBe('ollama/llama3.2:3b');
    // Balanced tier, 7B floor: only the 7B clears it, uncomfortable but
    // possible. The 8B entry is not reachable here at all.
    expect(pick('query-answer')).toBe('ollama/qwen2.5-coder:7b');
    expect(pick('journal-chat')).toBe('ollama/qwen2.5-coder:7b');
    for (const task of result.tasks) {
      expect(task.pick?.model).not.toBe('ollama/llama3.1:8b');
    }
  });

  it('never offers a model below the floor as a swap either', () => {
    const result = recommendModels(catalogue, [ollama], INSTALLED_LOCAL, verdict);
    const classifyDump = result.tasks.find((task) => task.task === 'classify-dump');

    expect(classifyDump?.alternatives.map((ref) => ref.model)).not.toContain('ollama/llama3.2:1b');
  });

  it('says a demanding task is beyond this machine instead of picking the biggest thing that fits', () => {
    const result = recommendModels(catalogue, [ollama], INSTALLED_LOCAL, verdict);

    for (const kind of BEYOND_THIS_MACHINE) {
      const row = result.tasks.find((task) => task.task === kind);
      expect(row?.pick, `${kind} should not be routed to a model that produces mush`).toBeNull();
      expect(row?.reasonKey).toBe('beyond-this-machine');
      expect(row?.alternatives).toEqual([]);
      expect(row?.shortfall?.requiredParamsB).toBe(13);
      expect(row?.shortfall?.machineParamsB).toBeCloseTo(7.273, 2);
      // The catalogue carries no-training cloud models, so "a cloud model for
      // this one task" is an honest option to name.
      expect(row?.shortfall?.cloudOptionAvailable).toBe(true);
      // The shortfall is only ever printed when it is true of this machine.
      expect(row!.shortfall!.machineParamsB!).toBeLessThan(row!.shortfall!.requiredParamsB);
    }
  });

  it('keeps the sensitive-task rule in front of all of it: a trainer is never the pick', () => {
    // Only two models in play: a small local one and a cloud one that trains
    // on input. The local model is below the balanced floor the sensitive
    // chat task wants — the rule still must not reach for the trainer.
    const entries = catalogue.entries.filter((entry) =>
      ['ollama/llama3.2:3b', 'openrouter/some-free-model'].includes(entry.id),
    );
    expect(entries).toHaveLength(2);
    const openrouter: ProviderConfig = {
      ...ollama,
      id: 'openrouter',
      label: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      hasKey: true,
      local: false,
      models: [],
    };
    const localOnly = { ...ollama, models: ['llama3.2:3b'] };

    const result = recommendModels(
      { generatedAt: catalogue.generatedAt, entries },
      [localOnly, openrouter],
      ['llama3.2:3b'],
      verdict,
    );

    for (const kind of ['classify-dump', 'extract-tasks', 'journal-chat'] as TaskKind[]) {
      const row = result.tasks.find((task) => task.task === kind);
      expect(row?.pick?.model, `${kind} named the trainer`).not.toBe('openrouter/some-free-model');
      expect(row?.alternatives.map((ref) => ref.model)).not.toContain('openrouter/some-free-model');
      expect(row?.pick?.providerId).toBe('ollama');
    }

    // Control: the trainer *was* reachable — a non-sensitive task sees it.
    const titleTags = result.tasks.find((task) => task.task === 'title-tags');
    expect(titleTags?.alternatives.map((ref) => ref.model)).toContain('openrouter/some-free-model');
  });
});
