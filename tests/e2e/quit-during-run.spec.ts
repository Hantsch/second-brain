/* Proves 074/AC4's user-facing half: closing the window while a maintenance
   run is going surfaces `QuitDuringRunDialog` (naming the running task kind),
   and cancelling out of it leaves both the run and the window alone.

   The import half of AC4 is no longer a gap: `quit-during-digestion.spec.ts`
   (050, D9) drives the same close into a running digestion, with the fake
   provider pinned and `SB_E2E_INGEST_DELAY_MS` holding the job at its phase
   boundary — the seam this spec's own harness note below was missing.

   The condensation half is still covered at the main/unit level by
   `tests/main/close-guard.test.ts` instead, and for the same, still-true
   reason: *this* spec's throwaway vault has no model configured, so nothing
   here can drive a condensation into `running`.

   Mirrors `gardener-run-cross-screen.spec.ts`'s seam: no model is configured
   in this harness (fixtures/app.ts), so the stage plan is just the ten
   mechanical checks, and `SB_E2E_STAGE_DELAY_MS` (066, D4) pauses between
   them so the run is still going by the time this spec drives a close
   through it.

   Nothing in this harness lets a spec click the title bar's × — the close
   request is instead driven the way `close-guard.ts` itself is wired: a real
   `BrowserWindow.close()` call in the main process (via `app.evaluate`),
   which fires the same native `close` event a real × click would. */

import { expect, test } from './fixtures/app';

/* closeToTray: false — this spec proves the window-close quit door (058, D-k), which
   only exists when close-to-tray is off; with it on, closing the window would just
   hide to the tray and never reach `QuitDuringRunDialog`. */
test.use({ specId: 'quit-during-run', stageDelayMs: 300, closeToTray: false });

test('closing the window during a maintenance run asks first, and cancelling leaves the run and window alone', async ({
  app,
}) => {
  const { page } = app;

  await test.step('start a run on the garden screen', async () => {
    await page.locator('.sb-rail a[href="#/garden"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/garden');
    await page
      .getByRole('button', { name: /^Check (now|again)$/ })
      .first()
      .click();
    await expect(page.getByRole('progressbar', { name: 'Check running' })).toBeVisible();
  });

  await test.step('request a real window close while the run is still going', async () => {
    const { mainWindowId } = app;
    if (mainWindowId === undefined) throw new Error('no main window id from the harness');
    await app.app.evaluate(({ BrowserWindow }, id) => {
      BrowserWindow.fromId(id)?.close();
    }, mainWindowId);
  });

  await test.step('the quit-confirmation prompt appears, naming the maintenance run', async () => {
    await expect(page.getByRole('heading', { name: 'Still running: Maintenance.' })).toBeVisible();
  });

  await test.step('cancel the prompt', async () => {
    /* Two buttons share the accessible name "Cancel": the dialog's own header
       × (its `aria-label` is `closeLabel`) and the footer's secondary button.
       The footer one is what a user actually reads as "Cancel" — it renders
       after the header in DOM order. */
    await page.getByRole('button', { name: 'Cancel' }).last().click();
  });

  await test.step('the prompt is gone, the run is still going, and the window is still open', async () => {
    await expect(page.getByRole('heading', { name: 'Still running: Maintenance.' })).toBeHidden();
    await expect(page.getByRole('progressbar', { name: 'Check running' })).toBeVisible();
    expect(page.isClosed()).toBe(false);
  });

  await test.step('stop the run so the app can close cleanly on teardown', async () => {
    await page.getByRole('button', { name: 'Cancel check' }).click();
    await expect(page.getByRole('progressbar', { name: 'Check running' })).toBeHidden();
  });
});
