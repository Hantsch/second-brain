/* Das Hauptfenster. Rahmenlos mit eigener Titelzeile, dunkel schon vor dem
   ersten Frame, und erst sichtbar, wenn wirklich etwas zu sehen ist. */

import { BrowserWindow, screen } from 'electron';
import type { WindowBounds } from '@shared/types';
import { APP_ID, APP_NAME } from './app-identity';
import { appIconPath } from './app-icon';
import { clampBounds } from './bounds';
import { attachNavigationGuards } from './navigation';
import { WINDOW_MIN } from './settings-defaults';
import { isDev, loadPage, preloadPath } from './renderer-entry';
import type { Services } from './services';

/** Seitenhintergrund aus den Gaston-Tokens — verhindert das weiße Aufblitzen. */
const BACKGROUND = '#0A0F16';
const SAVE_DEBOUNCE_MS = 400;

function workAreas(): { x: number; y: number; width: number; height: number }[] {
  return screen.getAllDisplays().map((display) => display.workArea);
}

export interface CreateMainWindowOptions {
  /** Whether a tray exists to bring the window back through (058, D-f). Defaults to
   * `false`, so every call site that doesn't explicitly opt in — a fresh window built
   * for `activate`, or a test harness — keeps today's behaviour of never starting
   * hidden. */
  canStartHidden?: boolean;
}

/**
 * Whether the window should start hidden: only when the user asked for it *and*
 * there is a way back (a tray). Pure so it needs no `BrowserWindow` to test — the
 * no-tray fallback (058, D-f) is exactly the soft-lock finding 3.5 describes.
 */
export function shouldStartHidden(startMinimized: boolean, canStartHidden: boolean): boolean {
  return startMinimized && canStartHidden;
}

export function createMainWindow(
  services: Services,
  options: CreateMainWindowOptions = {},
): BrowserWindow {
  const saved = services.settings.app().window;
  const bounds = clampBounds(saved, workAreas(), WINDOW_MIN);

  const window = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    ...(bounds.x !== undefined && bounds.y !== undefined ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: WINDOW_MIN.width,
    minHeight: WINDOW_MIN.height,
    show: false,
    frame: false,
    backgroundColor: BACKGROUND,
    icon: appIconPath(services.settings.app().customization.appIcon),
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
    },
  });

  /* Whether the window has ever actually been shown — flips once, on the real
     `show` event, regardless of what triggered it (the block below, or a later
     `showMainWindow()` bringing it back from the tray). `attachBoundsPersistence`
     needs this: a window that started hidden was deliberately never maximized
     either (see the comment below), so `isMaximized()` before this flips would
     read a false `false` and overwrite the saved setting for good. */
  let becameVisible = false;
  window.once('show', () => {
    becameVisible = true;
  });

  window.once('ready-to-show', () => {
    const startMinimized = services.settings.app().startMinimized;
    if (shouldStartHidden(startMinimized, options.canStartHidden ?? false)) return;
    /* `maximize()` shows a hidden window as a side effect, so it may only run on
       the path that shows it anyway — a hidden start drops the maximized state. */
    if (saved.maximized) window.maximize();
    window.show();
  });

  attachBoundsPersistence(window, services, saved.maximized ?? false, () => becameVisible);
  const stopIconSync = services.settings.onChange(({ app: settings }) => {
    const icon = appIconPath(settings.customization.appIcon);
    window.setIcon(icon);
    if (process.platform === 'win32') {
      window.setAppDetails({ appId: APP_ID, appIconPath: icon, appIconIndex: 0 });
    }
  });
  if (process.platform === 'win32') {
    const icon = appIconPath(services.settings.app().customization.appIcon);
    window.setAppDetails({ appId: APP_ID, appIconPath: icon, appIconIndex: 0 });
  }
  window.once('closed', stopIconSync);
  attachNavigationGuards(window);
  if (isDev()) attachDevToolsShortcut(window);

  loadPage(window, 'index');
  return window;
}

/** Position und Größe merken — gedrosselt, damit Ziehen nicht dauernd schreibt.
    `initialMaximized`/`wasShown` cover the hidden-start case: a window that
    starts hidden is deliberately never given its saved maximized state (058,
    D-f — `maximize()` would show it), so `isMaximized()` would read `false`
    even though nothing about the user's preference changed; the saved value
    is kept as-is until the window has genuinely been shown at least once. */
function attachBoundsPersistence(
  window: BrowserWindow,
  services: Services,
  initialMaximized: boolean,
  wasShown: () => boolean,
): void {
  let timer: NodeJS.Timeout | null = null;
  const persist = (): void => {
    if (window.isDestroyed()) return;
    const normal = window.getNormalBounds();
    const next: WindowBounds = {
      x: normal.x,
      y: normal.y,
      width: normal.width,
      height: normal.height,
      maximized: wasShown() ? window.isMaximized() : initialMaximized,
    };
    void services.settings.saveWindow(next);
  };
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(persist, SAVE_DEBOUNCE_MS);
  };
  window.on('resize', schedule);
  window.on('move', schedule);
  window.on('maximize', schedule);
  window.on('unmaximize', schedule);
  window.on('close', () => {
    if (timer) clearTimeout(timer);
    persist();
  });
}

/** Auf Windows sind die DevTools nur im Entwicklungsmodus erreichbar. */
function attachDevToolsShortcut(window: BrowserWindow): void {
  window.webContents.on('before-input-event', (_event, input) => {
    const toggle =
      input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i');
    if (input.type === 'keyDown' && toggle) window.webContents.toggleDevTools();
  });
}
