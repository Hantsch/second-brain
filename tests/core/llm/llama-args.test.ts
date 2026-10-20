import { describe, expect, it } from 'vitest';
import { MIN_CONTEXT_TOKENS, estimateTotalLayers, planLlamaStart } from '@core/llm/llama-args';
import type { LlamaModelFile, MachineFacts } from '@shared/types';

/* 034, D1: the four fixture machines from AC 10 — no GPU, small GPU, large
   GPU, GPU reported as `null` — each at the two budget settings the story
   names (100 and 50), plus the floor case.

   Every expected number below is written out rather than recomputed from the
   module's own constants, so a changed constant shows up as a failing test
   instead of a silently different plan. The arithmetic they encode, for the
   8B fixture model (4800 MB file, 32 layers → 150 MB per layer):

     planned VRAM  = (vramMb − 1024) × budget%      (capacity.ts, unchanged)
     planned RAM   = (totalRamMb − 4096) × budget%  (capacity.ts, unchanged)
     KV cache MB   = tokens × layers × 8 KB / 1024  = tokens / 4 at 32 layers
     a rung fits   = KV cache <= 50% of the planned memory of the active path
     gpu layers    = floor((planned VRAM − KV cache) / 150), clamped to 0..32 */

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

/** A Q4_K_M 8B file, the size of local model this story is written for. */
function model(overrides: Partial<LlamaModelFile> = {}): LlamaModelFile {
  return {
    fileName: 'llama-3-8b-instruct-q4_k_m.gguf',
    fileSizeMb: 4800,
    paramsB: 8,
    totalLayers: 32,
    ...overrides,
  };
}

const NO_GPU = facts({ totalRamMb: 16384, cpuCores: 8 });

const SMALL_GPU = facts({
  totalRamMb: 16384,
  cpuCores: 8,
  vramMb: 6144,
  gpuName: 'NVIDIA GeForce RTX 4050 Laptop GPU',
  gpuDetection: 'detected',
});

const LARGE_GPU = facts({
  totalRamMb: 65536,
  cpuCores: 16,
  vramMb: 24576,
  gpuName: 'NVIDIA GeForce RTX 4090',
  gpuDetection: 'detected',
});

/** GPU reported as `null` — detection ran and came back with nothing usable. */
const GPU_UNKNOWN = facts({
  totalRamMb: 16384,
  cpuCores: 8,
  vramMb: null,
  gpuDetection: 'unknown',
});

const MATRIX: readonly { name: string; facts: MachineFacts }[] = [
  { name: 'no GPU', facts: NO_GPU },
  { name: 'small GPU', facts: SMALL_GPU },
  { name: 'large GPU', facts: LARGE_GPU },
  { name: 'GPU reported as null', facts: GPU_UNKNOWN },
];

describe('planLlamaStart over the four fixture machines', () => {
  it('no GPU, 16 GB RAM: everything on the CPU, context still fits in RAM', () => {
    // Planned RAM 12288 MB at 100%, 6144 at 50% — half of either is well above
    // the 2048 MB an 8192-token cache costs, so the context stays at the top
    // rung both times; the offload does not, because there is no VRAM figure.
    const full = planLlamaStart({ facts: NO_GPU, budgetPercent: 100, model: model() });
    expect(full.gpuLayers).toEqual({ value: 0, source: 'derived', reason: 'no-vram:0/32' });
    expect(full.contextTokens).toEqual({
      value: 8192,
      source: 'derived',
      reason: 'context-fits:8192',
    });
    expect(full.threads).toEqual({ value: 7, source: 'derived', reason: 'threads-budget:7/8' });
    expect(full.warnings).toEqual(['cpu-only']);
    expect(full.argv).toEqual(['-ngl', '0', '-c', '8192', '-t', '7']);

    const half = planLlamaStart({ facts: NO_GPU, budgetPercent: 50, model: model() });
    expect(half.contextTokens.value).toBe(8192);
    expect(half.threads).toEqual({ value: 4, source: 'derived', reason: 'threads-budget:4/8' });
    expect(half.argv).toEqual(['-ngl', '0', '-c', '8192', '-t', '4']);
  });

  it('6 GB GPU: a partial offload, and halving the budget costs context and layers', () => {
    // 100%: planned VRAM 5120; 8192 tokens cost 2048 <= 2560, so the top rung
    // holds, and (5120 − 2048) / 150 = 20.48 → 20 of 32 layers.
    const full = planLlamaStart({ facts: SMALL_GPU, budgetPercent: 100, model: model() });
    expect(full.gpuLayers).toEqual({ value: 20, source: 'derived', reason: 'vram-fit:20/32' });
    expect(full.contextTokens.value).toBe(8192);
    expect(full.warnings).toEqual([]);
    expect(full.argv).toEqual(['-ngl', '20', '-c', '8192', '-t', '7']);

    // 50%: planned VRAM 2560; 8192 tokens would cost 2048 > 1280, so the ladder
    // drops to 4096 (1024 MB), and (2560 − 1024) / 150 = 10.24 → 10 layers.
    const half = planLlamaStart({ facts: SMALL_GPU, budgetPercent: 50, model: model() });
    expect(half.gpuLayers).toEqual({ value: 10, source: 'derived', reason: 'vram-fit:10/32' });
    expect(half.contextTokens).toEqual({
      value: 4096,
      source: 'derived',
      reason: 'context-fits:4096',
    });
    expect(half.warnings).toEqual([]);
    expect(half.argv).toEqual(['-ngl', '10', '-c', '4096', '-t', '4']);
  });

  it('24 GB GPU: the whole model offloads at both budgets, layer count clamped to the total', () => {
    const full = planLlamaStart({ facts: LARGE_GPU, budgetPercent: 100, model: model() });
    expect(full.gpuLayers).toEqual({ value: 32, source: 'derived', reason: 'vram-fit:32/32' });
    expect(full.contextTokens.value).toBe(8192);
    expect(full.threads).toEqual({ value: 15, source: 'derived', reason: 'threads-budget:15/16' });
    expect(full.warnings).toEqual([]);

    // (11776 − 2048) / 150 = 64.85 — still far more layers than the model has.
    const half = planLlamaStart({ facts: LARGE_GPU, budgetPercent: 50, model: model() });
    expect(half.gpuLayers.value).toBe(32);
    expect(half.contextTokens.value).toBe(8192);
    expect(half.threads).toEqual({ value: 8, source: 'derived', reason: 'threads-budget:8/16' });
  });

  it('GPU reported as null: planned exactly like the machine without a GPU', () => {
    // `judgeCapacity` produces no `plannedVramMb` in either case, so the two
    // plans have to be identical — an unusable VRAM figure must not quietly
    // become a small one.
    for (const budgetPercent of [100, 50]) {
      const unknown = planLlamaStart({ facts: GPU_UNKNOWN, budgetPercent, model: model() });
      const none = planLlamaStart({ facts: NO_GPU, budgetPercent, model: model() });

      expect(unknown).toEqual(none);
      expect(unknown.warnings).toEqual(['cpu-only']);
    }
  });

  it('is deterministic: the same input twice produces a deeply equal plan', () => {
    for (const machine of MATRIX) {
      for (const budgetPercent of [100, 50]) {
        const first = planLlamaStart({ facts: machine.facts, budgetPercent, model: model() });
        const second = planLlamaStart({ facts: machine.facts, budgetPercent, model: model() });

        expect(first).toEqual(second);
        expect(first.argv).toEqual(second.argv);
      }
    }
  });

  it('never puts a path or a port in argv — those belong to the spawn step', () => {
    const plan = planLlamaStart({ facts: SMALL_GPU, budgetPercent: 100, model: model() });

    expect(plan.argv).toEqual(['-ngl', '20', '-c', '8192', '-t', '7']);
    expect(plan.argv.join(' ')).not.toContain('.gguf');
    expect(plan.argv.join(' ')).not.toContain('--model');
    expect(plan.argv.join(' ')).not.toContain('--port');
    // Every second entry is a value: none of them may be a NaN that leaked out
    // of an unknown fact.
    const values = plan.argv.filter((_, index) => index % 2 === 1);
    for (const value of values) expect(Number.isFinite(Number(value))).toBe(true);
  });
});

/* Decisions, Q4: below the floor the engine is still started — with a warning,
   never a refusal. */
describe('planLlamaStart when nothing fits', () => {
  const TINY = facts({ totalRamMb: 4608, cpuCores: 2 });

  it('4.5 GB RAM, no GPU: starts at the 2048 floor and says it will be slow', () => {
    // Planned RAM (4608 − 4096) = 512; half of that is 256, and even a
    // 2048-token cache costs 512 MB. Nothing on the ladder fits.
    const plan = planLlamaStart({ facts: TINY, budgetPercent: 100, model: model() });

    expect(plan.contextTokens).toEqual({
      value: MIN_CONTEXT_TOKENS,
      source: 'floor',
      reason: 'context-floor:2048',
    });
    expect(plan.contextTokens.value).toBe(2048);
    expect(plan.warnings).toContain('slow-floor-context');
    expect(plan.warnings).toContain('cpu-only');
    expect(plan.threads).toEqual({ value: 1, source: 'derived', reason: 'threads-budget:1/2' });
    expect(plan.argv).toEqual(['-ngl', '0', '-c', '2048', '-t', '1']);
  });

  it('halving the budget on that machine changes nothing about the floor', () => {
    const plan = planLlamaStart({ facts: TINY, budgetPercent: 50, model: model() });

    expect(plan.contextTokens.value).toBe(2048);
    expect(plan.contextTokens.source).toBe('floor');
    expect(plan.warnings).toContain('slow-floor-context');
  });

  it('every fact unknown: a plan, not a throw, with the fallbacks named', () => {
    const plan = planLlamaStart({ facts: facts({}), budgetPercent: 100, model: model() });

    expect(plan.threads).toEqual({ value: 4, source: 'fallback', reason: 'threads-default:4' });
    expect(plan.contextTokens.source).toBe('floor');
    expect(plan.warnings).toEqual(['cpu-only', 'slow-floor-context', 'facts-unknown']);
  });

  it('a GPU detected by name but with unknown VRAM is flagged as a missing fact', () => {
    // The win32 AdapterRAM case (028): `judgeCapacity` calls VRAM an unknown
    // here, so the plan warns instead of pretending the CPU-only answer is the
    // complete truth.
    const plan = planLlamaStart({
      facts: facts({
        totalRamMb: 16384,
        cpuCores: 8,
        gpuName: 'NVIDIA GeForce RTX 3080',
        gpuDetection: 'detected',
      }),
      budgetPercent: 100,
      model: model(),
    });

    expect(plan.gpuLayers.value).toBe(0);
    expect(plan.warnings).toEqual(['cpu-only', 'facts-unknown']);
  });
});

/* Decisions, Q1: the two hand-entered numbers behind the "advanced"
   disclosure. An override is used verbatim (clamped), never re-derived. */
describe('planLlamaStart with hand-entered overrides', () => {
  const base = { facts: SMALL_GPU, budgetPercent: 100, model: model() };

  it('marks an entered layer count as manual and leaves the rest derived', () => {
    const plan = planLlamaStart({ ...base, overrides: { gpuLayers: 8, contextTokens: null } });

    expect(plan.gpuLayers).toEqual({ value: 8, source: 'manual', reason: 'manual:8/32' });
    expect(plan.contextTokens.source).toBe('derived');
    expect(plan.argv).toEqual(['-ngl', '8', '-c', '8192', '-t', '7']);
  });

  it('re-sizes the offload against an entered context, since the two share the VRAM', () => {
    // A 2048-token cache costs 512 MB instead of 2048, so the same 5120 MB of
    // planned VRAM now carries (5120 − 512) / 150 = 30.72 → 30 layers.
    const plan = planLlamaStart({ ...base, overrides: { gpuLayers: null, contextTokens: 2048 } });

    expect(plan.contextTokens).toEqual({ value: 2048, source: 'manual', reason: 'manual:2048' });
    expect(plan.gpuLayers).toEqual({ value: 30, source: 'derived', reason: 'vram-fit:30/32' });
    // A context of 2048 the user asked for is a choice, not a shortfall.
    expect(plan.warnings).toEqual([]);
  });

  it('clamps entered values into a sane range instead of refusing them', () => {
    const plan = planLlamaStart({ ...base, overrides: { gpuLayers: 999, contextTokens: 512 } });

    expect(plan.gpuLayers).toEqual({ value: 32, source: 'manual', reason: 'manual:32/32' });
    expect(plan.contextTokens.value).toBe(MIN_CONTEXT_TOKENS);
    expect(plan.contextTokens.source).toBe('manual');
  });

  it('clearing both overrides returns exactly the derived plan', () => {
    const derived = planLlamaStart(base);
    const cleared = planLlamaStart({
      ...base,
      overrides: { gpuLayers: null, contextTokens: null },
    });

    expect(cleared).toEqual(derived);
    expect(cleared.gpuLayers.source).toBe('derived');
    expect(cleared.contextTokens.source).toBe('derived');
  });
});

/* The layer count is an input; the table only fills in what 033's flat
   `models/gguf/` directory cannot tell us. */
describe('estimateTotalLayers and the estimated marker', () => {
  it('maps the llama-family landmarks', () => {
    expect(estimateTotalLayers(1)).toBe(16);
    expect(estimateTotalLayers(3)).toBe(28);
    expect(estimateTotalLayers(7)).toBe(32);
    expect(estimateTotalLayers(8)).toBe(32);
    expect(estimateTotalLayers(13)).toBe(40);
    expect(estimateTotalLayers(34)).toBe(48);
    expect(estimateTotalLayers(70)).toBe(80);
  });

  it('never extrapolates past the largest landmark and survives nonsense input', () => {
    expect(estimateTotalLayers(405)).toBe(80);
    expect(estimateTotalLayers(0)).toBe(32);
    expect(estimateTotalLayers(Number.NaN)).toBe(32);
  });

  it('marks a plan whose layer count came from the table, without changing the numbers', () => {
    const known = planLlamaStart({ facts: SMALL_GPU, budgetPercent: 100, model: model() });
    const guessed = planLlamaStart({
      facts: SMALL_GPU,
      budgetPercent: 100,
      model: model({ totalLayers: null }),
    });

    expect(guessed.gpuLayers.value).toBe(known.gpuLayers.value);
    expect(guessed.gpuLayers.reason).toBe('vram-fit:20/32:estimated');
  });

  it('falls back to the middle landmark when neither the layers nor the size are known', () => {
    const plan = planLlamaStart({
      facts: SMALL_GPU,
      budgetPercent: 100,
      model: model({ totalLayers: null, paramsB: null, fileSizeMb: 0 }),
    });

    // No file size means no per-layer cost to divide by — an honest 0 offload
    // rather than a number derived from a division by zero.
    expect(plan.gpuLayers).toEqual({
      value: 0,
      source: 'derived',
      reason: 'unknown-size:0/32:estimated',
    });
    expect(plan.argv).toEqual(['-ngl', '0', '-c', '8192', '-t', '7']);
  });
});
