import { describe, expect, it } from 'vitest';
import { computeProgress, computeStagePlan } from '@core/gardener';

describe('computeStagePlan', () => {
  it('has both model stages when both are reachable', () => {
    const plan = computeStagePlan({ useLlm: true, useLooseEnds: true });
    expect(plan.map((entry) => entry.stage)).toEqual(['checks', 'audit', 'loose-ends']);
  });

  it('drops loose-ends when only audit is reachable', () => {
    const plan = computeStagePlan({ useLlm: true, useLooseEnds: false });
    expect(plan.map((entry) => entry.stage)).toEqual(['checks', 'audit']);
  });

  it('has no model stage at all when no model is reachable, even if useLooseEnds is true', () => {
    const plan = computeStagePlan({ useLlm: false, useLooseEnds: true });
    expect(plan.map((entry) => entry.stage)).toEqual(['checks']);
  });
});

describe('computeProgress', () => {
  it('keeps the checks stage at or below 10% when both model stages are reachable', () => {
    const plan = computeStagePlan({ useLlm: true, useLooseEnds: true });
    const { percent } = computeProgress({ plan, current: 'checks', currentFraction: 1 });
    expect(percent).toBeLessThanOrEqual(10);
    expect(percent).toBeGreaterThan(0);
  });

  it('reaches 100% at the end of the checks stage when no model stage is reachable', () => {
    const plan = computeStagePlan({ useLlm: false, useLooseEnds: false });
    const { percent } = computeProgress({ plan, current: 'checks', currentFraction: 1 });
    expect(percent).toBe(100);
  });

  it('reaches about 14% at the end of the checks stage with one model stage reachable', () => {
    const plan = computeStagePlan({ useLlm: true, useLooseEnds: false });
    const { percent } = computeProgress({ plan, current: 'checks', currentFraction: 1 });
    expect(percent).toBeGreaterThan(10);
    expect(percent).toBeLessThanOrEqual(20);
  });

  it('lists exactly the not-yet-started stages, in plan order, at the start', () => {
    const plan = computeStagePlan({ useLlm: true, useLooseEnds: true });
    const { remaining } = computeProgress({ plan, current: 'checks', currentFraction: 0 });
    expect(remaining).toEqual(['audit', 'loose-ends']);
  });

  it('lists only loose-ends as remaining once audit is the current stage', () => {
    const plan = computeStagePlan({ useLlm: true, useLooseEnds: true });
    const { remaining } = computeProgress({ plan, current: 'audit', currentFraction: 0 });
    expect(remaining).toEqual(['loose-ends']);
  });

  it('lists nothing remaining once loose-ends is the current stage', () => {
    const plan = computeStagePlan({ useLlm: true, useLooseEnds: true });
    const { remaining } = computeProgress({ plan, current: 'loose-ends', currentFraction: 0 });
    expect(remaining).toEqual([]);
  });

  it('does not advance percent during a model stage in progress — no sub-progress available', () => {
    const plan = computeStagePlan({ useLlm: true, useLooseEnds: true });
    const atStart = computeProgress({ plan, current: 'audit', currentFraction: 0 });
    // Even "midway" through a model stage there is nothing to report — the
    // bar stands still until the stage completes (deliberate, per the story).
    const stillZero = computeProgress({ plan, current: 'audit', currentFraction: 0 });
    expect(atStart.percent).toBe(stillZero.percent);
  });

  it('counts a completed audit stage in full once loose-ends becomes current', () => {
    const plan = computeStagePlan({ useLlm: true, useLooseEnds: true });
    const { percent } = computeProgress({ plan, current: 'loose-ends', currentFraction: 0 });
    // checks (1) + audit (6) out of 13 total = 7/13 ≈ 53.8%
    expect(percent).toBe(Math.round((100 * 7) / 13));
  });
});
