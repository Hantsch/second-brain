/* The one owner of "a maintenance run is going" (021a, D3).
 *
 * This used to be two flags — `running` in `ipc/gardener.ts` and `busy` in
 * `gardener-autorun.ts` — and the two failure modes of that are exactly what is
 * pinned down here: two runs at once, and a state that says "running" with
 * nothing left to reset it. So every ending is tested, not just the happy one:
 * a throw, a cancel, and even an emit that fails must free the slot.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginGardenerRun,
  cancelGardenerRun,
  gardenerRunSnapshot,
  gardenerRunning,
} from '../../src/main/gardener-run-state';
import type { GardenerRunSnapshot } from '../../src/main/gardener-run-state';

const STARTED = '2026-08-22T08:00:00.000Z';

function step(overrides: Partial<GardenerRunSnapshot> = {}): GardenerRunSnapshot {
  return {
    phase: 'checks',
    check: 'orphan',
    done: 3,
    total: 10,
    running: true,
    stage: 'checks',
    percent: 2,
    remaining: ['audit'],
    startedAt: STARTED,
    trigger: 'user',
    ...overrides,
  };
}

describe('gardener run state', () => {
  /* Module state outlives a test — a leftover run would refuse the next one. */
  afterEach(() => {
    cancelGardenerRun();
  });

  it('hands out the slot once, and again once the run has ended', () => {
    const emit = vi.fn();
    const first = beginGardenerRun({ trigger: 'user', emit });

    expect(first).not.toBeNull();
    expect(beginGardenerRun({ trigger: 'auto', emit })).toBeNull();

    first?.finish();

    expect(beginGardenerRun({ trigger: 'auto', emit })).not.toBeNull();
  });

  it('has a snapshot exactly as long as a run is going', () => {
    expect(gardenerRunning()).toBe(false);
    expect(gardenerRunSnapshot()).toBeNull();

    const handle = beginGardenerRun({ trigger: 'auto', emit: vi.fn() });

    /* Non-null from the first moment, before any step was published: "is a run
       going" and "what is it doing" have to be the same question. */
    expect(gardenerRunning()).toBe(true);
    expect(gardenerRunSnapshot()).toMatchObject({ running: true, trigger: 'auto' });
    expect(gardenerRunSnapshot()?.startedAt).toBe(handle?.startedAt);

    handle?.finish();

    expect(gardenerRunning()).toBe(false);
    expect(gardenerRunSnapshot()).toBeNull();
  });

  it('emits every published step and keeps the last one readable', () => {
    const emit = vi.fn();
    const handle = beginGardenerRun({ trigger: 'user', emit });

    handle?.publish(step({ done: 1 }));
    handle?.publish(step({ done: 2, percent: 5 }));

    expect(emit).toHaveBeenCalledTimes(2);
    expect(gardenerRunSnapshot()).toMatchObject({ done: 2, percent: 5 });
  });

  it('frees the slot when the run throws, and still ends visibly', () => {
    const emit = vi.fn();
    const handle = beginGardenerRun({ trigger: 'user', emit });

    expect(() => {
      try {
        handle?.publish(step());
        throw new Error('a stage failed');
      } finally {
        handle?.finish();
      }
    }).toThrow('a stage failed');

    expect(gardenerRunning()).toBe(false);
    expect(gardenerRunSnapshot()).toBeNull();
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ running: false, stage: 'done', percent: 100 }),
    );
  });

  it('aborts the signal on cancel and frees the slot right away', () => {
    const handle = beginGardenerRun({ trigger: 'auto', emit: vi.fn() });
    expect(handle?.signal.aborted).toBe(false);

    cancelGardenerRun();

    expect(handle?.signal.aborted).toBe(true);
    expect(gardenerRunning()).toBe(false);
    expect(gardenerRunSnapshot()).toBeNull();
    /* The next run must not wait for the cancelled one to finish unwinding. */
    expect(beginGardenerRun({ trigger: 'user', emit: vi.fn() })).not.toBeNull();
  });

  it('tells its own run why it was stopped — and defaults to the reason that keeps nothing', () => {
    /* Which stop it was decides whether anything may be kept (021b, D2), so the
       run has to be able to ask afterwards — the slot is already gone by then,
       so the reason has to sit on the run itself. */
    const running = beginGardenerRun({ trigger: 'user', emit: vi.fn() });
    expect(running?.cancelledBy()).toBeNull();

    cancelGardenerRun('user');
    expect(running?.cancelledBy()).toBe('user');

    const second = beginGardenerRun({ trigger: 'auto', emit: vi.fn() });
    /* A caller that does not say gets the reason that keeps nothing: a stop
       nobody labelled must not silently persist half a report. */
    cancelGardenerRun();
    expect(second?.cancelledBy()).toBe('shutdown');
    /* And the first run's answer is still its own, not the last cancel's. */
    expect(running?.cancelledBy()).toBe('user');

    const third = beginGardenerRun({ trigger: 'user', emit: vi.fn() });
    third?.finish();
    /* A run that simply ended was not stopped by anyone. */
    expect(third?.cancelledBy()).toBeNull();
  });

  it('does not let a cancelled run broadcast a false "not running" once a newer run holds the slot', () => {
    const first = vi.fn();
    const cancelled = beginGardenerRun({ trigger: 'user', emit: first });
    cancelGardenerRun();

    const second = vi.fn();
    const fresh = beginGardenerRun({ trigger: 'auto', emit: second });
    fresh?.publish({
      phase: 'checks',
      check: null,
      done: 1,
      total: 3,
      running: true,
      stage: 'checks',
      percent: 33,
      remaining: [],
      startedAt: fresh.startedAt,
      trigger: 'auto',
    });
    /* The cancelled run only notices its signal now. Its terminal snapshot
       must not go out at all — a newer run already holds the slot, and a
       stale "not running" after that run's own "running: true" would desync
       every listener from the true state. */
    cancelled?.finish();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith(expect.objectContaining({ running: true }));
    expect(gardenerRunSnapshot()).toMatchObject({ running: true, trigger: 'auto' });
    expect(fresh?.signal.aborted).toBe(false);
  });

  it('does nothing when there is no run to cancel', () => {
    expect(() => {
      cancelGardenerRun();
    }).not.toThrow();
    expect(gardenerRunning()).toBe(false);
    expect(gardenerRunSnapshot()).toBeNull();
  });

  it('frees the slot even if emitting the last step fails', () => {
    const handle = beginGardenerRun({
      trigger: 'user',
      emit: () => {
        throw new Error('no window left');
      },
    });

    expect(() => handle?.finish()).toThrow('no window left');
    /* A window that has gone away must not leave the app claiming a run. */
    expect(gardenerRunning()).toBe(false);
    expect(gardenerRunSnapshot()).toBeNull();
  });
});
