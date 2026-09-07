/* 074 D1: `startExternal` — a task whose lifecycle is paced from outside the
   registry's own pump (the gardener run, an ingest job in later
   deliverables). This file only exercises the primitive itself: creation in
   either starting state, progress ticks via the handle, settling once, and
   the `onCancel` hook — including the reentrant case where the hook itself
   tries to cancel the same task again. */

import { describe, expect, it } from 'vitest';
import { WorkRegistry } from '@core/work/registry';
import type { CancelReason } from '@core/work/registry';
import type { WorkTaskSubject } from '@shared/types';

function subject(label: string): WorkTaskSubject {
  return { label, ref: null };
}

describe('WorkRegistry.startExternal', () => {
  it('creates a running task by default, visible in list(), with startedAt set', () => {
    const registry = new WorkRegistry({ now: () => new Date('2026-08-10T10:00:00.000Z') });

    const handle = registry.startExternal({
      kind: 'gardener',
      lane: 'free',
      subject: subject('maintenance run'),
    });

    const listed = registry.list().find((entry) => entry.id === handle.id);
    expect(listed?.state).toBe('running');
    expect(listed?.startedAt).toBe('2026-08-10T10:00:00.000Z');
  });

  it('creates a queued task on request; start() moves it to running exactly once', () => {
    const registry = new WorkRegistry({ now: () => new Date('2026-08-10T10:00:00.000Z') });

    const handle = registry.startExternal(
      { kind: 'ingest', lane: 'import', subject: subject('import job') },
      { state: 'queued' },
    );

    let listed = registry.list().find((entry) => entry.id === handle.id);
    expect(listed?.state).toBe('queued');
    expect(listed?.startedAt).toBeNull();

    handle.start();
    listed = registry.list().find((entry) => entry.id === handle.id);
    expect(listed?.state).toBe('running');
    const startedAt = listed?.startedAt;
    expect(startedAt).toBe('2026-08-10T10:00:00.000Z');

    // Calling start() again while already running is a no-op.
    handle.start();
    listed = registry.list().find((entry) => entry.id === handle.id);
    expect(listed?.state).toBe('running');
    expect(listed?.startedAt).toBe(startedAt);
  });

  it('update() patches progress/message/detail; a no-op once finished', () => {
    const registry = new WorkRegistry();
    const handle = registry.startExternal({
      kind: 'ingest',
      lane: 'import',
      subject: subject('import job'),
    });

    handle.update({ progress: 0.4, message: 'fetching', detail: null });
    let listed = registry.list().find((entry) => entry.id === handle.id);
    expect(listed).toMatchObject({ progress: 0.4, message: 'fetching' });

    handle.finish();
    handle.update({ progress: 0.9, message: 'still going' });
    listed = registry.list().find((entry) => entry.id === handle.id);
    // Value did not change further after finish() settled the task.
    expect(listed).toMatchObject({ progress: 1, message: null });
  });

  it('finish() settles done with hasResult and finishedAt; a second finish() is a no-op', () => {
    const registry = new WorkRegistry({ now: () => new Date('2026-08-10T11:00:00.000Z') });
    const handle = registry.startExternal({
      kind: 'gardener',
      lane: 'free',
      subject: subject('maintenance run'),
    });

    handle.finish({ hasResult: true });
    const firstFinish = registry.list().find((entry) => entry.id === handle.id);
    expect(firstFinish).toMatchObject({
      state: 'done',
      progress: 1,
      hasResult: true,
      finishedAt: '2026-08-10T11:00:00.000Z',
    });

    handle.finish({ hasResult: false });
    const secondFinish = registry.list().find((entry) => entry.id === handle.id);
    // Stays exactly as first settled — the second call changed nothing.
    expect(secondFinish).toEqual(firstFinish);
  });

  it('fail() settles failed with an error code and message from describeFailure', () => {
    const registry = new WorkRegistry();
    const handle = registry.startExternal({
      kind: 'gardener',
      lane: 'free',
      subject: subject('maintenance run'),
    });

    handle.fail(new Error('boom'));
    const listed = registry.list().find((entry) => entry.id === handle.id);
    expect(listed).toMatchObject({ state: 'failed', error: 'unknown', message: 'boom' });
  });

  it('cancel() reaches an external task and calls onCancel exactly once, safely reentrant', () => {
    const registry = new WorkRegistry();
    let calls = 0;
    let taskId = '';

    const onCancel = (_reason: CancelReason): void => {
      calls += 1;
      // Simulates a real hook calling back into cancel() for the same task —
      // must be a safe no-op since the entry is already settled by the time
      // onCancel fires (see registry.ts's `terminate()`).
      registry.cancel(taskId, 'user');
    };

    const handle = registry.startExternal(
      { kind: 'gardener', lane: 'free', subject: subject('maintenance run') },
      { onCancel },
    );
    taskId = handle.id;

    expect(registry.cancel(handle.id, 'user')).toBe(true);

    const listed = registry.list().find((entry) => entry.id === handle.id);
    expect(listed?.state).toBe('cancelled');
    expect(calls).toBe(1);
  });

  it('retry() refuses a failed external task instead of re-enqueuing its no-op stub (review F1)', () => {
    const registry = new WorkRegistry();
    const handle = registry.startExternal({
      kind: 'ingest',
      lane: 'import',
      subject: subject('import job'),
    });
    const before = registry.list().length;

    handle.fail(new Error('file not found'));
    expect(registry.list().find((entry) => entry.id === handle.id)?.state).toBe('failed');

    // `entry.run` for an external task is `startExternal`'s own no-op stub —
    // retrying it would silently create a fresh 'done' task without redoing
    // any real work, so `retry()` must refuse it the same way it refuses a
    // task that never failed.
    expect(registry.retry(handle.id)).toBeNull();
    expect(registry.list().length).toBe(before);
  });

  it('cancelAll(shutdown) reaches an external task and calls onCancel with the shutdown reason', () => {
    const registry = new WorkRegistry();
    const reasons: CancelReason[] = [];

    const handle = registry.startExternal(
      { kind: 'gardener', lane: 'free', subject: subject('maintenance run') },
      { onCancel: (reason) => reasons.push(reason) },
    );

    registry.cancelAll('shutdown');

    const listed = registry.list().find((entry) => entry.id === handle.id);
    expect(listed?.state).toBe('cancelled');
    expect(reasons).toEqual(['shutdown']);
  });
});
