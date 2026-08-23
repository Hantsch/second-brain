import { describe, expect, it } from 'vitest';
import { applyVramOverride } from '@core/llm';
import type { MachineFacts } from '@shared/types';

/* Fixtures mirror capacity.test.ts's style: a base object with every field
   at its "unknown" default, overridden per case. */

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

describe('applyVramOverride', () => {
  it('no override, no detection: stays unknown', () => {
    const merged = applyVramOverride(facts({}), null);

    expect(merged.vramMb).toBeNull();
    expect(merged.detectedVramMb).toBeNull();
    expect(merged.manualVramMb).toBeNull();
    expect(merged.vramSource).toBe('none');
    expect(merged.vramConflict).toBe(false);
  });

  it('no override, with detection: effective value is the detected one', () => {
    const merged = applyVramOverride(facts({ vramMb: 8192 }), null);

    expect(merged.vramMb).toBe(8192);
    expect(merged.detectedVramMb).toBe(8192);
    expect(merged.manualVramMb).toBeNull();
    expect(merged.vramSource).toBe('detected');
    expect(merged.vramConflict).toBe(false);
  });

  it('override with no detection: manual value becomes effective', () => {
    const merged = applyVramOverride(facts({ vramMb: null }), 16384);

    expect(merged.vramMb).toBe(16384);
    expect(merged.detectedVramMb).toBeNull();
    expect(merged.manualVramMb).toBe(16384);
    expect(merged.vramSource).toBe('manual');
    expect(merged.vramConflict).toBe(false);
  });

  it('override equal to detection: manual wins, no conflict', () => {
    const merged = applyVramOverride(facts({ vramMb: 8192 }), 8192);

    expect(merged.vramMb).toBe(8192);
    expect(merged.detectedVramMb).toBe(8192);
    expect(merged.manualVramMb).toBe(8192);
    expect(merged.vramSource).toBe('manual');
    expect(merged.vramConflict).toBe(false);
  });

  it('override contradicting detection: manual wins, conflict flagged', () => {
    const merged = applyVramOverride(facts({ vramMb: 8192 }), 16384);

    expect(merged.vramMb).toBe(16384);
    expect(merged.detectedVramMb).toBe(8192);
    expect(merged.manualVramMb).toBe(16384);
    expect(merged.vramSource).toBe('manual');
    expect(merged.vramConflict).toBe(true);
  });

  it('clearing the override restores the pre-override state', () => {
    const base = facts({ vramMb: 8192 });

    const cleared = applyVramOverride(base, null);
    const neverOverridden = applyVramOverride(base, null);

    expect(cleared).toEqual(neverOverridden);
    expect(cleared.vramMb).toBe(8192);
    expect(cleared.vramSource).toBe('detected');
    expect(cleared.vramConflict).toBe(false);
  });

  it('does not mutate the input facts object', () => {
    const base = facts({ vramMb: 8192 });
    const before = JSON.stringify(base);

    applyVramOverride(base, 16384);

    expect(JSON.stringify(base)).toBe(before);
    expect(base.vramMb).toBe(8192);
  });
});
