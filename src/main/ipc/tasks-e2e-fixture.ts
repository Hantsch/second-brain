/* Env-gated synthetic task set for the e2e suite (072, D5).
 *
 * AC5 ("a waiting task removed before it starts never runs") and AC6 ("a
 * failed task can be retried and the failure stays") have no real producer
 * yet in this milestone — condense, close-day, and ingest arrive in 073/074.
 * Without one, the e2e suite has no way to drive `tasks:cancel`/`remove`/
 * `retry` against a real `running`, `queued`, or `failed` task through the
 * actual IPC surface, only against a mock.
 *
 * `SB_E2E_TASKS_FIXTURE` mirrors `SB_E2E_STAGE_DELAY_MS`'s seam shape
 * (`ipc/gardener-run.ts`): a single env var, read with a guard that never
 * throws, unset means zero behaviour change and nothing enqueued — no
 * side-effecting import, no task, nothing a real user session would ever
 * see. Set (to `'1'`) it enqueues real `WorkTask`s onto the real
 * `getWorkQueue(services)`, so stop/remove/retry from the screen exercise
 * `WorkRegistry` exactly as a real producer would.
 */

import { getWorkQueue } from '../work-queue';
import type { Services } from '../services';

const ENV_VAR = 'SB_E2E_TASKS_FIXTURE';

/* How long the "running" task's own safety net waits before giving up on its
   own, in case a stray process outlives a crashed test run — never meant to
   fire during a real test: the suite's own timeout is far shorter than this,
   and every test that cares about this task cancels or ignores it long
   before this could ever elapse. */
const RUNNING_BACKSTOP_MS = 10 * 60_000;

/**
 * A runner that only ever ends when its signal fires — there is no
 * "finished on its own" for this task, by design: the point of the "running"
 * row is that it stays running for as long as the e2e spec needs it to, and
 * a real cancel is exactly what is supposed to end it, not a race against
 * how long a fixed delay happened to be.
 */
function foreverUntilCancelled(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const backstop = setTimeout(resolve, RUNNING_BACKSTOP_MS);
    signal.addEventListener('abort', () => {
      clearTimeout(backstop);
      resolve();
    });
  });
}

/**
 * How long the failing task sits `running` before it throws. `WorkRegistry`
 * flips a task to `running` synchronously, before its runner's first `await`
 * (`registry.ts`'s `start`) — an immediate throw would still pass through
 * that state, but only for a single microtask, far too short a window for an
 * e2e spec's IPC round trip and React re-render to reliably observe before
 * it settles to `failed`. This delay is the difference between "the retried
 * task really was seen running/queued" and a coin flip on CI timing.
 * Exported so `tasks-fixture-env.test.ts` can wait past it deterministically.
 */
export const FAILURE_DELAY_MS = 400;

/**
 * Fails for real, on purpose, after a short and observable delay — so the
 * registry's own `describeFailure` path (`core/work/registry.ts`'s `settle`)
 * produces the failed record, rather than this module hand-rolling one.
 */
async function failsAfterDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
  throw new Error('Synthetic task D was built to fail.');
}

/**
 * Enqueues the fixture's task set when `SB_E2E_TASKS_FIXTURE` is set;
 * otherwise does nothing — not even read the queue.
 *
 * The set (four tasks, `ingest` kind — display-only for this fixture, no
 * ingest actually happens):
 *  - "Synthetic task A" — `model` lane, runs until cancelled. The one
 *    "running" row.
 *  - "Synthetic task B" and "Synthetic task C" — `model` lane, enqueued
 *    right after A. The lane's capacity of 1 (`WorkRegistry`'s default)
 *    queues them behind A on its own; nothing here fakes a queue position.
 *  - "Synthetic task D" — `free` lane, so it never waits behind A/B/C, and
 *    throws after `FAILURE_DELAY_MS`. The one "failed" row — and, once
 *    retried, the new attempt this fixture proves AC6 with.
 */
export function runTasksFixture(services: Services): void {
  if (process.env[ENV_VAR] !== '1') return;
  const queue = getWorkQueue(services);
  queue.enqueue(
    { kind: 'ingest', lane: 'model', subject: { label: 'Synthetic task A', ref: null } },
    foreverUntilCancelled,
  );
  queue.enqueue(
    { kind: 'ingest', lane: 'model', subject: { label: 'Synthetic task B', ref: null } },
    foreverUntilCancelled,
  );
  queue.enqueue(
    { kind: 'ingest', lane: 'model', subject: { label: 'Synthetic task C', ref: null } },
    foreverUntilCancelled,
  );
  queue.enqueue(
    { kind: 'ingest', lane: 'free', subject: { label: 'Synthetic task D', ref: null } },
    failsAfterDelay,
  );
}
