/* Proves 070 end to end, through the real app: a sentence naming a concrete
   future day, typed into today's entry and saved, becomes visible on two
   other surfaces before that day ever arrives — the month calendar's badge
   on the day it names, and the dashboard's "Upcoming mentions" tile. D1-D4
   (`findUpcomingMentions`, the `upcoming-mention` reminder source, the tile,
   the calendar badge) are already wired; this spec only exercises the flow
   a person would actually go through, with no model configured and no
   network call (see `fixtures/app.ts`: `withoutKeyEnv` and `noNetworkCalls`
   are both automatic there, not opted into per spec).

   The horizon (`deadlineHorizonDays`, `DEFAULT_DEADLINE_HORIZON_DAYS` in
   `core/overview/types.ts`, also 14 in the seeded demo vault's own settings)
   is 14 days; +5 keeps the target day comfortably inside it and comfortably
   clear of "today" and "the day after", which the rule treats differently
   (`core/journal/upcoming-mentions.ts`).

   The sentence carries an ISO date, not "in 5 Tagen" or a weekday:
   `findDates` resolves it languageless and unambiguously, and
   `isForward` accepts anything with a digit outright — no reliance on
   German relative phrasing being read correctly by a heuristic this spec
   isn't testing. */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/vault';

test.use({ specId: 'upcoming-mention' });

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

/** `en-GB` is what `lib/format.ts#locale('en')` resolves to, and the tile
    (`UpcomingMentionsTile.tsx`) and the app run with `uiLanguage: 'en'`
    (`fixtures/app.ts`). Mirrored here rather than imported so the spec
    doesn't have to pull the renderer's `t()`/React chain into the Node
    process running the test. */
function formatDateEnGb(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

const TODAY = isoDayOffset(0);
/* Well inside the 14-day horizon, strictly after today — the one thing the
   rule requires of the date a sentence announces. */
const TARGET = isoDayOffset(5);

/* Subject words `core/journal/loose-ends.ts#subjectWords` picks up: nothing
   ahead of the ISO date in the sentence (only "an." follows, both too short
   or noise), so it falls back to the words before it — "Notartermin" and
   "steht", in that order. That's also what ends up as the tile row's title
   and the reminder's `title` (`reminders.ts#fromUpcomingMentions`). */
const SENTENCE = `Notartermin steht am ${TARGET} an.`;
const SUBJECT = 'Notartermin';

async function openDay(page: Page, date: string): Promise<void> {
  await page.locator('.sb-rail a[href="#/journal"]').click();
  await page.getByRole('button', { name: `Open the entry of ${date}` }).click();
  /* Selecting today clears the query param entirely (`JournalScreen.tsx#select`:
     `next === today ? {} : { d: next }`) — today's URL has no `?d=`, unlike
     every other day's. */
  const expected = date === TODAY ? '/journal' : `/journal?d=${date}`;
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe(expected);
}

const dayField = (page: Page) => page.getByLabel('Text of the day');

test('a future date typed today shows up on the calendar and the dashboard before its day arrives', async ({
  app,
  vault,
}) => {
  const { page } = app;
  const path = dayPath(TODAY);

  await test.step('journal — open today and write the announcement', async () => {
    await openDay(page, TODAY);
    await dayField(page).click();
    /* The demo vault already has seeded prose for other days, and a click
       can land the caret anywhere in existing text — `journal-reopen.spec.ts`
       gets away with that because it never checks the resulting text, but
       this spec parses the saved sentence back out, so it has to append
       after everything already there, not wherever the click happened to
       land. */
    await dayField(page).press('Control+End');
    await dayField(page).type(` ${SENTENCE}`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
  });

  await test.step('journal — the sentence is really on disk, not only in the DOM', async () => {
    /* The proof a save happened at all — everything downstream (the badge,
       the tile) is derived from this file, so if this isn't true nothing
       else can be either. */
    await expect.poll(() => vault.exists(path)).toBe(true);
    await expect.poll(() => vault.readNote(path)).toContain(SENTENCE);
  });

  await test.step('journal calendar — the future day carries the badge', async () => {
    /* The grid only ever renders the month currently shown, seeded from the
       selected day (today) and paged from there — so if the target day
       fell into the next month, one "next month" click gets it on screen. */
    const currentMonth = TODAY.slice(0, 7);
    const targetMonth = TARGET.slice(0, 7);
    if (targetMonth !== currentMonth) {
      await page.getByRole('button', { name: 'Next month' }).click();
    }

    const cell = page.locator(`button.sb-monthcal-day[data-date="${TARGET}"]`);
    await expect(cell).toBeVisible();
    await expect(cell.locator('.sb-monthcal-upcoming')).toBeAttached();
    await expect(cell).toHaveAccessibleName(/A future mention points here$/);
  });

  await test.step('dashboard — the row is in the upcoming-mentions tile', async () => {
    await page.locator('.sb-rail a[href="#/dashboard"]').click();

    const tile = page
      .locator('.sb-tile-card')
      .filter({ has: page.getByRole('heading', { name: 'Upcoming mentions' }) });
    await expect(tile).toBeVisible();

    const row = tile.locator('.sb-line').filter({ hasText: SUBJECT });
    await expect(row).toBeVisible();
    /* The row names the day the mention points AT — the whole point of the
       story — not the day it was announced on (that's the button's own
       target, `today`, and not what this assertion is about). */
    await expect(row).toContainText(`for ${formatDateEnGb(TARGET)}`);
  });
});
