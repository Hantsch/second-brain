/* 058, D2 (AC1): the tray menu exists and offers the three actions.
 *
 * The real `Tray`/`Menu` only becomes reachable from a spec through the
 * `SB_E2E_TRAY=1` seam `tray.ts#publishForE2e` sets up: `globalThis.__SB_E2E_TRAY__`
 * carries the live `Tray` plus a getter for its current `Menu`, read here via
 * `app.evaluate` the same way `quit-during-run.spec.ts` drives a real
 * `BrowserWindow.close()`.
 *
 * The close/hide/quit-from-tray lifecycle (D3) is deliberately out of scope —
 * this file only proves the menu shape and the quick-capture action; a later
 * deliverable appends its own tests below without touching these. */

import { expect, test } from './fixtures/app';
import { clickTrayItem, closeMainWindow, mainWindowState } from './fixtures/tray';

test.use({ specId: 'tray' });

test('the tray menu offers open Gaston, quick capture and quit', async ({ app }) => {
  let items: { id: string | undefined; label: string }[] = [];

  await test.step('read the live tray menu template via the e2e handle', async () => {
    items = await app.app.evaluate(() => {
      const handle = (globalThis as { __SB_E2E_TRAY__?: { getMenu: () => Electron.Menu } })
        .__SB_E2E_TRAY__;
      if (!handle) throw new Error('no __SB_E2E_TRAY__ handle — is SB_E2E_TRAY set?');
      return handle.getMenu().items.map((item) => ({ id: item.id, label: item.label }));
    });
  });

  await test.step('it lists open, quick capture, a separator and quit, in that order', () => {
    expect(items.map((item) => item.id)).toEqual(['open', 'quick-capture', undefined, 'quit']);
    expect(items[0]?.label).toBe('Open Gaston');
    expect(items[1]?.label).toBe('Quick capture');
    expect(items[3]?.label).toBe('Quit Gaston');
  });
});

test('the quick-capture menu item opens the quick-capture window', async ({ app }) => {
  const opened = app.app.waitForEvent('window');

  await test.step('click the quick-capture item via the e2e handle', async () => {
    await app.app.evaluate(() => {
      const handle = (globalThis as { __SB_E2E_TRAY__?: { getMenu: () => Electron.Menu } })
        .__SB_E2E_TRAY__;
      if (!handle) throw new Error('no __SB_E2E_TRAY__ handle — is SB_E2E_TRAY set?');
      const item = handle.getMenu().items.find((entry) => entry.id === 'quick-capture');
      if (!item) throw new Error('no quick-capture item in the tray menu');
      item.click();
    });
  });

  await test.step('the quick-capture window opens', async () => {
    const capturePage = await opened;
    await capturePage.waitForLoadState('domcontentloaded');
    expect(capturePage.url()).toContain('quick-capture');
  });
});

/* 058, D3: the close/hide/quit lifecycle. Close-to-tray is on (the fixture's
   default, like a real install), so the window's × hides the app instead of
   quitting it. Order matters from here on: the tests share one app, and the
   last one quits it. */

/** The seeded vault's quick-capture chord (`scripts/seed/internal.mjs`). */
const QUICK_CAPTURE_CHORD = 'Control+Shift+Space';

test('closing the window keeps Gaston running in the tray, and the tray brings it back', async ({
  app,
}) => {
  await test.step('request a real window close', async () => {
    await closeMainWindow(app);
  });

  await test.step('the window is hidden, not closed, and nothing asked', async () => {
    await expect.poll(() => mainWindowState(app)).toEqual({ alive: true, visible: false });
    expect(app.page.isClosed()).toBe(false);
    await expect(app.page.getByRole('heading', { name: /^Still running/ })).toHaveCount(0);
  });

  await test.step('the tray item "open" brings the window back', async () => {
    await clickTrayItem(app, 'open');
    await expect.poll(() => mainWindowState(app)).toEqual({ alive: true, visible: true });
  });
});

test('with the window in the tray the quick-capture hotkey stays registered and quick capture still opens', async ({
  app,
}) => {
  const isRegistered = (): Promise<boolean> =>
    app.app.evaluate(
      ({ globalShortcut }, chord) => globalShortcut.isRegistered(chord),
      QUICK_CAPTURE_CHORD,
    );

  await test.step('the hotkey is registered to begin with', async () => {
    expect(await isRegistered(), `${QUICK_CAPTURE_CHORD} is claimed by another app`).toBe(true);
  });

  await test.step('close the window to the tray, and put away quick capture from before', async () => {
    await closeMainWindow(app);
    await expect.poll(() => mainWindowState(app)).toEqual({ alive: true, visible: false });
    /* The earlier test left quick capture open; hidden, it can prove it opens again. */
    await app.app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (window.webContents.getURL().includes('quick-capture')) window.hide();
      }
    });
  });

  await test.step('the hotkey is still registered', async () => {
    expect(await isRegistered()).toBe(true);
  });

  await test.step('quick capture opens from the tray', async () => {
    await clickTrayItem(app, 'quick-capture');
    await expect
      .poll(() =>
        app.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some(
            (window) => window.webContents.getURL().includes('quick-capture') && window.isVisible(),
          ),
        ),
      )
      .toBe(true);
  });
});

/* Must stay last: it ends the app every test above shares. */
test('quit from the tray ends the app', async ({ app }) => {
  const exited = app.app.waitForEvent('close');

  await test.step('click the tray item "quit"', async () => {
    /* Deferred: nothing is running, so this quit is not vetoed and the process
       ends — the evaluate has to return before it does. */
    await clickTrayItem(app, 'quit', { deferred: true });
  });

  await test.step('the app process ends', async () => {
    await exited;
  });
});
