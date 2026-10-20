/* Story 073's core promise, walked through the real app: a run I walk away
 * from keeps running, and its result is still there when I come back — I never
 * have to spend the model twice on the same question.
 *
 * The model is the deterministic offline `fake` provider (073, D1), scripted
 * here with a slow, valid condensation reply: `latencyMs` is what makes a run
 * observable long enough to leave the panel mid-run, and the reply is the one
 * shape `condenseArea` accepts — all three machine sections present, none of
 * them citing a source, which is exactly the case `attributionProblems` lets
 * through (prose without a citation is refused, silence is not). A reply that
 * cited a path would tie this spec to whatever the seeder happens to write
 * into that area today.
 *
 * The four tests below are one causal chain, not four independent ones — the
 * same shape (and the same reason) as `tasks-queue.spec.ts`: AC1 starts the
 * run AC2 walks away from, AC2 leaves the proposal AC5 refuses to have written
 * anything for, and only AC5's Accept puts the artifact on disk that AC6's
 * second run can queue behind. Playwright runs a file's tests in declaration
 * order, so that order is the scenario. Each still reports its own pass/fail;
 * only the state carries over.
 *
 * `kunden-und-team` is the seeded area with notes and todos but no condensed
 * artifact yet (`scripts/seed/projects.mjs`) — so "nothing was written" is the
 * plain absence of a file, not a diff against an existing one. The task's
 * subject label for an area is its slug (`src/main/ipc/condense.ts`), which is
 * how a row on the tasks screen is found again.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

/** A reply `condenseArea` accepts, with nothing claimed and nothing cited. */
const EMPTY_SECTIONS = JSON.stringify({
  state: { text: '', sources: [] },
  patterns: { text: '', sources: [] },
  open: { text: '', sources: [] },
});

/** A todo text the fake provider invents that appears in no seeded prose — proof
 * that D7's close-day "view result" test landed on the *model* result, not the
 * heuristic fallback (same proof, same reply shape, as `task-no-model.spec.ts`,
 * D6 — this spec needs its own close-day task, since that file's `app` fixture
 * is a separate worker instance this file cannot reach into). */
const FAKE_TODO = 'Called back by the fake model, D7';
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
  specId: 'task-result-survives-navigation',
  fakeProvider: {
    replies: {
      'condense-area': EMPTY_SECTIONS,
      'condense-project': EMPTY_SECTIONS,
      'extract-tasks': EXTRACT_TASKS_REPLY,
    },
    /* Long enough to click, navigate and assert while the run is still going —
       this spec is about what happens *during* a run, so a run that is over
       before the first assertion would prove nothing. */
    latencyMs: 6000,
  },
});

const AREA = { slug: 'kunden-und-team', title: 'Kunden und Team' };
const SECOND_AREA = { slug: 'gesundheit', title: 'Gesundheit' };
const ARTIFACT = 'areas/kunden-und-team.condensed.md';

/** Local calendar day, `offsetDays` away from today — the same arithmetic
    `task-no-model.spec.ts` uses for the same reason (matches the seeder's own
    clock, `scripts/seed/lib.mjs#createClock`). offset -8 is a day the seeder
    fills with real, non-empty prose regardless of which spec's throwaway vault
    reads it — the close-out needs an actual day to close. */
function isoDayOffset(offsetDays: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${target.getFullYear()}-${month}-${day}`;
}

const CLOSE_DAY = isoDayOffset(-8);

/** Opens a day's own entry through the journal list, the same helper
    `task-no-model.spec.ts` uses. */
async function openDay(page: Page, date: string): Promise<void> {
  await page.locator('.sb-rail a[href="#/journal"]').click();
  await page.getByRole('button', { name: `Open the entry of ${date}` }).click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe(`/journal?d=${date}`);
}

/** The area's own panel on the notes screen — every assertion about "the
    panel" is scoped to it, so a second area's section can never answer for it. */
function areaPanel(page: Page, title: string): Locator {
  return page
    .locator('.sb-panel')
    .filter({ has: page.locator('.sb-panel-title', { hasText: title }) });
}

/** Task rows for one subject label. */
function rowsFor(page: Page, label: string): Locator {
  return page
    .locator('.sb-trow')
    .filter({ has: page.locator('.sb-trow-subject', { hasText: label }) });
}

/**
 * Opens one area's condensed tab through the address (073's own decision:
 * `#/notes?a=<slug>&tab=condensed`). Always via the tasks screen first, because
 * `AreaSection` reads `?a=`/`?tab=` into `useState` on mount — changing the
 * address while the notes screen is already mounted would leave the sections
 * exactly as they were, and the spec would assert against the wrong panel.
 */
async function openCondensedTab(page: Page, slug: string, title: string): Promise<Locator> {
  await openTasksScreen(page);
  await page.evaluate(`location.hash = "#/notes?a=${slug}&tab=condensed"`);
  const panel = areaPanel(page, title);
  await expect(panel.getByRole('button', { name: /^Condense (this area|again)$/ })).toBeVisible();
  return panel;
}

/**
 * Waits for the tasks screen to have actually *rendered*, not just for the
 * address to say so: two hash changes in the same tick never unmount the
 * screen in between, and `openCondensedTab` needs that unmount — without it
 * the notes screen keeps the sections it opened the first time.
 */
async function openTasksScreen(page: Page): Promise<void> {
  await page.locator('.sb-rail a[href="#/tasks"]').click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();
}

test('a started condensation shows as one task in the panel and in the task list', async ({
  app,
}) => {
  const { page } = app;

  await test.step('run — start a condensation from the area panel', async () => {
    const panel = await openCondensedTab(page, AREA.slug, AREA.title);
    await panel.getByRole('button', { name: 'Condense this area' }).click();
    await expect(panel.getByText('Condensation running')).toBeVisible();
  });

  await test.step('run — the same run is the one task on the tasks screen', async () => {
    await openTasksScreen(page);
    /* One task, not two readings that happen to agree: the panel and this row
       are the same record of the same queue (AC1). */
    await expect(rowsFor(page, AREA.slug)).toHaveCount(1);
    await expect(rowsFor(page, AREA.slug).getByRole('button', { name: 'Stop' })).toBeVisible();
  });
});

test('leaving the panel mid-run and coming back shows the finished proposal, not a new run', async ({
  app,
}) => {
  const { page } = app;

  /* The navigation away already happened — the previous test left the panel
     for the tasks screen while the run was still going. */
  await test.step('survives navigation — the run finishes while the panel is gone', async () => {
    await openTasksScreen(page);
    await expect(rowsFor(page, AREA.slug).getByText('Done')).toBeVisible({ timeout: 30_000 });
  });

  await test.step('survives navigation — coming back shows the proposal, not an empty panel', async () => {
    const panel = await openCondensedTab(page, AREA.slug, AREA.title);
    /* The decision the run produced, offered without anything being asked of
       the model a second time (AC2). */
    await expect(panel.getByRole('button', { name: 'Accept' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Reject' })).toBeVisible();
    await expect(panel.getByText('Condensation running')).toHaveCount(0);
  });

  await test.step('survives navigation — still exactly one run for this area', async () => {
    await openTasksScreen(page);
    // A second run would be a second row: coming back must read the queue, not
    // restart it.
    await expect(rowsFor(page, AREA.slug)).toHaveCount(1);
  });
});

test('a proposal that finished elsewhere writes nothing until it is accepted', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const artifact = join(vaultPath, ...ARTIFACT.split('/'));

  await test.step('nothing written — the artifact does not exist after the run', async () => {
    /* The seeded area has no condensed artifact, and a finished run must not
       have created one: a run alone never writes (AC5, Guardrail 2). */
    expect(existsSync(artifact)).toBe(false);
  });

  await test.step('nothing written — only Accept puts the file on disk', async () => {
    const panel = await openCondensedTab(page, AREA.slug, AREA.title);
    await panel.getByRole('button', { name: 'Accept' }).click();
    await expect.poll(() => existsSync(artifact), { timeout: 15_000 }).toBe(true);
    expect(readFileSync(artifact, 'utf8').length).toBeGreaterThan(0);
  });
});

test('a second condensation shows its position in the queue', async ({ app }) => {
  const { page } = app;

  await test.step('queue position — occupy the model lane with one run', async () => {
    const panel = await openCondensedTab(page, AREA.slug, AREA.title);
    await panel.getByRole('button', { name: 'Condense again' }).click();
    await expect(panel.getByText('Condensation running')).toBeVisible();
  });

  await test.step('queue position — a second area names its place, and does not claim to run', async () => {
    const second = await openCondensedTab(page, SECOND_AREA.slug, SECOND_AREA.title);
    await second.getByRole('button', { name: 'Condense again' }).click();
    /* The model lane runs one task at a time, so this one waits — and says so
       with its place, rather than showing a spinner for work that has not
       started (AC6). */
    await expect(second.getByText(/queue position \d/)).toBeVisible();
    await expect(second.getByText('Condensation running')).toHaveCount(0);
  });
});

/* AC4, D7: the tasks screen's "view result" action, which opens the unit a
   finished task belongs to with its proposal already showing. Split into two
   tests, one per kind that has a route today (`task-result-route.ts`) — the
   original single name bundled "the project's knowledge tab and the day",
   but this file only ever condenses an area (not a project), and a condense
   test and a close-day test share nothing else worth forcing into one body. */

test("view result opens the area's condensed tab with its proposal already open", async ({
  app,
}) => {
  const { page } = app;

  await test.step('view result — the second run from the previous test finishes', async () => {
    await openTasksScreen(page);
    /* `.last()`, not the plain filter: the first condensation on this area
       (accepted back in an earlier test) is also still a `done` row with a
       "View result" button of its own — insertion order (`WorkQueue.list()`)
       keeps it first, so the second, still-undecided run is the last one. */
    await expect(rowsFor(page, AREA.slug).last().getByText('Done')).toBeVisible({
      timeout: 30_000,
    });
  });

  await test.step('view result — click it and land on the address, proposal already open', async () => {
    await rowsFor(page, AREA.slug).last().getByRole('button', { name: 'View result' }).click();
    await expect
      .poll(() => page.url().split('#')[1] ?? '')
      .toBe(`/notes?a=${AREA.slug}&tab=condensed`);
    const panel = areaPanel(page, AREA.title);
    /* No extra click: the panel derives its state from the same task queue
       (`useTaskForSubject`, D5) — arriving here is the whole action. */
    await expect(panel.getByRole('button', { name: 'Accept' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Reject' })).toBeVisible();
  });
});

test('view result opens the day with its close proposal already open', async ({ app }) => {
  const { page } = app;

  await test.step('close — trigger a day close from the journal', async () => {
    await openDay(page, CLOSE_DAY);
    await page.getByRole('button', { name: 'Close the day' }).click();
    await expect(page.getByRole('button', { name: 'Close the day' })).toBeDisabled();
  });

  await test.step('view result — wait for the close to finish, then use the tasks screen', async () => {
    await openTasksScreen(page);
    await expect(rowsFor(page, CLOSE_DAY).getByText('Done')).toBeVisible({ timeout: 30_000 });
    await rowsFor(page, CLOSE_DAY).getByRole('button', { name: 'View result' }).click();
  });

  await test.step('view result — lands on the day, proposal already open, no extra click', async () => {
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe(`/journal?d=${CLOSE_DAY}`);
    /* `FAKE_TODO` only the fake model's own reply could have produced — proof
       the real close proposal is showing, not the heuristic fallback or the
       empty state (same reasoning as `task-no-model.spec.ts`, D6). */
    await expect(page.getByRole('checkbox', { name: FAKE_TODO })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeVisible();
  });
});
