/* 072, D3: `tasks-view.ts` is the pure derivation behind both the rail badge
 * and D4's screen — no React, no IO, so these tests exercise it directly
 * against hand-built `WorkTask`s and `GardenerProgress` snapshots.
 *
 * AC2 — "the badge counts running plus waiting" — including the maintenance
 * row, which is the story's whole point: a badge that stayed at zero while a
 * maintenance run is visibly going on the tasks screen would be exactly the
 * "two answers" bug 072 exists to close.
 *
 * AC3 — "a waiting task reports its position, a finished one its duration."
 */

import { describe, expect, it } from 'vitest';
import type { WorkTask } from '@shared/types';
import type { GardenerProgress } from '@renderer/lib/gardener-progress';
import { t } from '@renderer/i18n';
import {
  buildTasksView,
  groupTasks,
  maintenanceTaskRow,
  taskDuration,
  taskQueuePosition,
  tasksBadgeCount,
} from '@renderer/lib/tasks-view';

function task(overrides: Partial<WorkTask> = {}): WorkTask {
  return {
    id: 'task-1',
    kind: 'ingest',
    lane: 'free',
    subject: { label: 'A source', ref: null },
    state: 'queued',
    progress: 0,
    message: null,
    error: null,
    hasResult: false,
    queuePosition: null,
    queuedAt: '2026-09-07T10:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function progress(overrides: Partial<GardenerProgress> = {}): GardenerProgress {
  return {
    phase: 'checks',
    check: 'orphan',
    done: 2,
    total: 9,
    running: true,
    stage: 'checks',
    percent: 22,
    remaining: [],
    startedAt: '2026-09-07T10:00:00.000Z',
    trigger: 'user',
    ...overrides,
  };
}

describe('tasksBadgeCount (AC2)', () => {
  it('counts running and waiting tasks, ignoring finished ones', () => {
    const tasks = [
      task({ id: 'a', state: 'running' }),
      task({ id: 'b', state: 'queued', queuePosition: 1 }),
      task({ id: 'c', state: 'done' }),
      task({ id: 'd', state: 'failed' }),
      task({ id: 'e', state: 'cancelled' }),
    ];

    expect(tasksBadgeCount(tasks, null)).toBe(2);
  });

  it('adds one for a running maintenance row on top of the registry count', () => {
    const tasks = [task({ id: 'a', state: 'running' })];

    expect(tasksBadgeCount(tasks, progress())).toBe(2);
  });

  it('counts the maintenance row alone when the registry is empty', () => {
    expect(tasksBadgeCount([], progress())).toBe(1);
  });

  it('reads zero when nothing is running or waiting and no maintenance run is going', () => {
    const tasks = [task({ id: 'a', state: 'done' })];

    expect(tasksBadgeCount(tasks, null)).toBe(0);
  });
});

describe('taskQueuePosition / taskDuration (AC3)', () => {
  it('reports a waiting task its queue position', () => {
    const waiting = task({ state: 'queued', queuePosition: 3 });

    expect(taskQueuePosition(waiting)).toBe(3);
  });

  it('reports no position for a task that is not queued', () => {
    expect(taskQueuePosition(task({ state: 'running', queuePosition: null }))).toBeNull();
    expect(taskQueuePosition(task({ state: 'done', queuePosition: null }))).toBeNull();
  });

  it('a removed/cancelled queued task never reports a position, even if the field lingered', () => {
    /* The registry always clears `queuePosition` once a task leaves `queued`
       (see `@shared/types/work.ts`), but the view layer must not trust that
       invariant blindly — it re-derives "waiting only" from `state` itself. */
    const cancelled = task({ state: 'cancelled', queuePosition: 1 });

    expect(taskQueuePosition(cancelled)).toBeNull();
  });

  it('measures a finished task from when it started running', () => {
    const finished = task({
      state: 'done',
      queuedAt: '2026-09-07T10:00:00.000Z',
      startedAt: '2026-09-07T10:00:05.000Z',
      finishedAt: '2026-09-07T10:00:15.000Z',
    });

    expect(taskDuration(finished)).toBe(10_000);
  });

  it('falls back to queuedAt when a task was cancelled before it ever started', () => {
    const neverStarted = task({
      state: 'cancelled',
      queuedAt: '2026-09-07T10:00:00.000Z',
      startedAt: null,
      finishedAt: '2026-09-07T10:00:03.000Z',
    });

    expect(taskDuration(neverStarted)).toBe(3_000);
  });

  it('reports no duration for a task that has not finished', () => {
    expect(taskDuration(task({ state: 'running', finishedAt: null }))).toBeNull();
  });
});

describe('groupTasks', () => {
  it('groups into running / waiting / finished, in that fixed order, omitting empty groups', () => {
    const tasks = [
      task({ id: 'done-1', state: 'done' }),
      task({ id: 'running-1', state: 'running' }),
      task({ id: 'queued-1', state: 'queued' }),
    ];

    const groups = groupTasks(tasks);

    expect(groups.map((group) => group.kind)).toEqual(['running', 'waiting', 'finished']);
    expect(groups.find((group) => group.kind === 'running')?.tasks.map((t) => t.id)).toEqual([
      'running-1',
    ]);
    expect(groups.find((group) => group.kind === 'waiting')?.tasks.map((t) => t.id)).toEqual([
      'queued-1',
    ]);
    expect(groups.find((group) => group.kind === 'finished')?.tasks.map((t) => t.id)).toEqual([
      'done-1',
    ]);
  });

  it('omits a group entirely when nothing belongs to it', () => {
    const groups = groupTasks([task({ state: 'running' })]);

    expect(groups).toEqual([{ kind: 'running', tasks: [expect.any(Object)] }]);
  });

  it('produces nothing for an empty queue', () => {
    expect(groupTasks([])).toEqual([]);
  });
});

describe('maintenanceTaskRow', () => {
  it('is null while no maintenance run is going', () => {
    expect(maintenanceTaskRow(null, t)).toBeNull();
  });

  it('shapes a running maintenance snapshot as a WorkTask-like row', () => {
    const row = maintenanceTaskRow(progress({ percent: 40 }), t);

    expect(row).toMatchObject({ kind: 'gardener', state: 'running', progress: 0.4 });
  });

  /* 072 review, finding 1: the row's label must be the translated kind name
     (what `RunStrip` shows), never the raw `GardenerFindingKind` id. */
  it('translates the check kind instead of leaking the raw id', () => {
    const row = maintenanceTaskRow(progress({ check: 'orphan' }), t);

    expect(row?.subject.label).toBe(t('garden.run.check', { check: t('garden.kind.orphan') }));
    expect(row?.subject.label).not.toContain('orphan');
  });

  it('translates the audit and loose-ends stages the same way RunStrip does', () => {
    const audit = maintenanceTaskRow(progress({ stage: 'audit', check: null }), t);
    const looseEnds = maintenanceTaskRow(progress({ stage: 'loose-ends', check: null }), t);

    expect(audit?.subject.label).toBe(t('garden.run.audit'));
    expect(looseEnds?.subject.label).toBe(t('garden.run.looseEnds'));
  });
});

describe('buildTasksView', () => {
  it('folds the maintenance row into the running group alongside real running tasks', () => {
    const tasks = [task({ id: 'ingest-1', state: 'running' })];

    const groups = buildTasksView(tasks, progress(), t);

    const running = groups.find((group) => group.kind === 'running');
    expect(running?.tasks.map((entry) => entry.id)).toEqual(['gardener-run', 'ingest-1']);
  });

  it('has no maintenance row when no gardener run is going', () => {
    const groups = buildTasksView([task({ state: 'running' })], null, t);

    expect(groups.find((group) => group.kind === 'running')?.tasks).toHaveLength(1);
  });
});
