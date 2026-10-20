/* 058, D4/AC5: `startMinimized` gives the window back through the tray, and a
 * second app start (the single-instance lock's second-instance handler) shows
 * it too. The no-tray fallback (D-f) is covered at the unit level instead
 * (`tests/main/start-hidden.test.ts`) — this harness always creates a real
 * tray (`SB_E2E_TRAY=1`), so there is no way to exercise "no tray" here.
 *
 * One test, in steps rather than two separate `test` blocks: both criteria
 * build on the same hidden-at-launch state, and re-deriving it a second time
 * would mean hiding the window again mid-file for no benefit — the worker-scoped
 * `app` fixture is shared for the whole spec file either way.
 */

import { join } from 'node:path';
import { expect, launchSecondInstance, test } from './fixtures/app';
import { clickTrayItem, closeMainWindow, mainWindowState } from './fixtures/tray';

test.use({ specId: 'start-minimized', startMinimized: true });

test('with start in the tray the window stays hidden until the tray opens it, and a second app start shows it', async ({
  app,
  tempRoot,
}) => {
  await test.step('the window starts hidden', async () => {
    /* The window is `show: false` from construction, so "not visible" right
       after launch proves nothing — `ready-to-show` may simply not have fired
       yet. Wait until the renderer has loaded and rendered its shell (a hidden
       window still paints, which is what fires `ready-to-show`), then give the
       show decision a moment, and only then check it once: a poll would pass on
       the first too-early sample and never see a late `show()`. */
    await app.page.waitForLoadState('load');
    await expect
      .poll(() => app.page.evaluate('document.querySelector(".sb-rail") !== null'))
      .toBe(true);
    await app.page.waitForTimeout(500);
    expect(await mainWindowState(app)).toEqual({ alive: true, visible: false });
  });

  await test.step('the tray item "open" brings the window back', async () => {
    await clickTrayItem(app, 'open');
    await expect.poll(() => mainWindowState(app)).toEqual({ alive: true, visible: true });
  });

  await test.step('close it back to the tray so a second start has something to show', async () => {
    /* Close-to-tray stays at the fixture's default (true), same as a real
       install: this hides the window rather than closing it, exactly the
       "reachable from the tray" state a second start is meant to recover. */
    await closeMainWindow(app);
    await expect.poll(() => mainWindowState(app)).toEqual({ alive: true, visible: false });
  });

  await test.step('a second app start against the same userData shows the window', async () => {
    /* Same subpath `fixtures/app.ts#app` writes its own userData directory under
       (`prepareUserData(join(tempRoot, 'userdata'), ...)`) — the single-instance
       lock is keyed on this directory, not on any value this fixture exposes
       separately. */
    const userDataDir = join(tempRoot, 'userdata');
    const exitCode = await launchSecondInstance(userDataDir);
    expect(exitCode).toBe(0);

    await expect.poll(() => mainWindowState(app)).toEqual({ alive: true, visible: true });
  });
});
