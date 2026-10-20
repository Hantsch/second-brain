/* The tray icon (058, D2): stays alive in the background, offers the same
   quick-capture path as the global hotkey, and gives the window back.

   The menu template is a pure function (`trayMenuTemplate`) so it can be unit
   tested without a real `Tray`/`Menu` — the only Electron-touching code here
   is `createAppTray`, which wires that template to a real menu and rebuilds
   it whenever the UI language changes (mirrors `reminder-notify.ts`'s
   settings-driven rebuild). */

import { Menu, Tray, app } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { appIconPath } from './app-icon';
import { APP_NAME } from './app-identity';
import { triggerQuickCapture } from './hotkey';
import { trayLabels } from './messages';
import { showMainWindow } from './show-main-window';
import type { UiLanguage } from '@shared/types';
import type { Services } from './services';

export interface TrayActions {
  open: () => void;
  quickCapture: () => void;
  quit: () => void;
}

/**
 * Pure and exported so the menu shape can be unit tested without a real
 * Electron `Menu`. Item ids are stable (`open`, `quick-capture`, `quit`) —
 * both the e2e harness and this test suite drive the template by id, not by
 * label, so a wording change never breaks either.
 */
export function trayMenuTemplate(
  language: UiLanguage,
  actions: TrayActions,
): MenuItemConstructorOptions[] {
  const labels = trayLabels(language);
  return [
    { id: 'open', label: labels.open, click: () => actions.open() },
    { id: 'quick-capture', label: labels.quickCapture, click: () => actions.quickCapture() },
    { type: 'separator' },
    { id: 'quit', label: labels.quit, click: () => actions.quit() },
  ];
}

function actionsFor(services: Services): TrayActions {
  return {
    open: () => showMainWindow(services),
    quickCapture: () => triggerQuickCapture(services),
    quit: () => app.quit(),
  };
}

function buildMenu(services: Services): Menu {
  const language = services.settings.uiLanguage();
  return Menu.buildFromTemplate(trayMenuTemplate(language, actionsFor(services)));
}

/* Only ever set when the e2e harness asked for it (`SB_E2E_TRAY=1`, never in
   production) — the seam `tests/e2e/tray.spec.ts` drives the real `Tray`/`Menu`
   through, the same style as `SB_E2E_STAGE_DELAY_MS` (`ipc/gardener-run.ts`). */
declare global {
  var __SB_E2E_TRAY__: { tray: Tray; getMenu: () => Menu } | undefined;
}

function publishForE2e(tray: Tray, currentMenu: () => Menu): void {
  if (process.env['SB_E2E_TRAY'] !== '1') return;
  globalThis.__SB_E2E_TRAY__ = { tray, getMenu: currentMenu };
}

/** Builds the tray icon and its menu, and keeps the labels in sync with the
    UI language setting and the icon with `customization.appIcon`. Returns the `Tray` so the caller can hold a reference
    (a GC'd `Tray` silently disappears) and destroy it on quit. */
export function createAppTray(services: Services): Tray {
  const icon = appIconPath(services.settings.app().customization.appIcon);
  const tray = new Tray(icon);
  tray.setToolTip(APP_NAME);

  let menu = buildMenu(services);
  tray.setContextMenu(menu);
  tray.on('click', () => showMainWindow(services));

  services.settings.onChange(({ app: settings }) => {
    /* A settings save can land after `will-quit` destroyed the tray. */
    if (tray.isDestroyed()) return;
    menu = buildMenu(services);
    tray.setContextMenu(menu);
    tray.setImage(appIconPath(settings.customization.appIcon));
  });

  publishForE2e(tray, () => menu);
  return tray;
}
