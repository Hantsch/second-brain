/* Proves the close card is editable, not only prunable (075, AC1-AC3, AC9):
   a proposed todo's text, its target project and its scope can all be
   corrected before accept, and what lands on disk is exactly the corrected
   card — never the model's first guess.

   Mirror: journal-close.spec.ts. The two differ in one load-bearing way —
   every day here starts with NO file at all (an offset scripts/seed/journal.mjs
   never writes), because the sprint decision for this story is to type the
   day's prose through the UI rather than pre-seed it (keeps the heuristic's
   input on the real surface). A day list row only exists for a day that
   already has a file (or for today), so `openDay` below goes through the
   month calendar instead of the mirror's day-list button — the calendar is
   the one control that can open a day nobody has written yet.

   Own specId, own worker-scoped app/vault: accepting a close consumes its
   day, and this suite must not touch journal-close.spec.ts's two seeded days
   (or vice versa).

   D7 extends this same file with the remaining AC4-AC8/AC10 scenarios
   (waiting-on, add-by-hand, field chips, survival across navigation,
   discard) — the helpers below are written to be reused there unchanged. */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/vault';

test.use({ specId: 'journal-close-correct' });

/** Local calendar day, `offsetDays` away from today — same arithmetic as
    journal-close.spec.ts (and the seeder/day list themselves). */
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

/* None of these offsets are among scripts/seed/journal.mjs's seeded set
   (0, -1..-14, -16, -18, -20, -40, -42) — every one of these days starts with
   no file, which is the point: the heuristic has nothing to read until this
   spec types into the field itself. One offset per test, since accepting a
   close consumes the day and no two tests may share one. */
const DATE_TEXT = isoDayOffset(-21);
const DATE_TARGET = isoDayOffset(-22);
const DATE_SCOPE = isoDayOffset(-23);
const DATE_COMBINED = isoDayOffset(-24);

/* D7's own six days, fresh offsets past D6's four above — same "no seeded
   file, one offset per test" rule (a discard's byte-identical assertion in
   particular wants a day nobody else has ever touched). */
const DATE_WAITING = isoDayOffset(-25);
const DATE_PEOPLE = isoDayOffset(-26);
const DATE_ADDED = isoDayOffset(-27);
const DATE_MOOD = isoDayOffset(-28);
const DATE_SURVIVE = isoDayOffset(-29);
const DATE_DISCARD = isoDayOffset(-30);

/* A safe, verified-working task-shaped sentence: journal-close.spec.ts proves
   the heuristic (`core/capture/signals.ts#isTask`) picks it up with no model
   configured, and it contains none of `core/capture/lexicon.ts`'s WORK_STEMS
   or PRIVATE_STEMS, so the proposed todo's own scope comes out 'private' —
   the same default the day file's own `scopeFor` fallback would give it,
   which is exactly what's needed to prove a *corrected* scope on top of it. */
const PROSE = 'Mit Jonas über die Filterleiste gesprochen.';
const TODO_TEXT = 'Mit Jonas über die Filterleiste gesprochen';
const TODO_LINE = `- [ ] ${TODO_TEXT}`;

const KUNDENPORTAL_PATH = 'projects/work/kundenportal-relaunch/project.md';
const KUNDENPORTAL_TITLE = 'Kundenportal Relaunch';

/* `findWaitingOn` (core/capture/waiting.ts) reads 'warte auf <name> <rest>'
   verbatim: 'Jonas' is the leading name, 'wegen der neuen Filterleiste' the
   rest — the proposed row's checkbox/text carries the *rest*, its own person
   field the name (`close-proposal-view.ts#asTodo`). Neither name matches
   `isTask`'s TASK_WORDS nor its infinitive-ending check, so the sentence
   produces exactly one row (kind: 'waiting'), never a second, plain 'todo'
   row for the same text. 'Filterleiste' (the same topic `PROSE` above already
   uses) is deliberately reused rather than an 'Angebot'/'Rechnung' phrasing —
   both of the latter are `WORK_STEMS` in core/capture/lexicon.ts, which would
   flip the day's own derived scope to 'work' and put an incidental `#work` tag
   on the line, noise this test isn't about. */
const WAITING_PROSE = 'Warte auf Jonas wegen der neuen Filterleiste.';
const WAITING_SUBJECT = 'wegen der neuen Filterleiste';

/* Two different people waited on, in one entry — `heuristicFacts` folds every
   waiting-on's `who` into `frontmatter.people` unconditionally (facts.ts),
   giving the People chip row two names to choose between. Same
   'Filterleiste'/neutral-topic discipline as `WAITING_PROSE` above. */
const PEOPLE_PROSE =
  'Warte auf Jonas wegen der Filterleiste. Warte auf Miriam wegen der Statusseite.';

/* A LOW_MOOD word (core/journal/facts.ts) with no model configured proposes
   mood level 2 ('Low') — picking a different level on the MoodPicker proves
   the correction wins over the heuristic's first guess. */
const MOOD_PROSE = 'Ich bin heute total genervt gewesen.';

/**
 * Opens a day by date, whether or not it has a file yet.
 *
 * journal-close.spec.ts's own `openDay` clicks the day list's
 * "Open the entry of {date}" button — but `DayList.tsx` only ever renders a
 * row for a day that already has a file (or for today, unconditionally); a
 * day with no file and no seeded entry gets no row at all. The month
 * calendar (`MonthCalendar.tsx`) is the one control that opens an arbitrary
 * past day regardless — `monthCells`/`unopenable` only disables a *future*
 * day with no file, never a past one.
 *
 * `JournalScreen.tsx`'s `month` is local state seeded once from `today` at
 * mount, and this file's tests share one worker-scoped app/page — the
 * same screen instance, never remounted, across every test (except the one
 * that deliberately navigates away and back, D7's own survival test). Its own
 * render-time resync ("date changed, follow it to the right month") only
 * fires a render *after* the click that changed `date` — a window in which
 * this helper could see last test's leftover month and click a day button
 * that the resync then rips out from under it. Clicking the calendar's own
 * "Today" button sidesteps that race entirely: it calls `onMonth` and
 * `onSelect` in the same handler, a one-shot deterministic reset rather than
 * an inferred one.
 *
 * A day outside the currently displayed month renders as a padding cell with
 * no button at all (`MonthCalendar.tsx`'s `cell.padding` branch), so the
 * target day's button may not exist yet once the month is back on today's —
 * "Previous month" is clicked until it does. Every offset this file uses is
 * at most 30 days in the past, which (depending on where today falls in its
 * own month, and how short the month before it is) can need up to two steps
 * back, never more; the guard bound of 3 is headroom above that, not a real
 * expectation of looping further.
 */
async function openDay(page: Page, date: string): Promise<void> {
  await page.locator('.sb-rail a[href="#/journal"]').click();
  await page.locator('.sb-monthcal-toolbar').getByRole('button', { name: 'Today' }).click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/journal');

  const dayButton = page.getByRole('button', { name: `Open the calendar day ${date}` });
  for (let guard = 0; guard < 3 && (await dayButton.count()) === 0; guard++) {
    await page.getByRole('button', { name: 'Previous month' }).click();
  }
  await dayButton.click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe(`/journal?d=${date}`);
  /* The day switch is a `key={date}` remount (`JournalScreen.tsx`), not an
     in-place update — for one render after the URL settles, the *previous*
     day's own field can still be the one in the DOM. Waiting for the field
     to actually be empty is what tells "the new, blank day has mounted" from
     "the old day's textarea is still here" — without it, a fast `.fill()`
     right after this call can land on the outgoing node and silently do
     nothing once it's torn down. */
  await expect(page.getByRole('textbox', { name: 'Text of the day' })).toHaveValue('');
}

/** Types `prose` into the day's own field and saves it — the sprint decision
 * for this story: the day starts with no file, so the heuristic's only input
 * is what this spec types through the real field, never a pre-seeded file.
 * Waits for "Close the day" to become enabled, the observable proof that the
 * file now exists (the button stays disabled while `view.data` is `null`). */
async function writeDay(page: Page, prose: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Text of the day' }).fill(prose);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close the day' })).toBeEnabled();
}

test('an edited todo text is what lands on disk', async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DATE_TEXT);
  const editedText = 'Mit Jonas die neue Filterleiste fertig abgestimmt';

  await test.step('journal close correct — write the day', async () => {
    await openDay(page, DATE_TEXT);
    expect(vault.exists(path)).toBe(false);
    await writeDay(page, PROSE);
  });

  await test.step('journal close correct — trigger close', async () => {
    await page.getByRole('button', { name: 'Close the day' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: TODO_TEXT })).toBeChecked();
  });

  await test.step('journal close correct — correct the text', async () => {
    await page.getByRole('textbox', { name: 'Todo text' }).fill(editedText);
    expect(vault.frontmatter(path).closed ?? null).toBeNull();
  });

  await test.step('journal close correct — accept', async () => {
    await page.getByRole('button', { name: 'Apply and close' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeHidden();
  });

  await test.step('journal close correct — disk matches the edit', async () => {
    await expect.poll(() => vault.frontmatter(path).closed).toBe(DATE_TEXT);
    const body = vault.readNote(path);
    /* The typed sentence itself is expected to still be in "## Tag" — closing
       a day never removes the day's own prose, only extracts facts from it.
       What must differ is the checkbox line under "## Fakten": the model's
       first guess, not the corrected text. */
    expect(body).toContain(`- [ ] ${editedText}`);
    expect(body).not.toContain(TODO_LINE);
  });
});

test('a todo retargeted to a project is written into that project file', async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DATE_TARGET);
  const before = vault.snapshot(KUNDENPORTAL_PATH);

  await test.step('journal close correct — write the day', async () => {
    await openDay(page, DATE_TARGET);
    await writeDay(page, PROSE);
  });

  await test.step('journal close correct — trigger close', async () => {
    await page.getByRole('button', { name: 'Close the day' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: TODO_TEXT })).toBeChecked();
  });

  await test.step('journal close correct — retarget to a project', async () => {
    await page
      .getByRole('combobox', { name: 'Target' })
      .selectOption({ label: KUNDENPORTAL_TITLE });
    expect(vault.frontmatter(path).closed ?? null).toBeNull();
    expect(vault.snapshot(KUNDENPORTAL_PATH).equals(before)).toBe(true);
  });

  await test.step('journal close correct — accept', async () => {
    await page.getByRole('button', { name: 'Apply and close' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeHidden();
  });

  await test.step('journal close correct — disk matches the retarget', async () => {
    await expect.poll(() => vault.frontmatter(path).closed).toBe(DATE_TARGET);
    expect(vault.readNote(path)).not.toContain(TODO_LINE);
    await expect.poll(() => vault.readNote(KUNDENPORTAL_PATH)).toContain(TODO_LINE);
  });
});

test('a corrected scope is written as a tag on the line', async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DATE_SCOPE);

  await test.step('journal close correct — write the day', async () => {
    await openDay(page, DATE_SCOPE);
    await writeDay(page, PROSE);
  });

  await test.step('journal close correct — trigger close', async () => {
    await page.getByRole('button', { name: 'Close the day' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: TODO_TEXT })).toBeChecked();
  });

  await test.step('journal close correct — correct the scope to work', async () => {
    /* The day has no `scope:` frontmatter and the prose carries none of
       lexicon.ts's work/private signal words, so the row starts on
       'private' — the same value the day file's own `scopeFor` fallback
       resolves to (`core/index/todos.ts`). Picking 'Work' here therefore
       deviates from the day's derived scope, which is exactly the condition
       `normalizeCloseTodos` (`core/journal/close-request.ts`) needs to write
       the tag at all. */
    await page.getByRole('combobox', { name: 'Work or private' }).selectOption({ label: 'Work' });
    expect(vault.frontmatter(path).closed ?? null).toBeNull();
  });

  await test.step('journal close correct — accept', async () => {
    await page.getByRole('button', { name: 'Apply and close' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeHidden();
  });

  await test.step('journal close correct — disk carries the tag', async () => {
    await expect.poll(() => vault.frontmatter(path).closed).toBe(DATE_SCOPE);
    expect(vault.readNote(path)).toContain(`${TODO_LINE} #work`);
  });
});

test('the disk matches the corrected card', async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DATE_COMBINED);
  const editedText = 'Mit Jonas die Filterleiste final abgestimmt';

  await test.step('journal close correct — write the day', async () => {
    await openDay(page, DATE_COMBINED);
    await writeDay(page, PROSE);
  });

  await test.step('journal close correct — trigger close', async () => {
    await page.getByRole('button', { name: 'Close the day' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: TODO_TEXT })).toBeChecked();
  });

  await test.step('journal close correct — correct text and scope together', async () => {
    /* Two corrections on the same row, at once — the risk this test names
       isn't "does one field write correctly" (AC1/AC3 already prove that in
       isolation) but "does the card, corrected on more than one axis, still
       write out as one coherent whole". */
    await page.getByRole('textbox', { name: 'Todo text' }).fill(editedText);
    await page.getByRole('combobox', { name: 'Work or private' }).selectOption({ label: 'Work' });
    expect(vault.frontmatter(path).closed ?? null).toBeNull();
  });

  await test.step('journal close correct — accept', async () => {
    await page.getByRole('button', { name: 'Apply and close' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeHidden();
  });

  await test.step('journal close correct — disk matches the corrected card', async () => {
    await expect.poll(() => vault.frontmatter(path).closed).toBe(DATE_COMBINED);
    const body = vault.readNote(path);
    expect(body).toContain(`- [ ] ${editedText} #work`);
    expect(body).not.toContain(TODO_LINE);
  });
});

test("a waiting-on's person and subject are both corrected", async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DATE_WAITING);
  const correctedSubject = 'wegen des aktualisierten Zeitplans';
  const correctedPerson = 'Miriam Bauer';

  await test.step('journal close correct — write the day', async () => {
    await openDay(page, DATE_WAITING);
    await writeDay(page, WAITING_PROSE);
  });

  await test.step('journal close correct — trigger close', async () => {
    await page.getByRole('button', { name: 'Close the day' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: WAITING_SUBJECT })).toBeChecked();
    await expect(page.getByRole('textbox', { name: 'Waiting on (person)' })).toHaveValue('Jonas');
  });

  await test.step('journal close correct — correct the subject and the person', async () => {
    await page.getByRole('textbox', { name: 'Todo text' }).fill(correctedSubject);
    await page.getByRole('textbox', { name: 'Waiting on (person)' }).fill(correctedPerson);
    expect(vault.frontmatter(path).closed ?? null).toBeNull();
  });

  await test.step('journal close correct — accept', async () => {
    await page.getByRole('button', { name: 'Apply and close' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeHidden();
  });

  await test.step('journal close correct — disk carries the corrected waiting-on', async () => {
    await expect.poll(() => vault.frontmatter(path).closed).toBe(DATE_WAITING);
    const body = vault.readNote(path);
    /* `todoLine` (core/capture/actions.ts) writes `@wait:` with spaces turned
       into dashes — the two-word corrected name is the point of this
       assertion, not an incidental detail. */
    expect(body).toContain(`- [ ] ${correctedSubject} @wait:Miriam-Bauer`);
    /* The typed sentence itself stays in "## Tag" untouched (closing a day
       never removes the day's own prose) — WAITING_SUBJECT legitimately
       still appears there. What must be gone is the model's first-guess
       checkbox line and its person marker. */
    expect(body).not.toContain(`- [ ] ${WAITING_SUBJECT}`);
    expect(body).not.toContain('@wait:Jonas');
  });
});

test('a todo added by hand is written like a proposed one', async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DATE_ADDED);
  const addedText = 'Rueckmeldung zur Kundenportal-Migration einholen';
  const todayIso = isoDayOffset(0);
  const before = vault.snapshot(KUNDENPORTAL_PATH);

  await test.step('journal close correct — write the day', async () => {
    await openDay(page, DATE_ADDED);
    await writeDay(page, PROSE);
  });

  await test.step('journal close correct — trigger close', async () => {
    await page.getByRole('button', { name: 'Close the day' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: TODO_TEXT })).toBeChecked();
  });

  await test.step('journal close correct — add a todo by hand', async () => {
    await page.getByRole('button', { name: 'Add a todo' }).click();
    /* The added row renders after the proposed one (`rowsOf`: own rows, then
       added rows) — `.last()` is what picks it out from the proposed row's
       own, otherwise identical, controls. */
    await page.getByRole('textbox', { name: 'Todo text' }).last().fill(addedText);
    await page
      .getByRole('combobox', { name: 'Target' })
      .last()
      .selectOption({ label: KUNDENPORTAL_TITLE });
    await page
      .getByRole('group', { name: /^Due date for/ })
      .last()
      .getByRole('button', {
        name: 'today',
      })
      .click();
    expect(vault.frontmatter(path).closed ?? null).toBeNull();
    expect(vault.snapshot(KUNDENPORTAL_PATH).equals(before)).toBe(true);
  });

  await test.step('journal close correct — accept', async () => {
    await page.getByRole('button', { name: 'Apply and close' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeHidden();
  });

  await test.step('journal close correct — disk matches the added todo', async () => {
    await expect.poll(() => vault.frontmatter(path).closed).toBe(DATE_ADDED);
    expect(vault.readNote(path)).not.toContain(addedText);
    await expect
      .poll(() => vault.readNote(KUNDENPORTAL_PATH))
      .toContain(`- [ ] ${addedText} @due:${todayIso}`);
  });
});

test('dropping one person keeps the others', async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DATE_PEOPLE);

  await test.step('journal close correct — write the day', async () => {
    await openDay(page, DATE_PEOPLE);
    await writeDay(page, PEOPLE_PROSE);
  });

  await test.step('journal close correct — trigger close', async () => {
    await page.getByRole('button', { name: 'Close the day' }).click();
    const people = page.getByRole('group', { name: 'People' });
    await expect(people.getByRole('button', { name: 'Remove “Jonas”' })).toBeVisible();
    await expect(people.getByRole('button', { name: 'Remove “Miriam”' })).toBeVisible();
  });

  await test.step('journal close correct — drop one person', async () => {
    await page
      .getByRole('group', { name: 'People' })
      .getByRole('button', { name: 'Remove “Jonas”' })
      .click();
    expect(vault.frontmatter(path).closed ?? null).toBeNull();
  });

  await test.step('journal close correct — accept', async () => {
    await page.getByRole('button', { name: 'Apply and close' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeHidden();
  });

  await test.step('journal close correct — disk keeps only the other person', async () => {
    await expect.poll(() => vault.frontmatter(path).closed).toBe(DATE_PEOPLE);
    const people = vault.frontmatter(path)['people'];
    expect(people).toContain('Miriam');
    expect(people).not.toContain('Jonas');
  });
});

test('a picked mood is written instead of the proposed one', async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DATE_MOOD);

  await test.step('journal close correct — write the day', async () => {
    await openDay(page, DATE_MOOD);
    await writeDay(page, MOOD_PROSE);
  });

  /* Scoped to the close card's own "Mood and energy" fieldset, not just to a
     group named 'Mood': the day header above renders its own always-visible
     'Mood' group too, and a level-2 button reads 'Set Low' in *both* the
     mood and the energy picker (docs/VAULT-FORMAT.md's scale — level 2 is
     'Low' for either field). Going through the fieldset first, then the
     exact-named nested 'Mood' group, is what picks out one single button. */
  const moodGroup = page
    .getByRole('group', { name: 'Mood and energy' })
    .getByRole('group', { name: 'Mood', exact: true });

  await test.step('journal close correct — trigger close', async () => {
    await page.getByRole('button', { name: 'Close the day' }).click();
    /* Confirms the heuristic's first guess really is level 2 ('Low') before
       correcting it — otherwise this test could pass for the wrong reason. */
    await expect(moodGroup.getByRole('button', { name: 'Set Low' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  await test.step('journal close correct — pick a different mood', async () => {
    await moodGroup.getByRole('button', { name: 'Set Good' }).click();
    expect(vault.frontmatter(path).closed ?? null).toBeNull();
  });

  await test.step('journal close correct — accept', async () => {
    await page.getByRole('button', { name: 'Apply and close' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeHidden();
  });

  await test.step('journal close correct — disk carries the picked mood', async () => {
    await expect.poll(() => vault.frontmatter(path).closed).toBe(DATE_MOOD);
    expect(vault.frontmatter(path)['mood']).toBe(4);
  });
});

test('corrections survive leaving the journal and coming back', async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DATE_SURVIVE);
  const editedText = 'Mit Jonas die Filterleiste ueberarbeitet, Rueckmeldung ausstehend';

  await test.step('journal close correct — write the day', async () => {
    await openDay(page, DATE_SURVIVE);
    await writeDay(page, PROSE);
  });

  await test.step('journal close correct — trigger close and edit without accepting', async () => {
    await page.getByRole('button', { name: 'Close the day' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Todo text' }).fill(editedText);
    expect(vault.frontmatter(path).closed ?? null).toBeNull();
  });

  await test.step('journal close correct — navigate away and back', async () => {
    /* Not `openDay`: that helper waits for the day's own field to read empty,
       which only ever happens for a day nobody has written yet. This day
       already has a file (written above), so it gets a real row in the day
       list instead — same reopen path `journal-reopen.spec.ts` uses. */
    await page.locator('.sb-rail a[href="#/dashboard"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/dashboard');
    await page.locator('.sb-rail a[href="#/journal"]').click();
    await page.getByRole('button', { name: `Open the entry of ${DATE_SURVIVE}` }).click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe(`/journal?d=${DATE_SURVIVE}`);
  });

  await test.step('journal close correct — correction survives, nothing written', async () => {
    /* `close-proposal.ts`'s store is a module-level `Map`, not component
       state: the screen remounted (the rail navigation above unmounted it),
       but the entry for this date is still there. */
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Todo text' })).toHaveValue(editedText);
    expect(vault.frontmatter(path).closed ?? null).toBeNull();
  });
});

test('discarding a corrected proposal leaves the file byte-identical', async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DATE_DISCARD);
  const editedText = 'Mit Jonas eine kurze Zusammenfassung geschrieben';

  await test.step('journal close correct — write the day', async () => {
    await openDay(page, DATE_DISCARD);
    await writeDay(page, PROSE);
  });

  const before = vault.snapshot(path);

  await test.step('journal close correct — trigger close and correct a field', async () => {
    await page.getByRole('button', { name: 'Close the day' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Todo text' }).fill(editedText);
  });

  await test.step('journal close correct — discard', async () => {
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeHidden();
  });

  await test.step('journal close correct — file is byte-identical to before the close', async () => {
    expect(vault.snapshot(path).equals(before)).toBe(true);
  });
});
