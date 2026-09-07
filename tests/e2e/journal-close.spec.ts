/* Proves the day close-out as a proposal-then-accept flow (049, guardrail 2
   of CLAUDE.md): the heuristic finds something in a seeded day's prose, the
   card shows it before anything is written, and only "Apply and close"
   actually touches the file — with exactly what the card showed.

   No model is configured in this harness (see fixtures/app.ts), so every
   assertion here exercises the no-model fallback
   (`core/journal/close.ts#closeDay` via `core/capture/tasks#heuristicTasks`
   and `core/journal/facts.ts#heuristicFacts`), never a real LLM call.

   Two seeded days, not one, because both tests run against the same
   worker-scoped app/vault (see fixtures/app.ts) — reusing a day would let the
   first test's accept close the day the second test still needs open. Both
   days are picked from scripts/seed/journal.mjs for the same reason: their
   prose is plain reported speech with no explicit checkbox, so the heuristic
   has to find a sentence-shaped todo on its own, which is exactly what the
   proposal is supposed to preview. */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/vault';

test.use({ specId: 'journal-close' });

/** Local calendar day, `offsetDays` away from today — the same arithmetic the
    seeder (`scripts/seed/lib.mjs#createClock`) and the day list itself
    (`DayList.tsx#todayIso`) use. Never `Date.toISOString()`: that crosses
    midnight in any zone west of UTC and would point at the wrong file. */
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

/* offset -8: "Mit Jonas über die Filterleiste gesprochen. [...] eine Stelle
   weniger, an der Berechtigungen geprüft werden." The heuristic
   (`core/capture/signals.ts#isTask`) reads both as todo-shaped sentences —
   no model needed to find them. */
const DAY_A = isoDayOffset(-8);
const TODO_A1 = 'Mit Jonas über die Filterleiste gesprochen';
const TODO_A2 = 'Eine Stelle weniger, an der Berechtigungen geprüft werden';

/* offset -16: "[...] Projekt auf pausiert, statt es weiterzuschleppen." — a
   second, independent day so the two tests never race for the same file. */
const DAY_B = isoDayOffset(-16);
const TODO_B1 = 'Projekt auf pausiert, statt es weiterzuschleppen';

async function openDay(page: Page, date: string): Promise<void> {
  await page.locator('.sb-rail a[href="#/journal"]').click();
  await page.getByRole('button', { name: `Open the entry of ${date}` }).click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe(`/journal?d=${date}`);
}

test('the accepted change is on disk, not only in the DOM', async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DAY_A);

  await test.step('journal close — open seeded day entry', async () => {
    await openDay(page, DAY_A);
    await expect(page.getByRole('button', { name: 'Close the day' })).toBeVisible();
  });

  await test.step('journal close — trigger close', async () => {
    await page.getByRole('button', { name: 'Close the day' }).click();
  });

  await test.step('journal close — proposal visible, file unchanged', async () => {
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeVisible();
    /* The native checkbox is visually replaced by `.gs-check-box` (see
       `atoms/Checkbox.tsx`), so it isn't itself painted — `toBeChecked`
       still proves the row for this exact todo text is there and kept. */
    await expect(page.getByRole('checkbox', { name: TODO_A1 })).toBeChecked();
    /* AC3: the disk, not the DOM, is the proof that nothing has been written
       yet — read directly through the vault fixture. */
    expect(vault.frontmatter(path).closed ?? null).toBeNull();
    expect(vault.readNote(path)).not.toContain('## Fakten');
  });

  await test.step('journal close — accept', async () => {
    await page.getByRole('button', { name: 'Apply and close' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeHidden();
  });

  await test.step('journal close — disk matches preview', async () => {
    await expect.poll(() => vault.frontmatter(path).closed).toBe(DAY_A);
    const body = vault.readNote(path);
    expect(body).toContain('## Fakten');
    expect(body).toContain(`- [ ] ${TODO_A1}`);
    expect(body).toContain(`- [ ] ${TODO_A2}`);
  });
});

test('nothing is written before accept, exactly the preview after', async ({ app, vault }) => {
  const { page } = app;
  const path = dayPath(DAY_B);

  await test.step('journal close — open seeded day entry', async () => {
    await openDay(page, DAY_B);
    await expect(page.getByRole('button', { name: 'Close the day' })).toBeVisible();
  });

  const before = vault.snapshot(path);

  await test.step('journal close — trigger close', async () => {
    await page.getByRole('button', { name: 'Close the day' }).click();
  });

  await test.step('journal close — proposal visible, file unchanged', async () => {
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeVisible();
    /* The checkbox's own accessible name IS the proposed todo text (see
       `atoms/Checkbox.tsx`: `label` becomes the wrapping `<label>`'s text) —
       reading it here proves the card really previews this exact sentence,
       not a stand-in. The native input itself is visually replaced by
       `.gs-check-box`, so `toBeChecked` is the right assertion, not
       `toBeVisible`. */
    await expect(page.getByRole('checkbox', { name: TODO_B1 })).toBeChecked();
    /* AC4, half one: a byte-for-byte comparison against the snapshot taken
       before the trigger — a stronger claim than "still exists" or "still
       parses", and the whole point of guardrail 2 (nothing moves before
       accept). */
    expect(vault.snapshot(path).equals(before)).toBe(true);
  });

  await test.step('journal close — accept', async () => {
    await page.getByRole('button', { name: 'Apply and close' }).click();
    await expect(page.getByRole('button', { name: 'Apply and close' })).toBeHidden();
  });

  await test.step('journal close — disk matches preview', async () => {
    /* AC4, half two: what actually landed on disk is exactly the sentence
       the card showed before accept — not a re-derived or re-run guess. */
    await expect.poll(() => vault.frontmatter(path).closed).toBe(DAY_B);
    const body = vault.readNote(path);
    expect(body).toContain('## Fakten');
    expect(body).toContain(`- [ ] ${TODO_B1}`);
  });
});
