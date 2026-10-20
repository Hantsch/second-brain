/* Story 073, D7: every finished kind maps to its address.
 *
 * `taskResultRoute` is a pure function, deliberately with no IPC call of its
 * own — the destination screen re-derives the actual proposal itself once we
 * land there (`useTaskForSubject`, D5), so deciding *where* to go needs
 * nothing more than the `WorkTask` the tasks screen already holds locally. */

import { describe, expect, it } from 'vitest';
import type { WorkTask } from '@shared/types';
import { taskResultRoute } from '@renderer/lib/task-result-route';

function task(patch: Partial<WorkTask> & { kind: WorkTask['kind'] }): WorkTask {
  return {
    id: 'task-1',
    lane: 'model',
    subject: { label: 'label', ref: null },
    state: 'done',
    progress: 1,
    message: null,
    error: null,
    queuePosition: null,
    queuedAt: '2026-08-10T14:32:00+02:00',
    startedAt: '2026-08-10T14:32:00+02:00',
    finishedAt: '2026-08-10T14:33:00+02:00',
    hasResult: true,
    retryable: true,
    ...patch,
    detail: patch.detail ?? null,
  };
}

describe('taskResultRoute — condense', () => {
  it('routes an area condensation to the notes screen, condensed tab', () => {
    expect(
      taskResultRoute(task({ kind: 'condense', subject: { label: 'l', ref: 'area:gesundheit' } })),
    ).toBe('/notes?a=gesundheit&tab=condensed');
  });

  it('routes a project condensation to the projects screen, knowledge tab', () => {
    expect(
      taskResultRoute(
        task({ kind: 'condense', subject: { label: 'l', ref: 'project:nyota-auth0-migration' } }),
      ),
    ).toBe('/projects?p=nyota-auth0-migration&tab=knowledge');
  });

  it('escapes a slug containing a space and an ampersand', () => {
    expect(
      taskResultRoute(
        task({ kind: 'condense', subject: { label: 'l', ref: 'area:health & fitness' } }),
      ),
    ).toBe(`/notes?a=${encodeURIComponent('health & fitness')}&tab=condensed`);
  });

  it('is null when the ref names neither area nor project', () => {
    expect(
      taskResultRoute(task({ kind: 'condense', subject: { label: 'l', ref: 'module:foo' } })),
    ).toBeNull();
  });

  it('is null when the ref carries no slug at all', () => {
    expect(
      taskResultRoute(task({ kind: 'condense', subject: { label: 'l', ref: 'area:' } })),
    ).toBeNull();
  });
});

describe('taskResultRoute — close-day', () => {
  it('routes a finished day close to the journal on that date', () => {
    expect(
      taskResultRoute(
        task({ kind: 'close-day', subject: { label: '2026-08-10', ref: '2026-08-10' } }),
      ),
    ).toBe('/journal?d=2026-08-10');
  });

  it('escapes a ref with special characters the same way', () => {
    expect(
      taskResultRoute(task({ kind: 'close-day', subject: { label: 'l', ref: '2026-08-10 & co' } })),
    ).toBe(`/journal?d=${encodeURIComponent('2026-08-10 & co')}`);
  });
});

describe('taskResultRoute — no result yet', () => {
  it('is null regardless of kind when the task carries no result', () => {
    for (const kind of ['condense', 'close-day', 'gardener', 'ingest'] as const) {
      expect(
        taskResultRoute(task({ kind, hasResult: false, subject: { label: 'l', ref: 'area:x' } })),
      ).toBeNull();
    }
  });
});

describe('taskResultRoute — kinds without a result route yet', () => {
  it("is null for gardener and ingest even when marked as having a result (074's concern)", () => {
    expect(taskResultRoute(task({ kind: 'gardener' }))).toBeNull();
    expect(taskResultRoute(task({ kind: 'ingest' }))).toBeNull();
  });
});
