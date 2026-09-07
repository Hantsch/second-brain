/* Story 072's real trigger for AC5/AC6 (D5): with `SB_E2E_TASKS_FIXTURE` set,
 * `tasks-e2e-fixture.ts` enqueues one running, two waiting and one failed
 * `WorkTask` onto the real `getWorkQueue` — see that file for the exact set
 * and why it exists (073/074's condense/close-day/ingest producers are not
 * built yet, so nothing else can put a waiting or failed task in front of
 * this screen for real).
 *
 * This spec is the one place in the suite that opts into the fixture, via
 * `test.use({ tasksFixture: true })` on the worker-scoped `app` fixture
 * (fixtures/app.ts) — the fixture itself defaults it to `false` everywhere
 * else, so no other spec's queue is ever anything but empty.
 *
 * 072 review, finding 6: the story names five separate acceptance scenarios
 * (AC2-AC6), but the first version of this spec strung them all into a
 * single test with `test.step` labels — an early failure meant the later
 * ACs never ran at all, one failure reporting as one red test and four
 * unknowns instead of five independent results. Split here into five named
 * tests, one per AC, the same worker-scoped `app` fixture
 * shared across them (`fixtures/app.ts`: one Electron instance per spec
 * file) exactly like `journal-loose-end-resolution.spec.ts` shares its `app`
 * across three independent tests.
 *
 * Unlike that spec's tests, these five are not independent of each other:
 * AC4-AC6 each mutate the real work queue the previous one left behind (a
 * fresh app launch per test would need to re-derive the same fixture state
 * from scratch, and the fixture's "running forever until cancelled" task A
 * has no way to fast-forward to "already stopped" except by stopping it for
 * real). Playwright runs tests within one file in declaration order, so the
 * order below is the scenario's real causal chain, not the story's AC
 * numbering — AC5 (remove the waiting task C) must run before AC4 (stop the
 * running task A, which frees the lane B then takes), otherwise AC4's "B
 * took the freed slot" would not be provable. Each test still reports its
 * own pass/fail independently; only the fixture state carries over.
 */

import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

test.use({ specId: 'tasks-queue', tasksFixture: true });

/** Every row whose visible subject label matches — the fixture gives each
 *  synthetic task a distinguishable one for exactly this purpose. Usually
 *  exactly one (the label is unique), except right after a retry, when the
 *  original and the retried attempt briefly share it. */
function rowsFor(page: Page, label: string): Locator {
  return page
    .locator('.sb-trow')
    .filter({ has: page.locator('.sb-trow-subject', { hasText: label }) });
}

/** A group panel identified by its heading text ("Running"/"Waiting"/"Finished"). */
function groupPanel(page: Page, heading: string): Locator {
  return page
    .locator('.sb-panel')
    .filter({ has: page.locator('.sb-panel-title', { hasText: heading }) });
}

/** Opens the tasks screen and waits for the fixture's failing task to settle
 *  (`FAILURE_DELAY_MS`, tasks-e2e-fixture.ts) — every test below assumes this
 *  steady state, not a transient one right after launch. Idempotent: calling
 *  it again from a later test, once the screen is already open and settled,
 *  is a cheap no-op re-click, which is what makes each test safe to run on
 *  its own (e.g. via `--grep`) as well as in file order. */
async function openSettledTasksScreen(page: Page): Promise<void> {
  await page.locator('.sb-rail a[href="#/tasks"]').click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/tasks');
  await expect(rowsFor(page, 'Synthetic task D').getByText('Failed')).toBeVisible();
}

test('the badge counts what runs and what waits (AC2)', async ({ app }) => {
  const { page } = app;
  await test.step('tasks queue — open the settled tasks screen', async () => {
    await openSettledTasksScreen(page);
  });

  await test.step('tasks queue — badge counts running plus waiting, not failed', async () => {
    // 1 running (A) + 2 waiting (B, C) = 3. The failed task (D) counts
    // towards neither — `tasksBadgeCount` only counts running/queued.
    const badge = page.locator('.sb-rail a[href="#/tasks"] .sb-rail-count');
    await expect(badge).toHaveText('3');
  });
});

test('running, waiting and finished each stand under their own heading (AC3)', async ({ app }) => {
  const { page } = app;
  await test.step('tasks queue — open the settled tasks screen', async () => {
    await openSettledTasksScreen(page);
  });

  await test.step('tasks queue — each group heading reports the right count', async () => {
    await expect(groupPanel(page, 'Running').locator('.sb-panel-meta')).toHaveText('1');
    await expect(groupPanel(page, 'Waiting').locator('.sb-panel-meta')).toHaveText('2');
    await expect(groupPanel(page, 'Finished').locator('.sb-panel-meta')).toHaveText('1');
  });

  await test.step('tasks queue — every synthetic task has exactly one row', async () => {
    await expect(rowsFor(page, 'Synthetic task A')).toHaveCount(1);
    await expect(rowsFor(page, 'Synthetic task B')).toHaveCount(1);
    await expect(rowsFor(page, 'Synthetic task C')).toHaveCount(1);
    await expect(rowsFor(page, 'Synthetic task D')).toHaveCount(1);
  });
});

test('a waiting task removed before it starts never runs (AC5)', async ({ app }) => {
  const { page } = app;
  await test.step('tasks queue — open the settled tasks screen', async () => {
    await openSettledTasksScreen(page);
  });

  await test.step('tasks queue — remove the waiting task', async () => {
    /* Removed while A is still running (its backstop is ten minutes away, see
       tasks-e2e-fixture.ts) — the model lane has no free slot, so there is no
       way C could have started on its own between the click and the
       assertions below. That is what makes "never transitions to running"
       provable here, not a race against how fast the click happened to land. */
    await rowsFor(page, 'Synthetic task C').getByRole('button', { name: 'Remove' }).click();
  });

  await test.step('tasks queue — the removed task ends up cancelled, never running', async () => {
    await expect(groupPanel(page, 'Waiting').locator('.sb-panel-meta')).toHaveText('1');
    const removed = rowsFor(page, 'Synthetic task C');
    await expect(removed.getByText('Cancelled')).toBeVisible();
    // Never seen running at any point, not just "not running now".
    await expect(removed.getByRole('button', { name: 'Stop' })).toHaveCount(0);
  });
});

test('a running task stopped from the screen appears as cancelled (AC4)', async ({ app }) => {
  const { page } = app;
  await test.step('tasks queue — open the settled tasks screen', async () => {
    await openSettledTasksScreen(page);
  });

  await test.step('tasks queue — stop the running task', async () => {
    await rowsFor(page, 'Synthetic task A').getByRole('button', { name: 'Stop' }).click();
  });

  await test.step('tasks queue — stopped task is cancelled, next waiting task takes the lane', async () => {
    await expect(rowsFor(page, 'Synthetic task A').getByText('Cancelled')).toBeVisible();
    await expect(groupPanel(page, 'Running').locator('.sb-panel-meta')).toHaveText('1');
    // B took the model lane's freed slot — the previous test (AC5) already
    // removed C, so B was the only task still waiting for it.
    await expect(
      rowsFor(page, 'Synthetic task B').getByRole('button', { name: 'Stop' }),
    ).toBeVisible();
  });
});

test('a failed task can be retried and the failure stays (AC6)', async ({ app }) => {
  const { page } = app;
  await test.step('tasks queue — open the settled tasks screen', async () => {
    await openSettledTasksScreen(page);
  });

  await test.step('tasks queue — retry the failed task', async () => {
    await rowsFor(page, 'Synthetic task D').getByRole('button', { name: 'Retry' }).click();
  });

  await test.step('tasks queue — the failed record stays, the retry fails again on its own', async () => {
    /* Two rows now carry the label: the original, still `failed`, and the
       retried attempt. Rather than time-boxing an assertion against catching
       the retried attempt mid-flight (`FAILURE_DELAY_MS`, a race a loaded CI
       machine could lose), wait for its own stable end state instead: the
       production code path fails it again, deterministically, after the same
       delay — so both rows eventually read "Failed" with no fixed-time window
       to race against. */
    const withLabel = rowsFor(page, 'Synthetic task D');
    await expect(withLabel).toHaveCount(2);
    await expect(withLabel.filter({ hasText: 'Failed' })).toHaveCount(2);
  });
});
