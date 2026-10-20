/* Cancelling, failing, and shutting down — the three ways work ends that are not
   "it finished". What they have in common is the lane: whichever way a task ends,
   the task behind it has to get its turn, exactly once. The last test is the race
   `gardener-run-state.ts` guards in `publish`: a runner that was cancelled
   mid-await keeps going, resolves later, and must not overwrite what the cancel
   already recorded — nor hand out a lane slot a successor is already holding. */

import { describe, expect, it, vi } from 'vitest';
import { WorkRegistry } from '@core/work/registry';
import type { WorkTask, WorkTaskSubject } from '@shared/types';

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

/** A cooperative runner: rejects as soon as its signal fires, like a real one. */
function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise<void>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
}

const flush = async (): Promise<void> => {
  for (let round = 0; round < 8; round += 1) await Promise.resolve();
};

/** A clock that never returns the same stamp twice — a re-stamp is then visible. */
function tickingClock(): () => Date {
  let tick = 0;
  return () => {
    tick += 1;
    return new Date(Date.UTC(2026, 7, 10, 10, 0, tick));
  };
}

function find(registry: WorkRegistry, id: string): WorkTask {
  const task = registry.list().find((entry) => entry.id === id);
  if (task === undefined) throw new Error(`task ${id} is not listed`);
  return task;
}

describe('WorkRegistry cancellation', () => {
  it('cancels a running task and lets the next queued task in the lane start', async () => {
    const registry = new WorkRegistry();
    const handed: AbortSignal[] = [];

    const running = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('condense') },
      async (signal) => {
        handed.push(signal);
        await untilAborted(signal);
      },
    );
    const queued = registry.enqueue(
      { kind: 'gardener', lane: 'model', subject: subject('gardener') },
      async () => {},
    );
    expect(find(registry, queued.id).state).toBe('queued');

    expect(registry.cancel(running.id)).toBe(true);

    expect(handed[0]?.aborted).toBe(true);
    expect(find(registry, running.id).state).toBe('cancelled');
    // The lane is free the moment the cancel is recorded, not once the runner unwinds.
    expect(find(registry, queued.id).state).toBe('running');

    await vi.waitFor(() => expect(find(registry, queued.id).state).toBe('done'));
    // The runner's own abort rejection does not turn the cancel into a failure.
    expect(find(registry, running.id).state).toBe('cancelled');
  });

  it('records a throwing runner as failed with its reason and frees the lane', async () => {
    const registry = new WorkRegistry();

    const failing = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('condense') },
      async () => {
        throw new Error('The model refused the request.');
      },
    );
    const behind = registry.enqueue(
      { kind: 'gardener', lane: 'model', subject: subject('gardener') },
      async () => {},
    );

    await vi.waitFor(() => expect(find(registry, failing.id).state).toBe('failed'));
    expect(find(registry, failing.id)).toMatchObject({
      error: 'unknown',
      message: 'The model refused the request.',
    });

    await vi.waitFor(() => expect(find(registry, behind.id).state).toBe('done'));
  });

  it('never starts the runner of a task cancelled while it was still queued', async () => {
    const registry = new WorkRegistry();
    const gate = deferred();
    const neverRun = vi.fn(async () => {});

    const running = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('condense') },
      async () => {
        await gate.promise;
      },
    );
    const queued = registry.enqueue(
      { kind: 'gardener', lane: 'model', subject: subject('gardener') },
      neverRun,
    );

    expect(registry.cancel(queued.id)).toBe(true);
    expect(find(registry, queued.id)).toMatchObject({ state: 'cancelled', queuePosition: null });

    gate.resolve();
    await vi.waitFor(() => expect(find(registry, running.id).state).toBe('done'));
    await flush();
    expect(neverRun).not.toHaveBeenCalled();
    expect(find(registry, queued.id).state).toBe('cancelled');
  });

  it('leaves nothing running or queued after cancelAll on shutdown', async () => {
    const registry = new WorkRegistry();
    const neverRun = vi.fn(async () => {});

    // A runner that ignores its signal entirely — shutdown must not wait for it.
    const stubborn = registry.enqueue(
      { kind: 'ingest', lane: 'free', subject: subject('ingest') },
      async () => new Promise<void>(() => {}),
    );
    const cooperative = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('condense') },
      async (signal) => {
        await untilAborted(signal);
      },
    );
    const waiting = registry.enqueue(
      { kind: 'gardener', lane: 'model', subject: subject('gardener') },
      neverRun,
    );

    registry.cancelAll('shutdown');

    const states = registry.list().map((entry) => entry.state);
    expect(states).toEqual(['cancelled', 'cancelled', 'cancelled']);
    expect(neverRun).not.toHaveBeenCalled();
    expect(find(registry, stubborn.id).message).toBe('Cancelled: the app is shutting down.');

    await flush();
    // The cooperative runner's abort rejection lands afterwards and changes nothing.
    expect(find(registry, cooperative.id).state).toBe('cancelled');
    expect(find(registry, waiting.id).state).toBe('cancelled');
    expect(registry.list().map((entry) => entry.state)).toEqual([
      'cancelled',
      'cancelled',
      'cancelled',
    ]);
  });

  it('ignores a late settle from a cancelled runner and does not free the lane twice', async () => {
    const registry = new WorkRegistry({ now: tickingClock() });
    const late = deferred();
    const successorGate = deferred();

    const cancelled = registry.enqueue(
      { kind: 'condense', lane: 'model', subject: subject('condense') },
      async () => {
        // Aborted mid-await, but keeps going and resolves normally much later.
        await late.promise;
      },
    );
    const successor = registry.enqueue(
      { kind: 'gardener', lane: 'model', subject: subject('gardener') },
      async () => {
        await successorGate.promise;
      },
    );

    registry.cancel(cancelled.id);
    expect(find(registry, successor.id).state).toBe('running');
    const recorded = find(registry, cancelled.id);
    expect(recorded.state).toBe('cancelled');

    const third = registry.enqueue(
      { kind: 'ingest', lane: 'model', subject: subject('third') },
      async () => {},
    );
    expect(find(registry, third.id).state).toBe('queued');

    late.resolve();
    await flush();

    // The stale settle overwrites neither the state nor the moment it was recorded.
    expect(find(registry, cancelled.id)).toMatchObject({
      state: 'cancelled',
      finishedAt: recorded.finishedAt,
      error: null,
    });
    // And it does not hand the lane out a second time: the successor still holds it.
    expect(find(registry, successor.id).state).toBe('running');
    expect(find(registry, third.id)).toMatchObject({ state: 'queued', queuePosition: 1 });
    expect(registry.list()).toHaveLength(3);

    successorGate.resolve();
    await vi.waitFor(() => expect(find(registry, third.id).state).toBe('done'));
  });
});
