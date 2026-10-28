/* Story 059, D6 — the whole Ctrl+K → reading path with the keyboard alone:
 * open the palette, reach the "show all results" entry, land on the full
 * result view, open the one hit, and follow a wikilink inside the reader.
 * Every step reuses a mechanism another deliverable already built and tested
 * by mouse (`CommandPalette.tsx`'s arrow-key roving, `SearchScreen.tsx`'s
 * roving on its query field, `ReaderScreen.tsx`'s heading focus and tabbable
 * links) — this spec is the proof that the same path also works end to end
 * without ever touching the mouse (AC6).
 *
 * Fixture and harness boilerplate mirror `reader.spec.ts`/
 * `search-results.spec.ts`: one throwaway vault for this whole file
 * (`test.use({ specId })`), a fixture doc written straight into `vaultPath`
 * with a unique search term, and `expect.poll` for the live index to catch
 * up with it — not instant after a fresh write.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

test.use({ specId: 'search-keyboard' });

/* A generic note with no dedicated home (`doc-home.ts`'s fallback) — the hit
   must land on the reader, not on some other screen, so the wikilink Tab
   step below has somewhere to run. The unique term is never used by the
   seeded vault, so it only ever finds this one fixture. */
const FIXTURE_PATH = 'notes/palette-keyboard-fixture-059.md';
const SEARCH_TERM = 'gastonctrlkfixture059';
const FIXTURE_TITLE = 'Palette keyboard fixture';

/* Real seed data (`scripts/seed/module-identity-pages.mjs`), the same target
   `reader.spec.ts` already uses for its own wikilink case. */
const WIKILINK_TARGET = 'identity-management/oauth2';
const WIKILINK_HOME =
  '/knowledge?m=identity-management&p=' +
  encodeURIComponent('modules/identity-management/wiki/entities/oauth2.md');

const FIXTURE_BODY = `---
type: note
title: ${FIXTURE_TITLE}
created: 2026-01-01
---

${SEARCH_TERM} is the one term only this fixture carries.

Background: [[${WIKILINK_TARGET}]] explains the OAuth flow this note leans on.
`;

test.beforeAll(async ({ vaultPath }) => {
  const full = join(vaultPath, FIXTURE_PATH);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, FIXTURE_BODY, 'utf8');
});

/** Presses ArrowDown until the palette's currently active item carries the
    given label — robust to exactly how many other entries (built-in commands
    still matching the typed text, hits not yet resolved by the live index)
    happen to sit ahead of the target, without ever touching the mouse.
    Bounded so a wiring regression fails fast instead of hanging forever. */
async function activatePaletteItem(page: Page, label: string): Promise<void> {
  const activeLabel = page.locator('.sb-palette-item[data-active="true"] .sb-palette-label');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await activeLabel.count()) > 0 && (await activeLabel.innerText()) === label) return;
    await page.keyboard.press('ArrowDown');
  }
  throw new Error(`could not reach the palette item "${label}" via ArrowDown`);
}

/** The `aria-label` of the currently focused element, or `null` — read via
    `page.evaluate` with a plain string expression (not a closure): this
    project's test tsconfig carries no `dom` lib, the same reason
    `reader.spec.ts`/`search-results.spec.ts` pass a string to `evaluate`
    rather than a real TS closure over `document`. A page-level string
    expression rather than a `Locator.evaluate` callback, since the target
    isn't known yet — it's identified by its own accessible name below. */
async function focusedAriaLabel(page: Page): Promise<string | null> {
  return page.evaluate(
    '(() => { const el = document.activeElement; return el ? el.getAttribute("aria-label") : null; })()',
  );
}

/** Presses Tab until the focused element's accessible name matches `label` —
    the keyboard-only equivalent of clicking a button found by that name.
    Bounded for the same reason `activatePaletteItem` is. */
async function tabToAriaLabel(page: Page, label: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await focusedAriaLabel(page)) === label) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`could not reach an element labelled "${label}" via Tab`);
}

test('Ctrl+K to reading a hit without the mouse', { tag: '@smoke' }, async ({ app }) => {
  const { page } = app;
  const showAllLabel = `Show all results for ${SEARCH_TERM}`;

  await test.step('Control+K opens the palette', async () => {
    // Not a mouse action: a freshly launched, automated page starts without
    // document focus, and Chromium withholds keydown dispatch from an
    // unfocused document — `.focus()` (not a click) is what a real, already
    // frontmost app window has for free the moment it's on screen.
    await page.locator('body').focus();
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Commands' })).toBeVisible();
  });

  await test.step('typing the fixture term surfaces "show all results" and the hit', async () => {
    await page.getByRole('textbox').fill(SEARCH_TERM);
    await expect(page.getByRole('button', { name: showAllLabel })).toBeVisible();
    // The live index needs a moment to notice the file `beforeAll` just wrote.
    await expect
      .poll(() => page.getByRole('button', { name: new RegExp(FIXTURE_TITLE) }).count(), {
        timeout: 15000,
      })
      .toBeGreaterThan(0);
  });

  await test.step('ArrowDown/Enter reach and activate "show all", landing on /search', async () => {
    await activatePaletteItem(page, showAllLabel);
    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.url().split('#')[1] ?? '')
      .toBe(`/search?q=${encodeURIComponent(SEARCH_TERM)}`);
  });

  await test.step('ArrowDown/Enter open the one hit from the full result view', async () => {
    await expect.poll(() => page.locator('.sb-searchresult').count(), { timeout: 15000 }).toBe(1);
    // Roving is scoped to the query field (`SearchScreen.tsx`), which
    // autofocuses on mount — no click needed to put focus there.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.url().split('#')[1] ?? '')
      .toBe(`/read?path=${encodeURIComponent(FIXTURE_PATH)}`);
  });

  await test.step('the reader heading takes focus on open (D4 behaviour holds when reached this way)', async () => {
    const heading = page.getByRole('heading', { level: 1, name: FIXTURE_TITLE });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
  });

  await test.step('Tab to the wikilink and Enter navigates via it', async () => {
    await tabToAriaLabel(page, `Open page ${WIKILINK_TARGET}`);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe(WIKILINK_HOME);
  });
});
