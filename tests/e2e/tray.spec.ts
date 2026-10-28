/* 058, D2 (AC1): the tray menu exists and offers the three actions.
 *
 * The real `Tray`/`Menu` only becomes reachable from a spec through the
 * `SB_E2E_TRAY=1` seam `tray.ts#publishForE2e` sets up: `globalThis.__SB_E2E_TRAY__`
 * carries the live `Tray` plus a getter for its current `Menu`, read here via
 * `app.evaluate` the same way `quit-during-run.spec.ts` drives a real
 * `BrowserWindow.close()`.
 *
 * This file covers the menu, quick capture and close-to-tray (on, like a real
 * install, so the window's × hides the app). Quit lives in tray-quit.spec.ts. */

import { evaluateMain } from '../../scripts/lib/app-harness.mjs';
import { E2E_HOTKEY_CHORD, expect, test } from './fixtures/app';
import {
  clickTrayItem,
  closeMainWindow,
  hideQuickCapture,
  mainWindowState,
  quickCaptureVisible,
} from './fixtures/tray';

test.use({ specId: 'tray', hotkey: true });

test('the tray menu offers open Gaston, quick capture and quit', async ({ app }) => {
  let items: { id: string | undefined; label: string }[] = [];

  await test.step('read the live tray menu template via the e2e handle', async () => {
    items = await evaluateMain(app.app, () => {
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
  await hideQuickCapture(app);

  await test.step('click the quick-capture item via the e2e handle', async () => {
    await evaluateMain(app.app, () => {
      const handle = (globalThis as { __SB_E2E_TRAY__?: { getMenu: () => Electron.Menu } })
        .__SB_E2E_TRAY__;
      if (!handle) throw new Error('no __SB_E2E_TRAY__ handle — is SB_E2E_TRAY set?');
      const item = handle.getMenu().items.find((entry) => entry.id === 'quick-capture');
      if (!item) throw new Error('no quick-capture item in the tray menu');
      item.click();
    });
  });

  await test.step('the quick-capture window opens', async () => {
    await expect.poll(() => quickCaptureVisible(app)).toBe(true);
  });
});

/** The chord the fixture pins for a `hotkey: true` spec — not the seeded default,
   which the developer's own Gaston usually holds while the suite runs. */
const QUICK_CAPTURE_CHORD = E2E_HOTKEY_CHORD;

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
    evaluateMain(
      app.app,
      ({ globalShortcut }, chord) => globalShortcut.isRegistered(chord),
      QUICK_CAPTURE_CHORD,
    );

  await test.step('the hotkey is registered to begin with', async () => {
    /* Polled: the app registers it only once the vault is open, which under a
       full suite run can land after this test starts. */
    await expect
      .poll(isRegistered, { message: `${QUICK_CAPTURE_CHORD} is claimed by another app` })
      .toBe(true);
  });

  await test.step('close the window to the tray, and put away quick capture from before', async () => {
    await closeMainWindow(app);
    await expect.poll(() => mainWindowState(app)).toEqual({ alive: true, visible: false });
    await hideQuickCapture(app);
  });

  await test.step('the hotkey is still registered', async () => {
    expect(await isRegistered()).toBe(true);
  });

  await test.step('quick capture opens from the tray', async () => {
    await clickTrayItem(app, 'quick-capture');
    await expect.poll(() => quickCaptureVisible(app)).toBe(true);
  });
});
