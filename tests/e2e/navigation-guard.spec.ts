/* Proves the fix from the outside: today, before this seam, any non-file URL
   is handed to `shell.openExternal` regardless of scheme, and a `file://`
   navigation to an arbitrary path is not blocked at all. Against the built
   app, a navigation attempt to an arbitrary `file://` path must leave the
   app on its own page — the shell keeps rendering, nothing external opens. */

import { expect, test } from './fixtures/vault';

test.use({ specId: 'navigation-guard' });

test('a file:// navigation attempt leaves the app on its own page', async ({ app }) => {
  const { page } = app;

  await test.step('startup — the shell renders', async () => {
    await expect(page.locator('.sb-rail')).toBeVisible();
  });

  const urlBefore = page.url();

  await test.step('navigating to an arbitrary file:// path is blocked', async () => {
    /* As an expression string, not a closure: e2e specs compile against
       tsconfig.node.json, which carries no DOM lib (settings-models-dead-end.spec.ts
       does the same for the same reason). */
    await page.evaluate("location.href = 'file:///etc/passwd'");
    /* Give a real (blocked) navigation attempt a moment to have failed to
       take effect, rather than asserting on the very next tick. */
    await page.waitForTimeout(300);
  });

  await test.step('the app is still on its own page and still usable', async () => {
    expect(page.url()).toBe(urlBefore);
    /* Not a locator assertion: Chromium leaves the frame's loading state
       looking mid-navigation after a `will-navigate` is cancelled, which
       makes Playwright's actionability wait ("waiting for navigation to
       finish") stall forever even though the DOM never changed. A direct
       `evaluate` reads the DOM without going through that wait. */
    await expect
      .poll(() => page.evaluate('document.querySelector(".sb-rail") !== null'))
      .toBe(true);
    await page.evaluate(
      '(() => { const link = document.querySelector(\'.sb-rail a[href="#/projects"]\'); link && link.click(); })()',
    );
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/projects');
  });
});
