/* Work in flight is one queue: lanes that don't block each other, a queue
   position relative to the lane a task is waiting for, and retention that keeps
   history bounded without ever dropping something still running or waiting. */

import { describe, expect, it, vi } from 'vitest';
import { WorkRegistry } from '@core/work/registry';
import type { WorkTaskSubject } from '@shared/types';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const flush = async (): Promise<void> => {
  for (let round = 0; round < 8; round += 1) await Promise.resolve();
};

function subject(label: string): WorkTaskSubject {
  return { label, ref: null };
}

describe('WorkRegistry', () => {
  it('runs a model task and lists it with kind, subject, state, progress and timestamps', async () => {
    const registry = new WorkRegistry({ now: () => new Date('2026-08-10T10:00:00.000Z') });
    const gate = deferred();

    const task = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('Nyota Auth0 Migration') },
      async () => {
        await gate.promise;
      },
    );

    expect(task.state).toBe('running');
    const listed = registry.list().find((entry) => entry.id === task.id);
    expect(listed).toMatchObject({
      kind: 'condense',
      lane: 'model',
      subject: { label: 'Nyota Auth0 Migration', ref: null },
      state: 'running',
      progress: 0,
    });
    expect(listed?.startedAt).toBe('2026-08-10T10:00:00.000Z');
    expect(listed?.finishedAt).toBeNull();

    gate.resolve();
    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === task.id)?.state).toBe('done'),
    );
    const finished = registry.list().find((entry) => entry.id === task.id);
    expect(finished?.finishedAt).toBe('2026-08-10T10:00:00.000Z');
  });

  it('queues a second model task with its position in the model lane', async () => {
    const registry = new WorkRegistry();
    const gate = deferred();

    const first = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('first') },
      async () => {
        await gate.promise;
      },
    );
    const second = registry.enqueue(
      { kind: 'gardener', lane: 'model', subject: subject('second') },
      async () => {},
    );

    expect(first.state).toBe('running');
    expect(second.state).toBe('queued');
    expect(second.queuePosition).toBe(1);

    gate.resolve();
    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === second.id)?.state).toBe('done'),
    );
  });

  it('runs a free task alongside a running model task, without waiting on it', async () => {
    const registry = new WorkRegistry();
    const gate = deferred();

    const modelTask = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('model work') },
      async () => {
        await gate.promise;
      },
    );
    const freeTask = registry.enqueue(
      { kind: 'ingest', lane: 'free', subject: subject('free work') },
      async () => {},
    );

    expect(modelTask.state).toBe('running');
    expect(freeTask.state).toBe('running');

    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === freeTask.id)?.state).toBe('done'),
    );
    // The free task finished without needing the model task to yield its lane.
    expect(registry.list().find((entry) => entry.id === modelTask.id)?.state).toBe('running');
    gate.resolve();
  });

  it('starts the next queued task in a lane once the running one finishes or fails', async () => {
    const registry = new WorkRegistry();
    const gateA = deferred();
    const gateC = deferred();

    const taskA = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('a') },
      async () => {
        await gateA.promise;
      },
    );
    const taskB = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('b') },
      async () => {
        throw new Error('boom');
      },
    );
    const taskC = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('c') },
      async () => {
        await gateC.promise;
      },
    );

    expect(registry.list().find((entry) => entry.id === taskB.id)?.state).toBe('queued');

    // Finishing releases the lane for the next queued task.
    gateA.resolve();
    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === taskA.id)?.state).toBe('done'),
    );
    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === taskB.id)?.state).toBe('failed'),
    );

    // Failing releases the lane too — the third task now runs.
    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === taskC.id)?.state).toBe('running'),
    );
    gateC.resolve();
    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === taskC.id)?.state).toBe('done'),
    );
  });

  it('keeps only the 50 most recently finished tasks, dropping the oldest first', async () => {
    const registry = new WorkRegistry();
    let firstId = '';

    for (let index = 0; index < 55; index += 1) {
      const task = registry.enqueue(
        { kind: 'ingest', lane: 'free', subject: subject(`t${index}`) },
        async () => {},
      );
      if (index === 0) firstId = task.id;
      await flush();
    }

    const list = registry.list();
    expect(list).toHaveLength(50);
    expect(list.some((entry) => entry.id === firstId)).toBe(false);
  });

  it('has exactly the declared fields on a task record', async () => {
    const registry = new WorkRegistry();
    const task = registry.enqueue(
      { kind: 'ingest', lane: 'free', subject: subject('x') },
      async () => {},
    );

    expect(Object.keys(task).sort()).toEqual(
      [
        'id',
        'kind',
        'lane',
        'subject',
        'state',
        'progress',
        'message',
        'error',
        'queuePosition',
        'queuedAt',
        'startedAt',
        'finishedAt',
        'hasResult',
      ].sort(),
    );
  });

  /* 073: a runner may report that it left a result behind somewhere the task
     record does not carry (`core/tasks/results.ts`). Every runner written
     before that says nothing, and must keep meaning "no result". */
  it('carries hasResult only when the runner reported one', async () => {
    const registry = new WorkRegistry();

    const withResult = registry.enqueue(
      { kind: 'condense', lane: 'free', subject: subject('with') },
      async () => ({ hasResult: true }),
    );
    const withoutResult = registry.enqueue(
      { kind: 'condense', lane: 'free', subject: subject('without') },
      async () => {},
    );

    await vi.waitFor(() => {
      const states = registry.list().map((entry) => entry.state);
      expect(states).toEqual(['done', 'done']);
    });
    const listed = (id: string) => registry.list().find((entry) => entry.id === id);
    expect(listed(withResult.id)?.hasResult).toBe(true);
    expect(listed(withoutResult.id)?.hasResult).toBe(false);
  });

  /* 073 review finding 1: `retry()` reuses the original task's own `run`
     closure for a brand-new `Entry` with a NEW id — so the closure must learn
     which id it is running for from `start()`'s own call, not from a variable
     captured once outside `enqueue()` (that variable would still hold the
     first, now-failed task's id on a retry). This is the runner-level proof:
     a runner that records every id it was called with must see a second,
     DIFFERENT id on the retried run. */
  it("hands a retried run its OWN new task id, not the failed run's", async () => {
    const registry = new WorkRegistry();
    const calledWith: string[] = [];
    let shouldFail = true;

    const first = registry.enqueue(
      { kind: 'condense', lane: 'free', subject: subject('flaky') },
      async (_signal, taskId) => {
        calledWith.push(taskId);
        if (shouldFail) throw new Error('erster Versuch schlägt fehl');
        return { hasResult: true };
      },
    );

    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === first.id)?.state).toBe('failed'),
    );
    expect(calledWith).toEqual([first.id]);

    shouldFail = false;
    const retried = registry.retry(first.id);
    expect(retried).not.toBeNull();
    if (retried === null) throw new Error('unreachable');
    expect(retried.id).not.toBe(first.id);

    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === retried.id)?.state).toBe('done'),
    );

    // The runner was called a second time with the RETRY's own id, never the
    // failed run's — this is exactly what lets a caller key a stored result
    // by the id the runner was actually invoked with.
    expect(calledWith).toEqual([first.id, retried.id]);
  });

  it('a failed runner leaves hasResult false, whatever it was about to report', async () => {
    const registry = new WorkRegistry();

    const task = registry.enqueue(
      { kind: 'condense', lane: 'free', subject: subject('boom') },
      async () => {
        throw new Error('kein Modell');
      },
    );

    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === task.id)?.state).toBe('failed'),
    );
    const failed = registry.list().find((entry) => entry.id === task.id);
    expect(failed?.hasResult).toBe(false);
    expect(failed?.message).toBe('kein Modell');
  });
});
