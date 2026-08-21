import { describe, expect, it } from 'vitest';
import { judgeCapacity } from '@core/llm';
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
