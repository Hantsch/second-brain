/* The tray and window steps the close-to-tray specs (058, D3) share —
 * `tray.spec.ts` and `tray-quit-during-run.spec.ts` drive the same three
 * things, so they live once here instead of being copied into both.
 *
 * Every helper runs in the main process via `app.evaluate`: the tray goes
 * through the `SB_E2E_TRAY=1` handle `tray.ts#publishForE2e` publishes, the
 * window close is a real `BrowserWindow.close()` — the same native `close` a
 * title-bar × fires (see `quit-during-run.spec.ts`). */

import type { AppSession } from '../../../scripts/lib/app-harness.mjs';
import { evaluateMain } from '../../../scripts/lib/app-harness.mjs';

export type TrayItemId = 'open' | 'quick-capture' | 'quit';

function requireMainWindowId(app: AppSession): number {
  const { mainWindowId } = app;
  if (mainWindowId === undefined) throw new Error('no main window id from the harness');
  return mainWindowId;
}

/**
 * Clicks one tray menu item by id. `deferred` defers the click past the
 * evaluate's own return — needed for a click that ends the process (`quit`
 * with nothing to veto), or the evaluate would never get its answer back.
 */
export async function clickTrayItem(
  app: AppSession,
  id: TrayItemId,
  { deferred = false }: { deferred?: boolean } = {},
): Promise<void> {
  await evaluateMain(
    app.app,
    (_electron, args) => {
      const handle = (globalThis as { __SB_E2E_TRAY__?: { getMenu: () => Electron.Menu } })
        .__SB_E2E_TRAY__;
      if (!handle) throw new Error('no __SB_E2E_TRAY__ handle — is SB_E2E_TRAY set?');
      const item = handle.getMenu().items.find((entry) => entry.id === args.id);
      if (!item) throw new Error(`no ${args.id} item in the tray menu`);
      if (args.deferred) setTimeout(() => item.click(), 0);
      else item.click();
    },
    { id, deferred },
  );
}

/** A real close of the main window, as the title bar's × would request it. */
export async function closeMainWindow(app: AppSession): Promise<void> {
  await evaluateMain(
    app.app,
    ({ BrowserWindow }, id) => {
      BrowserWindow.fromId(id)?.close();
    },
    requireMainWindowId(app),
  );
}

/** The main window's state: `alive` false once it is destroyed. */
export async function mainWindowState(
  app: AppSession,
): Promise<{ alive: boolean; visible: boolean }> {
  return evaluateMain(
    app.app,
    ({ BrowserWindow }, id) => {
      const window = BrowserWindow.fromId(id);
      if (!window || window.isDestroyed()) return { alive: false, visible: false };
      return { alive: true, visible: window.isVisible() };
    },
    requireMainWindowId(app),
  );
}

/** Hides every quick-capture window, so a test can prove it opens (is shown) again. */
export async function hideQuickCapture(app: AppSession): Promise<void> {
  await evaluateMain(app.app, ({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents.getURL().includes('quick-capture')) window.hide();
    }
  });
}

/** Whether a quick-capture window exists and is currently shown. */
export async function quickCaptureVisible(app: AppSession): Promise<boolean> {
  return evaluateMain(app.app, ({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (window) => window.webContents.getURL().includes('quick-capture') && window.isVisible(),
    ),
  );
}
