/* The work queue's IPC wiring (071, D3): `work-queue.ts` threads the
 * registry's `onChange` into `event:work-tasks`, and `work:list` answers with
 * whatever that event last carried — a late joiner must see the same thing a
 * listener already watching would. Mirrors the module-singleton test idiom of
 * `gardener-run-state.test.ts`: no Electron, no vault, a fake `sendEvent` spy
 * standing in for `Services`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWorkQueue, resetWorkQueue } from '../../src/main/work-queue';
import { workHandlers } from '../../src/main/ipc/work';
import type { Services } from '../../src/main/services';
import type { WorkTask } from '../../src/shared/types';

/* `Services` itself pulls in Electron transitively; the registry only ever
   calls `sendEvent`, so a minimal fake is enough and keeps this test from
   needing `vi.mock('electron', ...)` at all. */
function fakeServices(): { services: Services; sendEvent: ReturnType<typeof vi.fn> } {
  const sendEvent = vi.fn();
  return { services: { sendEvent } as unknown as Services, sendEvent };
}

/* Flushes the microtasks a queued task's start/settle chain runs on — the
   registry's `pump()` awaits the runner, so state changes past "queued"
   land a tick or two after `enqueue` returns. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** A runner that only settles once the test calls `resolve()` — lets a test
 *  hold a task in `running` on purpose, so a second task stays `queued` behind it. */
function gate(): { run: () => Promise<void>; resolve: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((res) => {
    release = res;
  });
  return { run: () => promise, resolve: release };
}

describe('work queue IPC (071, D3)', () => {
  afterEach(() => {
    resetWorkQueue();
  });

  it('emits event:work-tasks once per state change, with the full list, not a delta (AC4)', async () => {
    const { services, sendEvent } = fakeServices();
    const queue = getWorkQueue(services);

    queue.enqueue(
      { kind: 'condense', lane: 'free', subject: { label: 'Daily note', ref: null } },
      async () => {
        /* resolves immediately: the runner does no real work */
      },
    );
    await flush();

    expect(sendEvent).toHaveBeenCalled();
    for (const call of sendEvent.mock.calls) {
      expect(call[0]).toBe('event:work-tasks');
      expect(Array.isArray(call[1])).toBe(true);
    }

    /* The task shows up, in its current (by-then-terminal) state, in the last
       emitted list — every emit carries the whole queue, never a partial patch. */
    const lastList = sendEvent.mock.calls.at(-1)?.[1] as WorkTask[];
    expect(lastList).toHaveLength(1);
    expect(lastList[0]).toMatchObject({ kind: 'condense', lane: 'free', state: 'done' });
  });

  it('emits the full list, exactly once per transition, across two tasks sharing a lane (AC4)', async () => {
    const { services, sendEvent } = fakeServices();
    const queue = getWorkQueue(services);

    const first = gate();
    const firstTask = queue.enqueue(
      { kind: 'condense', lane: 'model', subject: { label: 'Task A', ref: null } },
      first.run,
    );
    const secondTask = queue.enqueue(
      { kind: 'condense', lane: 'model', subject: { label: 'Task B', ref: null } },
      async () => {
        /* resolves immediately once it gets the model lane's slot */
      },
    );
    await flush();

    // Transitions so far: A queued -> A running -> B queued. Nothing has let
    // B start yet (capacity 1, A still holds the model lane).
    expect(sendEvent).toHaveBeenCalledTimes(3);

    first.resolve();
    await flush();
    await flush();

    // A finishing frees the lane, B starts, B (a no-op runner) then finishes
    // too: three more transitions, six calls total.
    expect(sendEvent).toHaveBeenCalledTimes(6);

    const calls = sendEvent.mock.calls.map((call) => call[1] as WorkTask[]);
    const byId = (list: WorkTask[], id: string): WorkTask | undefined =>
      list.find((task) => task.id === id);

    // The call where A finishes must still carry B in the array — proof this
    // is the full list every time, not a delta containing only what changed.
    const aFinishedCall = calls.find(
      (list) =>
        byId(list, firstTask.id)?.state === 'done' && byId(list, secondTask.id) !== undefined,
    );
    expect(aFinishedCall).toBeDefined();
    expect(byId(aFinishedCall ?? [], secondTask.id)?.state).toBe('queued');

    // The final call shows both tasks terminal.
    const lastCall = calls.at(-1) ?? [];
    expect(byId(lastCall, firstTask.id)?.state).toBe('done');
    expect(byId(lastCall, secondTask.id)?.state).toBe('done');
  });

  it('work:list answers with a list equal to the last emitted one (late-joiner equality, AC4)', async () => {
    const { services, sendEvent } = fakeServices();
    const queue = getWorkQueue(services);

    queue.enqueue(
      { kind: 'ingest', lane: 'model', subject: { label: 'A video', ref: null } },
      async () => {
        /* resolves immediately */
      },
    );
    await flush();

    const handlers = workHandlers(services);
    const list = await handlers['work:list']?.();

    const lastEmitted = sendEvent.mock.calls.at(-1)?.[1];
    expect(list).toEqual(lastEmitted);
  });

  it('the last emitted list has correct queuePositions, not stale ones, once a queued task starts (AC4)', async () => {
    const { services, sendEvent } = fakeServices();
    const queue = getWorkQueue(services);

    // A runs, B and C queue behind it (positions 1 and 2). When A finishes,
    // B takes the model lane's one slot and C's position must shift to 1 —
    // in the very emit that reports the transition, not merely by the time
    // `work:list` is asked afterwards.
    const gateA = gate();
    const gateB = gate();
    queue.enqueue(
      { kind: 'ingest', lane: 'model', subject: { label: 'Task A', ref: null } },
      gateA.run,
    );
    const taskB = queue.enqueue(
      { kind: 'ingest', lane: 'model', subject: { label: 'Task B', ref: null } },
      gateB.run,
    );
    const taskC = queue.enqueue(
      { kind: 'ingest', lane: 'model', subject: { label: 'Task C', ref: null } },
      async () => {
        /* resolves immediately, once it ever gets to run */
      },
    );
    await flush();

    gateA.resolve();
    await flush();

    const handlers = workHandlers(services);
    const freshList = await handlers['work:list']?.();
    const lastEmitted = sendEvent.mock.calls.at(-1)?.[1] as WorkTask[];

    // A late joiner calling work:list must see exactly what the last event
    // already reported — including C's queuePosition.
    expect(lastEmitted).toEqual(freshList);

    const bInLast = lastEmitted.find((task) => task.id === taskB.id);
    const cInLast = lastEmitted.find((task) => task.id === taskC.id);
    expect(bInLast?.state).toBe('running');
    expect(cInLast?.state).toBe('queued');
    expect(cInLast?.queuePosition).toBe(1);

    gateB.resolve();
    await flush();
    await flush();
  });

  it('a task record names only its declared fields — nothing free-text beyond them (AC8)', async () => {
    const { services } = fakeServices();
    const queue = getWorkQueue(services);

    queue.enqueue(
      {
        kind: 'close-day',
        lane: 'free',
        subject: { label: 'Close 2026-09-07', ref: '2026-09-07' },
      },
      async () => {
        /* resolves immediately */
      },
    );
    await flush();

    const [task] = queue.list();
    expect(task).toBeDefined();
    if (task === undefined) throw new Error('unreachable');
    /* Whatever a log line about a task would print, it can only ever name
       these fields — there is nothing else on the record it could leak. In
       particular no arbitrary vault content: `subject.label`/`subject.ref`
       are the only free-text fields, and both are already what the task was
       enqueued with, not anything read back out of a note. */
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
        /* 073: a boolean saying a result exists elsewhere — never the result
           itself, which is exactly what keeps this list leak-free. */
        'hasResult',
        /* 074 D1: a kind-specific snapshot (e.g. an `IngestJob` for an
           import task) — null here since this task was enqueued without one,
           and the queue never invents one on its own. */
        'detail',
        /* 074 fix-cycle 2: whether the generic retry action can do anything
           useful for this task — true here, this task was enqueued normally. */
        'retryable',
      ].sort(),
    );
    expect(Object.keys(task.subject).sort()).toEqual(['label', 'ref'].sort());
  });
});
