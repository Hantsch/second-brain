/* Covers scripts/lib/lane-minutes.mjs — see the rationale there. All
   timestamps are literals so the result never depends on the clock. */

import { describe, expect, it } from 'vitest';
import { laneReport } from '../../scripts/lib/lane-minutes.mjs';

const START = 1_000_000;
const MIN = 60_000;

describe('PR lane minutes report', () => {
  it('a run within budget writes the minutes and no warning', () => {
    const r = laneReport({ startedAtMs: START, endedAtMs: START + 4.3 * MIN, budgetMinutes: 6 });
    expect(r.summary).toBe('PR lane: 4.3 min of a 6 min budget');
    expect(r.warning).toBeNull();
  });

  it('a run over budget emits one ::warning naming the minutes and the budget', () => {
    const r = laneReport({ startedAtMs: START, endedAtMs: START + 7.5 * MIN, budgetMinutes: 6 });
    expect(r.warning).not.toBeNull();
    expect(r.warning).toMatch(/^::warning title=PR lane over budget::/);
    expect(r.warning).toContain('7.5');
    expect(r.warning).toContain('6');
    expect(r.warning).not.toContain('\n');
  });

  it('a run exactly at the budget does not warn', () => {
    const r = laneReport({ startedAtMs: START, endedAtMs: START + 6 * MIN, budgetMinutes: 6 });
    expect(r.warning).toBeNull();
  });

  it('a missing or non-numeric budget fails loudly', () => {
    const base = { startedAtMs: START, endedAtMs: START + MIN };
    expect(() => laneReport({ ...base } as never)).toThrow(/budgetMinutes/);
    expect(() => laneReport({ ...base, budgetMinutes: 'abc' } as never)).toThrow(/budgetMinutes/);
    expect(() => laneReport({ ...base, budgetMinutes: 0 })).toThrow(/budgetMinutes/);
  });
});
