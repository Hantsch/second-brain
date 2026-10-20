import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateState } from '../../../src/shared/types/update';
import type { UpdateCheckResult } from '../../../src/main/update/checker';
import { createUpdateService } from '../../../src/main/update/service';
import type { UpdateServiceOptions, UpdateSupport } from '../../../src/main/update/service';
import { saveUpdateRecord } from '../../../src/main/update/store';
import type { UpdateRecord } from '../../../src/main/update/store';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-10-20T12:00:00.000Z');
const OFFER = {
  version: '1.3.0',
  notes: 'Fixes and a new tab.',
  releasedAt: '2026-10-19T08:00:00.000Z',
};
const SUPPORTED: UpdateSupport = { supported: true, disabledReason: null };

let dir = '';
let clock = NOW;

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * HOUR).toISOString();
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function remember(record: Partial<UpdateRecord>): Promise<void> {
  await saveUpdateRecord(dir, {
    version: 1,
    checkedWith: '1.2.0',
    update: null,
    error: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    ...record,
  });
}

function start(
  result: UpdateCheckResult | (() => Promise<UpdateCheckResult>) = { kind: 'up-to-date' },
  overrides: Partial<UpdateServiceOptions> = {},
) {
  const check = vi.fn(typeof result === 'function' ? result : () => Promise.resolve(result));
  const states: UpdateState[] = [];
  const service = createUpdateService({
    dir,
    now: () => clock,
    check,
    currentVersion: '1.2.0',
    distribution: 'installed',
    isSupported: () => SUPPORTED,
    onStateChange: (state) => states.push(state),
    ...overrides,
  });
  return { service, check, states };
}

/** What the scheduled startup check runs once its delay has passed. */
const automatic = { manual: false };
const manual = { manual: true };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gaston-update-service-'));
  clock = NOW;
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});

describe('the daily update check window', () => {
  it('a start within 24 hours of the last successful check reuses the stored result without checking', async () => {
    await remember({ update: OFFER, lastCheckedAt: hoursAgo(23), lastSuccessAt: hoursAgo(23) });
    const { service, check } = start();

    const state = await service.check(automatic);

    expect(check).not.toHaveBeenCalled();
    expect(state).toMatchObject({
      status: 'available',
      update: OFFER,
      lastSuccessAt: hoursAgo(23),
    });
  });

  it('a start 24 hours or more after the last successful check checks again', async () => {
    await remember({ update: OFFER, lastCheckedAt: hoursAgo(24), lastSuccessAt: hoursAgo(24) });
    const { service, check } = start();

    const state = await service.check(automatic);

    expect(check).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({
      status: 'up-to-date',
      update: null,
      lastSuccessAt: NOW.toISOString(),
    });
  });

  it('a last success that is unreadable or lies in the future does not keep the window shut', async () => {
    for (const lastSuccessAt of ['not a date', new Date(NOW.getTime() + 5 * HOUR).toISOString()]) {
      await remember({ lastCheckedAt: hoursAgo(1), lastSuccessAt });
      const { service, check } = start();
      await service.check(automatic);
      expect(check).toHaveBeenCalledTimes(1);
    }
  });

  it('a failed check leaves the daily window open', async () => {
    await remember({ lastCheckedAt: hoursAgo(25), lastSuccessAt: hoursAgo(25) });
    await start({ kind: 'failed', reason: 'network' }).service.check(automatic);

    clock = new Date(NOW.getTime() + HOUR);
    const { service, check } = start();
    const state = await service.check(automatic);

    expect(check).toHaveBeenCalledTimes(1);
    expect(state.status).toBe('up-to-date');
  });

  it('a manual check ignores the daily window', async () => {
    await remember({ lastCheckedAt: hoursAgo(1), lastSuccessAt: hoursAgo(1) });
    const { service, check } = start({ kind: 'available', ...OFFER });

    const state = await service.check(manual);

    expect(check).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ status: 'available', update: OFFER });
  });
});

describe('the result of an update check', () => {
  it('a newer release yields an available state carrying its version and notes', async () => {
    const { service } = start({ kind: 'available', ...OFFER });

    const state = await service.check(manual);

    expect(state).toMatchObject({
      status: 'available',
      supported: true,
      currentVersion: '1.2.0',
      update: OFFER,
      error: null,
      lastCheckedAt: NOW.toISOString(),
      lastSuccessAt: NOW.toISOString(),
    });
  });

  it('no newer release yields up to date', async () => {
    await remember({ update: OFFER, lastCheckedAt: hoursAgo(30), lastSuccessAt: hoursAgo(30) });
    const { service } = start({ kind: 'up-to-date' });

    const state = await service.check(manual);

    expect(state).toMatchObject({ status: 'up-to-date', update: null, error: null });
  });

  it('a failed check records its reason', async () => {
    await remember({ update: OFFER, lastCheckedAt: hoursAgo(30), lastSuccessAt: hoursAgo(30) });
    const { service } = start({ kind: 'failed', reason: 'network' });

    const state = await service.check(manual);

    expect(state).toMatchObject({
      status: 'error',
      error: 'network',
      update: OFFER,
      lastCheckedAt: NOW.toISOString(),
      lastSuccessAt: hoursAgo(30),
    });
    expect(await start().service.getState()).toMatchObject({ status: 'error', error: 'network' });
  });

  it('a check that does not answer in time fails as a timeout and does not block the next one', async () => {
    const { service, check } = start(() => new Promise<UpdateCheckResult>(() => undefined), {
      timeoutMs: 20,
    });

    expect(await service.check(manual)).toMatchObject({ status: 'error', error: 'timeout' });
    await service.check(manual);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('a check asked for while one is running joins it', async () => {
    const answer = deferred<UpdateCheckResult>();
    const { service, check } = start(() => answer.promise);

    const first = service.check(automatic);
    const second = service.check(manual);
    await vi.waitFor(() => expect(check).toHaveBeenCalled());
    answer.resolve({ kind: 'available', ...OFFER });

    const [a, b] = await Promise.all([first, second]);
    expect(check).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a.status).toBe('available');
  });
});

describe('the remembered update check', () => {
  it('a restart restores the last result', async () => {
    await start({ kind: 'available', ...OFFER }).service.check(manual);

    const state = await start().service.getState();

    expect(state).toMatchObject({
      status: 'available',
      update: OFFER,
      lastCheckedAt: NOW.toISOString(),
      lastSuccessAt: NOW.toISOString(),
    });
  });

  it('a result checked on another version is dropped as stale', async () => {
    await remember({
      checkedWith: '1.2.0',
      update: OFFER,
      lastCheckedAt: hoursAgo(1),
      lastSuccessAt: hoursAgo(1),
    });
    const { service, check } = start({ kind: 'up-to-date' }, { currentVersion: '1.3.0' });

    expect(await service.getState()).toMatchObject({
      status: 'idle',
      update: null,
      lastSuccessAt: null,
    });
    await service.check(automatic);
    expect(check).toHaveBeenCalledTimes(1);
  });
});

describe('the startup update check', () => {
  it('scheduling the startup check returns before the check settles', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const answer = deferred<UpdateCheckResult>();
    const { service, check, states } = start(() => answer.promise);

    expect(service.scheduleStartupCheck()).toBeUndefined();
    expect(check).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3_000);
    await vi.waitFor(() => expect(states.at(-1)?.status).toBe('checking'));
    expect(check).toHaveBeenCalledTimes(1);

    answer.resolve({ kind: 'up-to-date' });
    await vi.waitFor(() => expect(states.at(-1)?.status).toBe('up-to-date'));
  });

  it('the startup check runs once per process and not after stop', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const once = start();
    once.service.scheduleStartupCheck(100);
    once.service.scheduleStartupCheck(100);
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(once.states.at(-1)?.status).toBe('up-to-date'));
    expect(once.check).toHaveBeenCalledTimes(1);

    const stopped = start();
    stopped.service.scheduleStartupCheck(100);
    stopped.service.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(stopped.check).not.toHaveBeenCalled();
  });

  it('no check runs, automatic or manual, when the build is unpackaged or in demo mode', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    for (const disabledReason of ['unpackaged', 'demo'] as const) {
      const { service, check } = start(
        { kind: 'available', ...OFFER },
        { isSupported: () => ({ supported: false, disabledReason }) },
      );

      service.scheduleStartupCheck();
      await vi.advanceTimersByTimeAsync(3_000);
      const state = await service.check(manual);

      expect(check).not.toHaveBeenCalled();
      expect(state).toMatchObject({
        supported: false,
        disabledReason,
        status: 'idle',
        update: null,
      });
    }
  });
});
