/* The `SB_E2E_TASKS_FIXTURE` seam (072, D5): off means nothing enqueued, not
 * even a queue lookup with a side effect; on means the exact four-task set
 * `tasks-e2e-fixture.ts` documents appears on the real `WorkRegistry`.
 *
 * Mirrors `gardener-run-delay.test.ts`'s shape for an env-gated seam: stub
 * the variable, reset the module graph so the guard — and everything it
 * imports, `work-queue.ts`'s module-scoped singleton included — is read
 * fresh rather than reused from a previous case.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Services } from '../../src/main/services';
import type { WorkTask } from '../../src/shared/types';

const ENV_VAR = 'SB_E2E_TASKS_FIXTURE';

/* The registry only ever calls `sendEvent` — the same minimal fake
   `tasks-ipc.test.ts`/`work-queue-ipc.test.ts` use, so this test needs no
   `vi.mock('electron', ...)` either. */
function fakeServices(): Services {
  return { sendEvent: vi.fn() } as unknown as Services;
}

/**
 * `tasks-e2e-fixture.ts` and `work-queue.ts` on a module graph loaded *after*
 * `value` was put into the environment — the same reason
 * `gardener-run-delay.test.ts` re-imports its whole graph per case instead of
 * reusing one: `getWorkQueue`'s singleton belongs to *this* module instance,
 * and mixing it with one resolved before `vi.resetModules()` would silently
 * test two different queues.
 */
async function loadFixture(value: string | undefined) {
  vi.stubEnv(ENV_VAR, value);
  vi.resetModules();
  const { runTasksFixture, FAILURE_DELAY_MS } =
    await import('../../src/main/ipc/tasks-e2e-fixture');
  const { getWorkQueue } = await import('../../src/main/work-queue');
  return { runTasksFixture, getWorkQueue, FAILURE_DELAY_MS };
}

describe('the tasks screen synthetic fixture seam (072, D5)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('off without the env var — nothing enqueued', async () => {
    const { runTasksFixture, getWorkQueue } = await loadFixture(undefined);
    const services = fakeServices();

    runTasksFixture(services);

    expect(getWorkQueue(services).list()).toEqual([]);
  });

  it('off for anything other than exactly "1"', async () => {
    for (const value of ['', '0', 'true', 'yes']) {
      const { runTasksFixture, getWorkQueue } = await loadFixture(value);
      const services = fakeServices();
      runTasksFixture(services);
      expect(getWorkQueue(services).list()).toEqual([]);
    }
  });

  it('on with the env var — one running, two waiting, one failed', async () => {
    const { runTasksFixture, getWorkQueue, FAILURE_DELAY_MS } = await loadFixture('1');
    const services = fakeServices();

    runTasksFixture(services);
    // The model lane's first task reaches `running` on the spot; the
    // free-lane task's real setTimeout throw needs its actual delay to pass
    // before it settles to `failed` — a fake clock would need the same whole
    // module graph re-imported under it, which is more machinery than this
    // seam's own guard logic warrants.
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS + 100));

    const tasks = getWorkQueue(services).list();
    expect(tasks).toHaveLength(4);

    const byLabel = (label: string): WorkTask | undefined =>
      tasks.find((task) => task.subject.label === label);

    expect(byLabel('Synthetic task A')).toMatchObject({ lane: 'model', state: 'running' });
    expect(byLabel('Synthetic task B')).toMatchObject({ lane: 'model', state: 'queued' });
    expect(byLabel('Synthetic task C')).toMatchObject({ lane: 'model', state: 'queued' });
    expect(byLabel('Synthetic task D')).toMatchObject({ lane: 'free', state: 'failed' });

    // Real failure, not a hand-rolled record: the registry's own
    // `describeFailure` path produced the error code and message.
    expect(byLabel('Synthetic task D')?.error).not.toBeNull();
    expect(byLabel('Synthetic task D')?.message).toBeTruthy();

    /* Task A's runner (`foreverUntilCancelled`) only ever resolves on cancel
       or its ten-minute backstop timer — left alone, that's a `setTimeout`
       still pending against the real clock long after this test itself has
       finished (072 review, finding 10). `cancelAll` fires the same abort
       signal a real cancel would, which clears it via the runner's own
       listener — the same clean shutdown `cancelAll`'s other callers rely on. */
    getWorkQueue(services).cancelAll('shutdown');
  });
});
