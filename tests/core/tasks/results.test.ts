/* The result store holds a finished task's payload keyed by id, separate
   from the task record itself: it must be readable by id and by kind+subject,
   bounded so history doesn't grow forever, and it must let go of the payload
   once a result is marked accepted or rejected without forgetting that the
   mark happened. */

import { describe, expect, it } from 'vitest';
import { TaskResultStore } from '@core/tasks/results';
import type { TaskResult } from '@shared/types';

function condenseResult(path: string): TaskResult {
  return {
    kind: 'condense',
    proposal: {
      unit: 'project',
      slug: 'nyota-auth0-migration',
      path,
      baseHash: null,
      before: '',
      after: 'condensed content',
      sources: [path],
    },
  };
}

describe('TaskResultStore', () => {
  it('makes a put result readable via get(id) and via bySubject(kind, ref)', () => {
    const store = new TaskResultStore();
    const result = condenseResult('projects/work/nyota-auth0-migration/project.md');

    store.put('task-1', result, { ref: 'projects/work/nyota-auth0-migration/project.md' });

    expect(store.get('task-1')).toEqual(result);
    expect(store.bySubject('condense', 'projects/work/nyota-auth0-migration/project.md')).toEqual(
      result,
    );
  });

  it('returns null for an unknown id or subject', () => {
    const store = new TaskResultStore();

    expect(store.get('missing')).toBeNull();
    expect(store.bySubject('condense', 'missing')).toBeNull();
  });

  it('evicts the oldest entry first once the cap is exceeded', () => {
    const store = new TaskResultStore();
    const CAP = 50;

    for (let index = 0; index <= CAP; index += 1) {
      store.put(`task-${index}`, condenseResult(`projects/work/p${index}/project.md`), {
        ref: `p${index}`,
      });
    }

    // The very first id put is gone...
    expect(store.get('task-0')).toBeNull();
    // ...but the newest CAP entries are all still there.
    for (let index = 1; index <= CAP; index += 1) {
      expect(store.get(`task-${index}`)).not.toBeNull();
    }
  });

  it('clear() empties everything', () => {
    const store = new TaskResultStore();
    store.put('task-1', condenseResult('projects/work/x/project.md'), { ref: 'x' });

    store.clear();

    expect(store.get('task-1')).toBeNull();
    expect(store.bySubject('condense', 'x')).toBeNull();
  });

  it('mark(id, "accepted") keeps the record as marked but drops the payload', () => {
    const store = new TaskResultStore();
    store.put('task-1', condenseResult('projects/work/x/project.md'), { ref: 'x' });

    store.mark('task-1', 'accepted');

    expect(store.status('task-1')).toBe('accepted');
    expect(store.get('task-1')).toBeNull();
    expect(store.bySubject('condense', 'x')).toBeNull();
  });

  /* Accept/reject only ever know which unit the user decided about, never the
     id of the task that once proposed it (073, D3) — so the mark has to be
     reachable by kind + subject ref as well. */
  it('markBySubject marks the entry bySubject would have returned', () => {
    const store = new TaskResultStore();
    store.put('task-1', condenseResult('projects/work/x/project.md'), { ref: 'area:x' });

    store.markBySubject('condense', 'area:x', 'rejected');

    expect(store.status('task-1')).toBe('rejected');
    expect(store.get('task-1')).toBeNull();
    expect(store.bySubject('condense', 'area:x')).toBeNull();
  });

  it('markBySubject marks the most recent entry for a subject, not an older one', () => {
    const store = new TaskResultStore();
    store.put('task-1', condenseResult('projects/work/x/project.md'), { ref: 'area:x' });
    store.put('task-2', condenseResult('projects/work/x/project.md'), { ref: 'area:x' });

    store.markBySubject('condense', 'area:x', 'accepted');

    expect(store.status('task-2')).toBe('accepted');
    expect(store.status('task-1')).toBeNull();
  });

  it('markBySubject on a subject with nothing stored is a no-op, not a throw', () => {
    const store = new TaskResultStore();
    store.put('task-1', condenseResult('projects/work/x/project.md'), { ref: 'area:x' });

    expect(() => store.markBySubject('condense', 'area:y', 'accepted')).not.toThrow();
    expect(() => store.markBySubject('journal-close', 'area:x', 'accepted')).not.toThrow();

    // Neither near miss touched the entry that is actually there.
    expect(store.status('task-1')).toBeNull();
    expect(store.get('task-1')).not.toBeNull();
  });

  it('status(id) is null for a result that was never marked', () => {
    const store = new TaskResultStore();
    store.put('task-1', condenseResult('projects/work/x/project.md'), { ref: 'x' });

    expect(store.status('task-1')).toBeNull();
  });
});
