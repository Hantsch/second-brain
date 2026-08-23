import { describe, expect, it } from 'vitest';
import { applyVramOverride, judgeCapacity } from '@core/llm';
import { describeCapacityBand } from '@core/llm/capacity-bands';
import type { MachineFacts } from '@shared/types';

/* Fixtures for the four machines named in the 019a plan, plus the win32 case
   (D2) where a GPU is detected by name but its VRAM size is deliberately
   left `null` because WMI's 32-bit AdapterRAM truncates on cards >= 4GB. */

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

describe('judgeCapacity', () => {
  it('16 GB RAM, no usable GPU: RAM-bound, small models only', () => {
    const verdict = judgeCapacity(facts({ totalRamMb: 16384, cpuCores: 8 }));

    expect(verdict.heuristic).toBe(true);
    expect(verdict.limitingFactor).toBe('ram');
    expect(verdict.unknowns).toEqual([]);
    expect(verdict.maxComfortableParamsB).not.toBeNull();
    expect(verdict.maxComfortableParamsB).toBeCloseTo(10.909, 2);
    expect(verdict.maxPossibleParamsB).toBeCloseTo(21.818, 2);
    expect(verdict.tiersThatFit).toEqual(['3B', '7B', '8B']);
  });

  it('32 GB RAM, 8 GB GPU: VRAM-bound, the tighter ceiling', () => {
    const verdict = judgeCapacity(
      facts({
        totalRamMb: 32768,
        cpuCores: 8,
        vramMb: 8192,
        gpuName: 'NVIDIA GeForce RTX 3070',
        gpuDetection: 'detected',
      }),
    );

    expect(verdict.limitingFactor).toBe('vram');
    expect(verdict.unknowns).toEqual([]);
    expect(verdict.maxComfortableParamsB).toBeCloseTo(10.182, 2);
    expect(verdict.maxPossibleParamsB).toBeCloseTo(12.727, 2);
    expect(verdict.tiersThatFit).toEqual(['3B', '7B', '8B']);
  });

  it('96 GB RAM, no GPU: RAM-bound but roomy, up to the biggest landmark', () => {
    const verdict = judgeCapacity(facts({ totalRamMb: 98304, cpuCores: 8 }));

    expect(verdict.limitingFactor).toBe('ram');
    expect(verdict.unknowns).toEqual([]);
    expect(verdict.maxComfortableParamsB).toBeCloseTo(83.636, 2);
    expect(verdict.tiersThatFit).toEqual(['3B', '7B', '8B', '13B', '34B', '70B']);
  });

  it('every fact unknown: degrades to "unknown", never guesses a number', () => {
    const verdict = judgeCapacity(facts({}));

    expect(verdict.limitingFactor).toBe('unknown');
    expect(verdict.maxComfortableParamsB).toBeNull();
    expect(verdict.maxPossibleParamsB).toBeNull();
    expect(verdict.tiersThatFit).toEqual([]);
    expect(verdict.heuristic).toBe(true);
    expect(verdict.unknowns.sort()).toEqual(['cpu', 'ram']);
  });

  it('GPU detected by name but VRAM unknown (win32 AdapterRAM truncation): distinct from "no GPU"', () => {
    const namedGpuUnknownVram = judgeCapacity(
      facts({
        totalRamMb: 16384,
        cpuCores: 8,
        vramMb: null,
        gpuName: 'NVIDIA GeForce RTX 3080',
        gpuDetection: 'detected',
      }),
    );
    const noGpuAtAll = judgeCapacity(facts({ totalRamMb: 16384, cpuCores: 8 }));

    // Same RAM-based ceiling either way (VRAM can't be used for sizing)...
    expect(namedGpuUnknownVram.limitingFactor).toBe('ram');
    expect(namedGpuUnknownVram.maxComfortableParamsB).toBeCloseTo(
      noGpuAtAll.maxComfortableParamsB ?? NaN,
      6,
    );
    // ...but the two cases are not silently collapsed: only the named-GPU case
    // flags VRAM as an unresolved unknown, so the caller can say "GPU detected,
    // memory size unknown" instead of "no GPU".
    expect(namedGpuUnknownVram.unknowns).toEqual(['vram']);
    expect(noGpuAtAll.unknowns).toEqual([]);
  });
});

/* 028, D2: `judgeCapacity` itself is untouched by the story — the merge
   (`applyVramOverride`) happens before a fact object ever reaches it, so
   these prove the two compose correctly rather than testing new judgement
   logic. RAM stays unknown throughout, isolating what entering VRAM alone
   changes. */
describe('judgeCapacity over a manually overridden VRAM figure', () => {
  const namedGpuNoRam = facts({
    cpuCores: 8,
    gpuName: 'NVIDIA GeForce RTX 4080',
    gpuDetection: 'detected',
  });

  it('flips the limiting factor to vram, raises the ceiling off "unknown", and drops vram from unknowns', () => {
    const before = judgeCapacity(namedGpuNoRam);
    expect(before.limitingFactor).toBe('unknown');
    expect(before.maxComfortableParamsB).toBeNull();
    expect(before.unknowns.sort()).toEqual(['ram', 'vram']);

    const merged = applyVramOverride(namedGpuNoRam, 16384);
    const after = judgeCapacity(merged);

    expect(after.limitingFactor).toBe('vram');
    expect(after.maxComfortableParamsB).not.toBeNull();
    expect(after.unknowns).toEqual(['ram']);
  });

  it('clearing the override restores the pre-override verdict exactly', () => {
    const cleared = applyVramOverride(namedGpuNoRam, null);

    expect(judgeCapacity(cleared)).toEqual(judgeCapacity(namedGpuNoRam));
  });
});

/* 029, D2: the resource budget percentage is applied AFTER the existing
   fixed reserves (VRAM headroom, RAM OS reserve), as a second multiplier on
   what's left — never on the raw figure. One fixture machine, swept across
   the accepted range, proves the ceiling only ever shrinks as the budget
   falls, and that omitting the argument reproduces pre-029 behaviour
   exactly. */
describe('judgeCapacity with a resource budget percentage', () => {
  const fixtureMachine: MachineFacts = facts({
    totalRamMb: 32768,
    cpuCores: 8,
    vramMb: 16384,
    gpuName: 'NVIDIA GeForce RTX 4080',
    gpuDetection: 'detected',
  });

  it('reports plannedVramMb/plannedRamMb/budgetPercent as (raw - reserve) x percent, at 100/80/50/10', () => {
    // Fixed reserves from capacity.ts: VRAM_HEADROOM_MB = 1024, RAM_OS_RESERVE_MB = 4096.
    const usableVramMb = 16384 - 1024;
    const usableRamMb = 32768 - 4096;

    for (const percent of [100, 80, 50, 10]) {
      const verdict = judgeCapacity(fixtureMachine, percent);

      expect(verdict.budgetPercent).toBe(percent);
      expect(verdict.plannedVramMb).toBeCloseTo(usableVramMb * (percent / 100), 6);
      expect(verdict.plannedRamMb).toBeCloseTo(usableRamMb * (percent / 100), 6);
    }
  });

  it('tiersThatFit is non-empty at 100 percent and empty at 10 percent', () => {
    const at100 = judgeCapacity(fixtureMachine, 100);
    const at10 = judgeCapacity(fixtureMachine, 10);

    expect(at100.tiersThatFit.length).toBeGreaterThan(0);
    expect(at10.tiersThatFit).toEqual([]);
  });

  it('the comfortable ceiling is monotonically non-increasing as the percentage falls', () => {
    const percents = [100, 80, 50, 10];
    const ceilings = percents.map(
      (percent) => judgeCapacity(fixtureMachine, percent).maxComfortableParamsB,
    );

    for (const ceiling of ceilings) expect(ceiling).not.toBeNull();
    for (let i = 1; i < ceilings.length; i++) {
      expect(ceilings[i]!).toBeLessThanOrEqual(ceilings[i - 1]!);
    }
  });

  it('judgeCapacity(facts) with no second argument behaves exactly as it did before this parameter existed', () => {
    const withoutArgument = judgeCapacity(fixtureMachine);
    const withExplicit100 = judgeCapacity(fixtureMachine, 100);

    expect(withoutArgument).toEqual(withExplicit100);
    expect(withoutArgument.limitingFactor).toBe('vram');
    expect(withoutArgument.maxComfortableParamsB).toBeCloseTo(21.818, 2);
    expect(withoutArgument.maxPossibleParamsB).toBeCloseTo(27.273, 2);
    expect(withoutArgument.tiersThatFit).toEqual(['3B', '7B', '8B', '13B']);
  });
});

/* 035, D6: the plain-language band the card's headline sentence uses instead
   of a parameter count. Pure function over `maxComfortableParamsB` — these
   fixtures reuse the ones above rather than re-deriving verdicts by hand, so
   a threshold change here is visibly tied to a real machine profile. */
describe('describeCapacityBand', () => {
  it('nothing local fits: "none"', () => {
    const verdict = judgeCapacity(facts({ totalRamMb: 4096, cpuCores: 2 }));

    expect(verdict.maxComfortableParamsB).not.toBeNull();
    expect(verdict.maxComfortableParamsB!).toBeLessThan(3);
    expect(describeCapacityBand(verdict)).toBe('none');
  });

  it('9.5 GB RAM, no usable GPU (comfortable ~5B): "small"', () => {
    const verdict = judgeCapacity(facts({ totalRamMb: 9728, cpuCores: 8 }));

    expect(verdict.maxComfortableParamsB).toBeCloseTo(5, 2);
    expect(describeCapacityBand(verdict)).toBe('small');
  });

  it('16 GB RAM, no usable GPU (comfortable ~10.9B): "medium"', () => {
    const verdict = judgeCapacity(facts({ totalRamMb: 16384, cpuCores: 8 }));

    expect(describeCapacityBand(verdict)).toBe('medium');
  });

  it('32 GB RAM, 16 GB VRAM at full budget (comfortable ~21.8B): "medium"', () => {
    const verdict = judgeCapacity(
      facts({
        totalRamMb: 32768,
        cpuCores: 8,
        vramMb: 16384,
        gpuName: 'NVIDIA GeForce RTX 4080',
        gpuDetection: 'detected',
      }),
    );

    expect(describeCapacityBand(verdict)).toBe('medium');
  });

  it('96 GB RAM, no GPU (comfortable ~83.6B): "large"', () => {
    const verdict = judgeCapacity(facts({ totalRamMb: 98304, cpuCores: 8 }));

    expect(describeCapacityBand(verdict)).toBe('large');
  });

  it('every fact unknown: "none", never a band on a guessed number', () => {
    const verdict = judgeCapacity(facts({}));

    expect(verdict.limitingFactor).toBe('unknown');
    expect(describeCapacityBand(verdict)).toBe('none');
  });
});
