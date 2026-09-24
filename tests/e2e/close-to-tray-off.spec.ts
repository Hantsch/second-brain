/* 058, D6: the two tray switches live in Settings → Customization (AC5), and
   turning "keep running in the tray" off there really changes the window
   close's real-world effect (AC2) — nothing in this deliverable touches the
   main-process lifecycle itself (058, D1-D5 already wired it up to read these
   settings live), only the UI to change them.

   `closeToTray` stays at the fixture's default (`true`, like a real install)
   for the whole file — this spec turns it off through the UI at runtime, the
   same door a user has, rather than through a worker option that would skip
   the very thing under test.

   Order matters: the first test only reads the tab, the second flips the
   switch and ends the app, so it must run last. */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

test.use({ specId: 'close-to-tray-off' });

async function openCustomizationTab(page: Page): Promise<void> {
  await page.locator('.sb-rail a[href="#/settings"]').click();
  await page.getByRole('tab', { name: 'Customization' }).click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/settings?tab=customization');
}

test('both tray switches are in settings, each stating its behaviour', async ({ app }) => {
  const { page } = app;

  await test.step('open settings → customization', async () => {
    await openCustomizationTab(page);
  });

  await test.step('the keep-in-tray switch and its hint are visible', async () => {
    /* `toBeAttached`, not `toBeVisible`: the Gaston `Switch` atom's native
       `<input>` is visually hidden by design (`.gs-switch input` — position
       absolute, zero size, opacity 0) with a custom `.gs-switch-track` drawn
       next to it — the same pattern every switch in the app uses. The
       accessible name still carries the label text, and the hint text below
       is a plain, visible span — that's what "states its behaviour" checks. */
    await expect(
      page.getByRole('switch', {
        name: /^Keep running in the tray when the window closes/,
      }),
    ).toBeAttached();
    await expect(
      page.getByText(
        'Closing the window leaves Gaston running in the tray — the hotkey, reminders and quick capture keep working.',
      ),
    ).toBeVisible();
  });

  await test.step('the start-in-tray switch and its hint are visible', async () => {
    await expect(page.getByRole('switch', { name: /^Start in the tray/ })).toBeAttached();
    await expect(
      page.getByText('Gaston starts hidden in the tray instead of opening the window.'),
    ).toBeVisible();
  });
});

/* Must stay last: it turns off close-to-tray and then really quits the app
   every test in this file shares. */
test('with keep-in-tray switched off in settings, closing the window quits the app', async ({
  app,
}) => {
  const { page } = app;

  await test.step('open settings → customization', async () => {
    await openCustomizationTab(page);
  });

  const closeToTraySwitch = page.getByRole('switch', {
    name: /^Keep running in the tray when the window closes/,
  });
  /* The native input has zero size by design (see the comment in the test
     above), so even a forced click has no real point to land on — Playwright
     reports it as outside the viewport. Its wrapping `<label>` is the actual
     visible, correctly sized click target; native `<label>` semantics forward
     the click to the input it wraps, exactly like a real user clicking the
     drawn track. */
  const closeToTrayLabel = page.locator('label.gs-switch').filter({ has: closeToTraySwitch });

  await test.step('turn "keep running in the tray" off — a real settings:setApp write', async () => {
    await closeToTrayLabel.click();
    await expect(closeToTraySwitch).not.toBeChecked();
  });

  await test.step('request a real window close — with the tray door gone this quits the app', async () => {
    const exited = app.app.waitForEvent('close');
    const { mainWindowId } = app;
    if (mainWindowId === undefined) throw new Error('no main window id from the harness');
    /* Deferred like the tray's own "quit" click (`fixtures/tray.ts#clickTrayItem`
       with `{ deferred: true }`): with close-to-tray now off and no maintenance
       run going, nothing vetoes this close, so it carries the process all the
       way to exit — the click has to be scheduled past the evaluate's own
       return, or the round trip would race the process going away. */
    await app.app.evaluate(({ BrowserWindow }, id) => {
      setTimeout(() => BrowserWindow.fromId(id)?.close(), 0);
    }, mainWindowId);
    await exited;
  });
});
