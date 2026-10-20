/* Proves the reopen feedback loop (068/D3): writing new content into a
   closed day clears its `closed` field, and the person sees that happen —
   the "finished on …" badge disappears without a navigation round-trip, and
   a toast names what just happened. A blur with nothing new typed must
   change nothing: the badge stays, and the file on disk is untouched.

   D1 (`reopenIfClosed` in `core/journal`) and D2 (`reopenAfterWrite` wiring
   in `main/ipc/journal.ts`, emitting `event:toast` with
   `toast.journalReopened`) are already in place — this spec only exercises
   the feedback surface D3 adds: the i18n text and its visible effects.

   Two seeded closed days, not one, for the same reason as
   `journal-close.spec.ts`: both tests share the worker-scoped app/vault (see
   fixtures/app.ts), so reusing a day would let the first test's reopen
   invalidate the second test's "still closed" assertion. */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/vault';

test.use({ specId: 'journal-reopen' });

/** Local calendar day, `offsetDays` away from today — same arithmetic as
    `scripts/seed/lib.mjs#createClock` and `DayList.tsx#todayIso`. Never
    `Date.toISOString()`: that crosses midnight in any zone west of UTC and
    would point at the wrong file. */
function isoDayOffset(offsetDays: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${target.getFullYear()}-${month}-${day}`;
}

function dayPath(date: string): string {
  return `journal/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.md`;
}

/* offset -7: seeded closed (`closed: true` → written as this day's own
   date, scripts/seed/journal.mjs) with prose about the receipt error
   handling — content unrelated to this spec, only the closed state and the
   day's own text field matter here. */
const DAY_A = isoDayOffset(-7);

/* offset -13: the seed's second closed day (scripts/seed/journal.mjs), kept
   independent of DAY_A so the "nothing changes on a no-op" assertion can't
   be a false negative from the other test's reopen. */
const DAY_B = isoDayOffset(-13);

async function openDay(page: Page, date: string): Promise<void> {
  await page.locator('.sb-rail a[href="#/journal"]').click();
  await page.getByRole('button', { name: `Open the entry of ${date}` }).click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe(`/journal?d=${date}`);
}

const badge = (page: Page) => page.getByText(/^Closed on /);
const dayField = (page: Page) => page.getByLabel('Text of the day');
const toast = (page: Page) => page.getByRole('status').filter({ hasText: 'The day is reopened' });

test('new content in the field reopens the day, visibly and on disk', async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DAY_A);

  await test.step('journal reopen — open the closed seeded day', async () => {
    await openDay(page, DAY_A);
    await expect(badge(page)).toBeVisible();
  });

  await test.step('journal reopen — type new content and save', async () => {
    await dayField(page).click();
    await dayField(page).type(' Noch ein Satz, der neu dazukommt.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
  });

  await test.step('journal reopen — badge gone, toast shown, no navigation', async () => {
    await expect(badge(page)).toBeHidden();
    await expect(toast(page)).toBeVisible();
    /* Still on the same day — the badge disappeared through the event/query
       refresh path (`event:vault-changed` → `refreshDay`), not because the
       screen navigated away and back. */
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe(`/journal?d=${DAY_A}`);
  });

  await test.step('journal reopen — disk agrees: closed is gone', async () => {
    await expect.poll(() => vault.frontmatter(path).closed ?? null).toBeNull();
  });
});

test('leaving the field untouched reopens nothing', async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DAY_B);
  const closedBefore = vault.frontmatter(path).closed;
  expect(closedBefore).toBeTruthy();

  await test.step('journal reopen — open the other closed seeded day', async () => {
    await openDay(page, DAY_B);
    await expect(badge(page)).toBeVisible();
  });

  await test.step('journal reopen — focus the field and leave it, nothing typed', async () => {
    await dayField(page).click();
    await dayField(page).blur();
  });

  await test.step('journal reopen — badge unchanged, file unchanged', async () => {
    await expect(badge(page)).toBeVisible();
    expect(vault.frontmatter(path).closed).toBe(closedBefore);
  });
});
