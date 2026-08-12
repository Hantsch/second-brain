/* Das Hauptfenster. Rahmenlos mit eigener Titelzeile, dunkel schon vor dem
   ersten Frame, und erst sichtbar, wenn wirklich etwas zu sehen ist. */

import { BrowserWindow, screen, shell } from 'electron';
import type { WindowBounds } from '@shared/types';
import { clampBounds } from './bounds';
import { WINDOW_MIN } from './settings-defaults';
import { isDev, loadPage, preloadPath } from './renderer-entry';
import type { Services } from './services';

/** Seitenhintergrund aus den Gaston-Tokens — verhindert das weiße Aufblitzen. */
const BACKGROUND = '#0A0F16';
const SAVE_DEBOUNCE_MS = 400;

function workAreas(): { x: number; y: number; width: number; height: number }[] {
  return screen.getAllDisplays().map((display) => display.workArea);
}

export function createMainWindow(services: Services): BrowserWindow {
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
    title: 'Second Brain',
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

  window.once('ready-to-show', () => {
    if (saved.maximized) window.maximize();
    if (!services.settings.app().startMinimized) window.show();
  });

  attachBoundsPersistence(window, services);
  attachNavigationGuards(window);
  if (isDev()) attachDevToolsShortcut(window);

  loadPage(window, 'index');
  return window;
}

/** Position und Größe merken — gedrosselt, damit Ziehen nicht dauernd schreibt. */
function attachBoundsPersistence(window: BrowserWindow, services: Services): void {
  let timer: NodeJS.Timeout | null = null;
  const persist = (): void => {
    if (window.isDestroyed()) return;
    const normal = window.getNormalBounds();
    const next: WindowBounds = {
      x: normal.x,
      y: normal.y,
      width: normal.width,
      height: normal.height,
      maximized: window.isMaximized(),
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

/** Kein Fenster, das die App nicht selbst geöffnet hat; Links gehen in den Browser. */
function attachNavigationGuards(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL();
    if (!url.startsWith('file://') && !url.startsWith(new URL(current).origin)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
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
