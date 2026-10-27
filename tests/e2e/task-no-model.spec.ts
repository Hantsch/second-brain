/* Two dead-end/survival proofs from story 073, D6, walked through the real
 * app — the close-day counterpart of `task-result-survives-navigation.spec.ts`
 * (AC3) and the condense-specific half of AC7 that file's own comment leaves
 * to this one, because a heuristic close-day still creates a task (071's own
 * decision) while a condensation with no model routed never does.
 *
 * Both tests share one worker/app instance — `test.use({ specId, fakeProvider
 * })` is declared exactly once, at the top. Playwright forbids varying a
 * worker-scoped option per `describe` block, and a second, later top-level
 * `test.use()` in this same file was observed to retroactively change the
 * *first* test's options too (the fake provider silently stopped answering,
 * even filtered down to only that test) — so there is only one `test.use()`
 * here, ever. The second test needs "no model configured" regardless of the
 * fake provider the first one leaves running; it reaches that by clearing
 * the routing table through the app's own LLM channel before opening the
 * condensed tab, rather than by asking for a second app.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

/** Local calendar day, `offsetDays` away from today — same arithmetic the
    seeder (`scripts/seed/lib.mjs#createClock`) and the day list itself use
    (`journal-close.spec.ts` already relies on this for the same reason). */
function isoDayOffset(offsetDays: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${target.getFullYear()}-${month}-${day}`;
}

/* offset -8: real, non-empty prose in the seeded day (`journal-close.spec.ts`
   already exercises the heuristic path against this same day) — a model call
   the fake provider below replies to keeps that path away from this test. */
const DAY = isoDayOffset(-8);

/** A todo text the fake provider invents that appears in no seeded prose —
    the one thing a real model call could produce that neither the heuristic
    fallback nor the "nothing to close" empty state ever would. Proof that
    the *model* path rendered, not either dead end either side of it. */
const FAKE_TODO = 'Called back by the fake model';
const EXTRACT_TASKS_REPLY = JSON.stringify({
  todos: [{ text: FAKE_TODO }],
  waitingOn: [],
  people: [],
  projects: [],
  areas: [],
  mood: null,
  energy: null,
  tags: [],
});

test.use({
  specId: 'task-no-model',
  fakeProvider: {
    replies: { 'extract-tasks': EXTRACT_TASKS_REPLY },
    /* `closeDay` (`src/core/journal/close.ts`) makes two sequential
       `extract-tasks` calls (todos, then facts), so the whole run takes
       roughly twice this — long enough that navigating away and checking the
       tasks screen a couple of times over is still well before it lands. */
    latencyMs: 8000,
  },
});

async function openDay(page: Page, date: string): Promise<void> {
  await page.locator('.sb-rail a[href="#/journal"]').click();
  await page.getByRole('button', { name: `Open the entry of ${date}` }).click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe(`/journal?d=${date}`);
}

/** Task rows for one subject label, the same helper `task-result-survives-
    navigation.spec.ts`/`task-run-failure.spec.ts` use. */
function rowsFor(page: Page, label: string): Locator {
  return page
    .locator('.sb-trow')
    .filter({ has: page.locator('.sb-trow-subject', { hasText: label }) });
}

async function openTasksScreen(page: Page): Promise<void> {
  await page.locator('.sb-rail a[href="#/tasks"]').click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();
}

test("a day's close survives leaving the journal", async ({ app }) => {
  const { page } = app;

  await test.step('close — open the seeded day and trigger the close-out', async () => {
    await openDay(page, DAY);
    await expect(page.getByRole('button', { name: 'Close the day' })).toBeVisible();
    await page.getByRole('button', { name: 'Close the day' }).click();
    /* Proves a task actually started, right where the run was triggered —
       no navigation latency to race against yet. */
    await expect(page.getByRole('button', { name: 'Close the day' })).toBeDisabled();
  });

  await test.step('close — leave the journal while the run is still going', async () => {
    await openTasksScreen(page);
    /* Still well short of the ~16s the two sequential model calls take — the
       row exists and is not finished yet. Running shows a "Stop" action,
       queued (waiting for the model lane) a "Remove" one; either proves it,
       whichever this happens to catch. */
    await expect(rowsFor(page, DAY).getByRole('button', { name: /^(Stop|Remove)$/ })).toBeVisible();
  });

  await test.step('close — the run finishes while the screen is gone', async () => {
    await expect(rowsFor(page, DAY).getByText('Done')).toBeVisible({ timeout: 25_000 });
  });

  await test.step('close — coming back shows the real proposal, not empty or heuristic', async () => {
    await openDay(page, DAY);
    /* `FAKE_TODO` is the one thing that can only have come from the fake
       model's own reply — neither the heuristic fallback (which would have
       pulled a todo out of the seeded day's own German prose, a different
       text) nor the "nothing to close" empty state (049, D4, no todo at all)
       could ever produce it. The native checkbox is visually replaced by
       `.gs-check-box` (`atoms/Checkbox.tsx`), so it isn't itself painted —
       `toBeChecked` is the right assertion here, the same one
       `journal-close.spec.ts` uses for its own identical checkbox check. */
    await expect(page.getByRole('checkbox', { name: FAKE_TODO })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeVisible();
    await expect(
      page.getByText('There is nothing in the text of the day to pull out yet.'),
    ).toHaveCount(0);
    /* Read, not re-triggered. */
    await expect(page.getByRole('button', { name: 'Close the day' })).toHaveCount(0);
  });
});

test('with no model configured a condensation creates no task and keeps its honest dead end', async ({
  app,
}) => {
  const { page } = app;
  const AREA = { slug: 'kunden-und-team', title: 'Kunden und Team' };

  await test.step('condense — clear the routing (this test needs no model routed at all)', async () => {
    /* This spec shares one app instance across both tests (see the file
       header) — the fake provider and its per-tier defaults the first test
       needs stay configured on disk. `llm:setDefault({ ref: null })` is the
       same call the routing table's own "no model" option makes; clearing
       all three tiers (no per-task override was ever set — the fixture in
       `fixtures/app.ts` only ever writes `routing.tasks: {}`) reaches the
       same "nothing routed anywhere" state a session that never configured
       a provider would be in — `hasRoute` (`useTaskRouted`, read by
       `CondensedUnitPanel`) is a routing-table check, not a provider-health
       one, so disabling the provider itself would leave the trigger showing
       regardless. A reload is what makes the renderer's own routing query
       see it — this call goes around `useMutation`, so nothing here
       invalidates the cache on its own. */
    /* String form, not a typed function body: the tsconfig this file type-checks
       under has no DOM lib (`tests/e2e/**` is Node-side under
       `tsconfig.node.json`), so a function referencing `window` would not
       compile — the same reason every other spec's own `location.hash`
       navigation already uses this form instead of a typed callback. */
    for (const tier of ['cheap', 'balanced', 'strong']) {
      await page.evaluate(`window.sb.invoke('llm:setDefault', { tier: '${tier}', ref: null })`);
    }
    await page.reload();
  });

  await test.step('condense — open the condensed tab with no model routed', async () => {
    await page.evaluate(`location.hash = "#/notes?a=${AREA.slug}&tab=condensed"`);
    const panel = page
      .locator('.sb-panel')
      .filter({ has: page.locator('.sb-panel-title', { hasText: AREA.title }) });
    await expect(panel.getByText('This step needs a model')).toBeVisible();
    /* AC7's UI half, unchanged by this story: no trigger anywhere, not even
       disabled — there is nothing here a click could "trigger" in the first
       place, which is itself part of the dead end being honest. */
    await expect(panel.getByRole('button', { name: /^Condense/ })).toHaveCount(0);
  });

  await test.step('condense — the tasks screen never gained a row for it (AC7)', async () => {
    await openTasksScreen(page);
    await expect(rowsFor(page, AREA.slug)).toHaveCount(0);
  });
});

test('with no model configured the module view names condense-module and links to its model setting', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const MODULE = 'second-brain-methodik';
  const overview = join(vaultPath, 'modules', MODULE, 'wiki', 'overview.md');
  const before = readFileSync(overview, 'utf8');

  await test.step('module — open the condensed tab with no model routed', async () => {
    /* The routing was cleared by the previous test on this shared app (see the
       file header); clearing again keeps this one independent of test order. */
    for (const tier of ['cheap', 'balanced', 'strong']) {
      await page.evaluate(`window.sb.invoke('llm:setDefault', { tier: '${tier}', ref: null })`);
    }
    await page.evaluate(`location.hash = "#/knowledge?m=${MODULE}&tab=condensed"`);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Condensed', selected: true })).toBeVisible();
    await expect(page.getByText('This step needs a model')).toBeVisible();
    await expect(page.getByText(/Condense module/)).toBeVisible();
    /* No trigger anywhere, not even disabled. */
    await expect(page.getByRole('button', { name: /^Condense/ })).toHaveCount(0);
  });

  await test.step('module — nothing was written to the overview page', async () => {
    expect(readFileSync(overview, 'utf8')).toBe(before);
  });

  await test.step('module — the link lands on the models tab, at the task’s own select', async () => {
    await page.getByRole('button', { name: 'Set up routing' }).click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/settings?tab=models');
    await expect(page.getByRole('tab', { name: 'Models', selected: true })).toBeVisible();
    const select = page.locator('#routing-select-condense-module');
    await expect(select).toBeVisible();
    await expect(select).toBeEnabled();
  });
});
