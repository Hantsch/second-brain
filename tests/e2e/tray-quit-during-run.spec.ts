/* Proves 058/AC7: with the window hidden in the tray, the tray's "quit" during
   a maintenance run does not quit behind the user's back — it brings the
   hidden window back, surfaces `QuitDuringRunDialog` there, and cancelling
   leaves app, run and window alone.

   The counterpart of `quit-during-run.spec.ts`, which proves the window-close
   quit door and therefore pins `closeToTray: false`. This spec keeps the
   fixture's default (`true`, like a real install) on purpose: the × only hides
   the window here (058, D-c — a hide never asks), so the one quit door left is
   the tray's, and that is the door under test.

   Same seam as `quit-during-run.spec.ts`: no model is configured in this
   harness, so the stage plan is just the mechanical checks, and
   `SB_E2E_STAGE_DELAY_MS` keeps the run going long enough to drive a close
   and a quit into it. The close is a real `BrowserWindow.close()` and the quit
   a real click on the live tray menu item, both via `app.evaluate`
   (`fixtures/tray.ts`). */

import { expect, test } from './fixtures/app';
import { clickTrayItem, closeMainWindow, mainWindowState } from './fixtures/tray';

test.use({ specId: 'tray-quit-during-run', stageDelayMs: 300 });

test('quitting from the tray during a maintenance run surfaces the hidden window and asks first; cancelling keeps app, run and window', async ({
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

  await test.step('close the window to the tray — it hides and asks nothing', async () => {
    await closeMainWindow(app);
    await expect.poll(() => mainWindowState(app)).toEqual({ alive: true, visible: false });
    await expect(page.getByRole('heading', { name: 'Still running: Maintenance.' })).toBeHidden();
  });

  await test.step('quit from the tray while the run is still going', async () => {
    /* Not deferred: this quit is vetoed, so the process stays and the evaluate
       returns normally. */
    await clickTrayItem(app, 'quit');
  });

  await test.step('the hidden window comes back with the quit-confirmation prompt', async () => {
    await expect(page.getByRole('heading', { name: 'Still running: Maintenance.' })).toBeVisible();
    await expect.poll(() => mainWindowState(app)).toEqual({ alive: true, visible: true });
  });

  await test.step('cancel the prompt', async () => {
    /* The footer's "Cancel", not the header × sharing its accessible name —
       see `quit-during-run.spec.ts`. */
    await page.getByRole('button', { name: 'Cancel' }).last().click();
  });

  await test.step('the prompt is gone, the run is still going, and the app is still up', async () => {
    await expect(page.getByRole('heading', { name: 'Still running: Maintenance.' })).toBeHidden();
    await expect(page.getByRole('progressbar', { name: 'Check running' })).toBeVisible();
    expect(page.isClosed()).toBe(false);
    await expect.poll(() => mainWindowState(app)).toEqual({ alive: true, visible: true });
  });

  await test.step('stop the run so the app can close cleanly on teardown', async () => {
    await page.getByRole('button', { name: 'Cancel check' }).click();
    await expect(page.getByRole('progressbar', { name: 'Check running' })).toBeHidden();
  });
});
