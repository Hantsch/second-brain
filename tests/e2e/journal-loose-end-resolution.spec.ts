/* Proves the resolved loose-end row (069, D4) end to end: an announcement
   whose day has since been picked up elsewhere shows that inline, on the day
   that made it — no write happens just from looking, and a loose end nobody
   has picked up yet still shows as open exactly as before this story.

   D1-D3 already landed (`journal:get`'s `looseEnds` shape, the day-scoped
   derivation, the IPC contract) — this spec only exercises the renderer
   surface D4 adds, against the seeded pair scripts/seed/journal.mjs already
   writes: offset -12 announces "Morgen bin ich beim Notar.", offset -10
   answers it with a `[[-12]]` backlink, and offset -3 raises a second,
   unrelated loose end (the dentist) that nothing ever answers. */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/vault';

test.use({ specId: 'journal-loose-end-resolution' });

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

/** Mirrors `renderer/lib/format.ts#formatDate` for the 'en' UI language the
    e2e harness pins (`fixtures/app.ts`) — a local copy, not an import,
    exactly like `isoDayOffset` above duplicates the day arithmetic rather
    than reaching into the renderer bundle from a Playwright spec. */
function formatDateEn(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/* The announcing day: "Morgen bin ich beim Notar." */
const ANNOUNCING_DAY = isoDayOffset(-12);
/* The day that picks it back up: "Beim Notar war alles ... siehe [[-12]]." */
const ANSWERING_DAY = isoDayOffset(-10);
/* A second, unrelated loose end nothing ever answers (the dentist). */
const OPEN_DAY = isoDayOffset(-3);

async function openDay(page: Page, date: string): Promise<void> {
  await page.locator('.sb-rail a[href="#/journal"]').click();
  await page.getByRole('button', { name: `Open the entry of ${date}` }).click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe(`/journal?d=${date}`);
}

test('an answered loose end shows its answer on the day that raised it', async ({ app }) => {
  const { page } = app;

  await test.step('loose-end resolution — open the announcing day', async () => {
    await openDay(page, ANNOUNCING_DAY);
  });

  const link = page.getByRole('button', {
    name: `Open the journal entry of ${formatDateEn(ANSWERING_DAY)}`,
  });

  await test.step('loose-end resolution — resolved row shows the answering day', async () => {
    await expect(link).toBeVisible();
    await expect(link).toHaveText(`Answered on ${formatDateEn(ANSWERING_DAY)}`);
  });

  await test.step('loose-end resolution — link opens the answering day', async () => {
    await link.click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe(`/journal?d=${ANSWERING_DAY}`);
  });
});

test("the announcing day's file is not touched", async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(ANNOUNCING_DAY);
  const before = vault.snapshot(path);

  await test.step('loose-end resolution — open the announcing day', async () => {
    await openDay(page, ANNOUNCING_DAY);
    await expect(
      page.getByRole('button', {
        name: `Open the journal entry of ${formatDateEn(ANSWERING_DAY)}`,
      }),
    ).toBeVisible();
  });

  await test.step('loose-end resolution — file unchanged after reading', async () => {
    /* Reading the day is not a write path (guardrail: the files are the
       truth) — a byte-for-byte comparison, the same proof
       `journal-close.spec.ts` uses for "nothing is written before accept". */
    expect(vault.snapshot(path).equals(before)).toBe(true);
  });
});

test('an unanswered loose end still shows as open', async ({ app }) => {
  const { page } = app;

  await test.step('loose-end resolution — open the day with an unanswered loose end', async () => {
    await openDay(page, OPEN_DAY);
  });

  await test.step('loose-end resolution — open row, not a resolved link', async () => {
    /* The same open-row surface as before this story: a quote plus an
       answer field, not the resolved link — the maintenance surface's own
       filter (`openLooseEnds()`) still lists exactly this candidate. */
    await expect(page.getByLabel('Answer')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Open the journal entry of / })).toHaveCount(0);
  });
});
