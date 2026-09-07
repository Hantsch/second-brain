/* 074 D1: the `import` lane (its own capacity, independent of `model`/`free`)
   and the `interview-plan` kind riding the existing `free` lane with no
   special-casing, plus `detail` — a kind-specific snapshot an enqueued task
   can carry from the start. */

import { describe, expect, it, vi } from 'vitest';
import { WorkRegistry } from '@core/work/registry';
import type { IngestJob, WorkTaskSubject } from '@shared/types';

function subject(label: string): WorkTaskSubject {
  return { label, ref: null };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function ingestJob(overrides: Partial<IngestJob> = {}): IngestJob {
  return {
    id: 'ingest-1',
    kind: 'url',
    input: 'https://example.com/article',
    label: 'Example article',
    module: null,
    stage: 'fetching',
    progress: 0.2,
    message: null,
    error: null,
    startedAt: '2026-08-10T10:00:00.000Z',
    finishedAt: null,
    rawPath: null,
    touchedPages: [],
    ...overrides,
  };
}

describe('WorkRegistry lanes', () => {
  it('runs two import-lane tasks immediately up to capacity 2, queues a third', async () => {
    const registry = new WorkRegistry({ laneCapacity: { model: 1, import: 2 } });
    const gateA = deferred();
    const gateB = deferred();

    const taskA = registry.enqueue(
      { kind: 'ingest', lane: 'import', subject: subject('a') },
      async () => {
        await gateA.promise;
      },
    );
    const taskB = registry.enqueue(
      { kind: 'ingest', lane: 'import', subject: subject('b') },
      async () => {
        await gateB.promise;
      },
    );
    const taskC = registry.enqueue(
      { kind: 'ingest', lane: 'import', subject: subject('c') },
      async () => {},
    );

    expect(taskA.state).toBe('running');
    expect(taskB.state).toBe('running');
    expect(taskC.state).toBe('queued');
    expect(taskC.queuePosition).toBe(1);

    gateA.resolve();
    gateB.resolve();
    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === taskC.id)?.state).toBe('done'),
    );
  });

  it('never waits behind the model lane, and vice versa', async () => {
    const registry = new WorkRegistry({ laneCapacity: { model: 1, import: 2 } });
    const gateModel = deferred();

    const modelTask = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('model work') },
      async () => {
        await gateModel.promise;
      },
    );
    const importTask = registry.enqueue(
      { kind: 'ingest', lane: 'import', subject: subject('import work') },
      async () => {},
    );

    expect(modelTask.state).toBe('running');
    expect(importTask.state).toBe('running');

    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === importTask.id)?.state).toBe('done'),
    );
    // The import task finished without the model task ever yielding its lane.
    expect(registry.list().find((entry) => entry.id === modelTask.id)?.state).toBe('running');

    const secondModelTask = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('second model work') },
      async () => {},
    );
    // A queued model task is unaffected by however many import tasks ran or finished.
    expect(secondModelTask.state).toBe('queued');

    gateModel.resolve();
    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === secondModelTask.id)?.state).toBe('done'),
    );
  });

  it('starts an interview-plan task on the free lane immediately, even while model is busy', async () => {
    const registry = new WorkRegistry();
    const gateModel = deferred();

    const modelTask = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('model work') },
      async () => {
        await gateModel.promise;
      },
    );
    const planTask = registry.enqueue(
      { kind: 'interview-plan', lane: 'free', subject: subject('interview plan') },
      async () => {},
    );

    expect(modelTask.state).toBe('running');
    expect(planTask.state).toBe('running');

    await vi.waitFor(() =>
      expect(registry.list().find((entry) => entry.id === planTask.id)?.state).toBe('done'),
    );
    gateModel.resolve();
  });

  it('carries the detail an enqueued task was given, and defaults to null otherwise', () => {
    const registry = new WorkRegistry();
    const job = ingestJob({ id: 'ingest-42', label: 'Some source' });

    const withDetail = registry.enqueue(
      { kind: 'ingest', lane: 'import', subject: subject('with detail'), detail: job },
      async () => {},
    );
    const withoutDetail = registry.enqueue(
      { kind: 'ingest', lane: 'import', subject: subject('without detail') },
      async () => {},
    );

    expect(registry.list().find((entry) => entry.id === withDetail.id)?.detail).toEqual(job);
    expect(registry.list().find((entry) => entry.id === withoutDetail.id)?.detail).toBeNull();
  });
});
