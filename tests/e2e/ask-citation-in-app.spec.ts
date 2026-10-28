/* Story 059, D7 — a citation in an ask answer opens in the app.
 *
 * The harness has no model (fixtures/app.ts), so `askQuestion` falls back to
 * the matching passages: the answer is the no-model note plus a citation list
 * built from the excerpts (`citationsFromExcerpts`) — real, validated
 * citations, no fake provider needed. Without prose there is no `[1]` mark in
 * the text; the list entry's "see evidence in context" is the way into
 * `CitationPanel` here, the same `showCitation` a mark calls.
 *
 * The cited page is `Token-Lebensdauer` from the seeded `identity-management`
 * module (`scripts/seed/module-identity-pages.mjs`); the question is picked so
 * it is among the passages, and the entry is found by its path rather than by
 * its rank, so the spec does not depend on the ranking order.
 *
 * "Never asked the OS" is observed by replacing `shell.openPath` in the main
 * process with a recorder — the technique `reader.spec.ts` uses. Unlike there
 * the recorder does not call through: this spec asserts the call never
 * happens, and a regression must not open a real editor on the test machine.
 */

import { expect, test } from './fixtures/app';

test.use({ specId: 'ask-citation-in-app' });

const QUESTION = 'Wie lange leben Access-Token?';
const CITED_PATH = 'modules/identity-management/wiki/concepts/token-lebensdauer.md';
const CITED_TITLE = 'Token-Lebensdauer';
/* `homeOf` for a wiki page (`src/renderer/lib/doc-home.ts`), spelled out as
   `reader.spec.ts` does — the address is what the user ends up on. */
const CITED_HOME = '/knowledge?m=identity-management&p=' + encodeURIComponent(CITED_PATH);

/** The field this spec's `globalThis` patch stashes calls into. */
interface OpenPathRecorder {
  sbOpenPathCalls?: string[];
}

test('a citation opens in the app, not in the OS editor', { tag: '@smoke' }, async ({ app }) => {
  const { page } = app;

  await test.step('setup — record shell.openPath in the main process, never call it', async () => {
    await app.app.evaluate(({ shell }) => {
      const store = globalThis as typeof globalThis & OpenPathRecorder;
      store.sbOpenPathCalls = [];
      shell.openPath = (path: string) => {
        store.sbOpenPathCalls?.push(path);
        return Promise.resolve('');
      };
    });
  });

  const overlay = page.getByRole('dialog', { name: 'Ask' });

  await test.step('ask — the no-model answer lists its citations', async () => {
    /* A string, not a closure: e2e specs compile without the DOM lib. */
    await page.evaluate('location.hash = "#/ask"');
    await expect(overlay).toBeVisible();
    await overlay.getByLabel('Your question').fill(QUESTION);
    await overlay.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(overlay.getByRole('list', { name: 'Evidence' }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  await test.step('citation — the evidence view opens with both exits', async () => {
    const entry = overlay.locator('li.sb-cite').filter({ hasText: CITED_PATH }).first();
    await expect(entry).toBeVisible();
    await entry.getByRole('button', { name: /^See evidence \d+ in context$/ }).click();

    const panel = page.getByRole('dialog', { name: CITED_TITLE });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Open externally' })).toBeVisible();
    await panel.getByRole('button', { name: 'Open in app' }).click();
  });

  await test.step('in app — the page’s home shows, the overlay is gone, the OS was not asked', async () => {
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe(CITED_HOME);
    await expect(page.getByRole('heading', { name: CITED_TITLE }).first()).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Ask' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: CITED_TITLE })).toHaveCount(0);

    const calls = await app.app.evaluate(
      () => (globalThis as typeof globalThis & OpenPathRecorder).sbOpenPathCalls,
    );
    expect(calls).toEqual([]);
  });
});
