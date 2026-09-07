/* The work queue's three verbs over IPC (072, D2): cancel a running task,
 * remove a queued one, retry a failed one.
 *
 * Everything here goes through the handler map `ipc/tasks.ts` builds, never
 * through `WorkRegistry` directly — a verb wired to the wrong registry method
 * (or to none) has to fail these tests, not pass them because the registry
 * underneath happens to be correct. Same harness as
 * `work-queue-ipc.test.ts`: no Electron, no vault, a fake `sendEvent` spy
 * standing in for `Services`, and the process-wide queue reset between tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWorkQueue, resetWorkQueue } from '../../src/main/work-queue';
import { tasksHandlers } from '../../src/main/ipc/tasks';
import { workHandlers } from '../../src/main/ipc/work';
import type { Services } from '../../src/main/services';
import type { WorkTask } from '../../src/shared/types';

/* `Services` pulls in Electron transitively; the registry only ever calls
   `sendEvent`, so a minimal fake keeps this test off `vi.mock('electron')`. */
function fakeServices(): { services: Services; sendEvent: ReturnType<typeof vi.fn> } {
  const sendEvent = vi.fn();
  return { services: { sendEvent } as unknown as Services, sendEvent };
}

/* Flushes the microtasks a task's start/settle chain runs on — `pump()` awaits
   the runner, so anything past "queued" lands a tick or two later. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** A runner that settles only when the test says so — holds a task in
 *  `running` on purpose, so a second task stays `queued` behind it. */
function gate(): { run: () => Promise<void>; resolve: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((res) => {
    release = res;
  });
  return { run: () => promise, resolve: release };
}

/** Every list `event:work-tasks` carried, oldest first. */
function emitted(sendEvent: ReturnType<typeof vi.fn>): WorkTask[][] {
  return sendEvent.mock.calls.map((call) => call[1] as WorkTask[]);
}

function byId(list: WorkTask[], id: string): WorkTask | undefined {
  return list.find((task) => task.id === id);
}

describe('task actions over IPC (072, D2)', () => {
  afterEach(() => {
    resetWorkQueue();
  });

  it('cancel leaves a cancelled record, not a gap (AC4)', async () => {
    const { services, sendEvent } = fakeServices();
    const queue = getWorkQueue(services);
    const handlers = tasksHandlers(services);

    const held = gate();
    const task = queue.enqueue(
      { kind: 'condense', lane: 'free', subject: { label: 'A long condense', ref: null } },
      held.run,
    );
    await flush();
    expect(queue.list()[0]?.state).toBe('running');

    const cancelled = await handlers['tasks:cancel']?.({ id: task.id });
    expect(cancelled).toBe(true);

    /* The point of the criterion: the task is still *there*, as `cancelled`.
       A stopped task is history the user just watched happen, not a row that
       silently disappears from under the cursor. */
    const listed = (await workHandlers(services)['work:list']?.()) as WorkTask[];
    expect(listed).toHaveLength(1);
    expect(byId(listed, task.id)).toMatchObject({ state: 'cancelled', error: null });
    expect(byId(listed, task.id)?.finishedAt).not.toBeNull();

    // And the same record is what the last emitted event carried.
    expect(byId(emitted(sendEvent).at(-1) ?? [], task.id)?.state).toBe('cancelled');

    // The runner settling late must not overwrite the user's cancel.
    held.resolve();
    await flush();
    expect(queue.list()[0]?.state).toBe('cancelled');
  });

  it('remove takes a queued task out of the lane (AC5)', async () => {
    const { services, sendEvent } = fakeServices();
    const queue = getWorkQueue(services);
    const handlers = tasksHandlers(services);

    /* The `model` lane runs one task at a time, so the second one waits. */
    const first = gate();
    const running = queue.enqueue(
      { kind: 'ingest', lane: 'model', subject: { label: 'Task A', ref: null } },
      first.run,
    );
    let secondRan = false;
    const waiting = queue.enqueue(
      { kind: 'ingest', lane: 'model', subject: { label: 'Task B', ref: null } },
      async () => {
        secondRan = true;
      },
    );
    await flush();
    expect(queue.list().map((task) => task.state)).toEqual(['running', 'queued']);

    const removed = await handlers['tasks:remove']?.({ id: waiting.id });
    expect(removed).toBe(true);

    /* The race this criterion is about: the first task finishing pumps the
       lane. The removed task must not be what the pump picks up. */
    first.resolve();
    await flush();
    await flush();

    expect(byId(queue.list(), running.id)?.state).toBe('done');
    expect(byId(queue.list(), waiting.id)?.state).toBe('cancelled');
    expect(secondRan).toBe(false);
    // Not merely "not running now": it was never `running` in any snapshot.
    for (const list of emitted(sendEvent)) {
      expect(byId(list, waiting.id)?.state).not.toBe('running');
    }
    expect(byId(queue.list(), waiting.id)?.startedAt).toBeNull();
    expect(byId(queue.list(), waiting.id)?.queuePosition).toBeNull();
  });

  it('retry enqueues a new task and keeps the failed record (AC6)', async () => {
    const { services } = fakeServices();
    const queue = getWorkQueue(services);
    const handlers = tasksHandlers(services);

    let attempts = 0;
    const original = queue.enqueue(
      { kind: 'gardener', lane: 'model', subject: { label: 'Maintenance run', ref: 'modules' } },
      async () => {
        attempts += 1;
        throw new Error('the run broke');
      },
    );
    await flush();

    const failed = byId(queue.list(), original.id);
    expect(failed).toMatchObject({ state: 'failed', error: 'unknown' });
    const failedAt = failed?.finishedAt ?? null;
    expect(failedAt).not.toBeNull();

    const retried = (await handlers['tasks:retry']?.({ id: original.id })) as WorkTask | null;
    expect(retried).not.toBeNull();
    if (retried === null) throw new Error('unreachable');

    // A new task, not the old one moved back into the queue.
    expect(retried.id).not.toBe(original.id);
    expect(retried).toMatchObject({
      kind: 'gardener',
      lane: 'model',
      subject: { label: 'Maintenance run', ref: 'modules' },
      error: null,
    });
    expect(['queued', 'running']).toContain(retried.state);

    // The failed record is untouched: same id, same error, same finishedAt.
    const stillFailed = byId(queue.list(), original.id);
    expect(stillFailed).toMatchObject({ state: 'failed', error: 'unknown' });
    expect(stillFailed?.finishedAt).toBe(failedAt);
    expect(queue.list()).toHaveLength(2);

    /* And it is the *same work*: the retry reuses the closure the task was
       enqueued with, so the runner really runs a second time. */
    await flush();
    expect(attempts).toBe(2);
    expect(byId(queue.list(), retried.id)?.state).toBe('failed');
  });

  it('every verb answers honestly for an id the queue does not know (AC4/AC5/AC6)', async () => {
    const { services } = fakeServices();
    getWorkQueue(services);
    const handlers = tasksHandlers(services);

    expect(await handlers['tasks:cancel']?.({ id: 'nope' })).toBe(false);
    expect(await handlers['tasks:remove']?.({ id: 'nope' })).toBe(false);
    expect(await handlers['tasks:retry']?.({ id: 'nope' })).toBeNull();
  });

  it('retry refuses a task that did not fail (AC6)', async () => {
    const { services } = fakeServices();
    const queue = getWorkQueue(services);
    const handlers = tasksHandlers(services);

    const done = queue.enqueue(
      { kind: 'close-day', lane: 'free', subject: { label: 'Close 2026-09-07', ref: null } },
      async () => {
        /* resolves immediately */
      },
    );
    await flush();
    expect(byId(queue.list(), done.id)?.state).toBe('done');

    /* Redoing finished work behind the user's back is not what this verb is
       for — and neither is re-running something already on its way. */
    expect(await handlers['tasks:retry']?.({ id: done.id })).toBeNull();
    expect(queue.list()).toHaveLength(1);
  });
});
