/* Das Hauptfenster. Rahmenlos mit eigener Titelzeile, dunkel schon vor dem
   ersten Frame, und erst sichtbar, wenn wirklich etwas zu sehen ist. */

import { BrowserWindow, screen } from 'electron';
import { join, resolve } from 'node:path';
import type { AppIcon } from '@shared/types';
import type { WindowBounds } from '@shared/types';
import { APP_ID, APP_NAME } from './app-identity';
import { clampBounds } from './bounds';
import { attachNavigationGuards } from './navigation';
import { WINDOW_MIN } from './settings-defaults';
import { isDev, loadPage, preloadPath } from './renderer-entry';
import type { Services } from './services';

/** Seitenhintergrund aus den Gaston-Tokens — verhindert das weiße Aufblitzen. */
const BACKGROUND = '#0A0F16';
const SAVE_DEBOUNCE_MS = 400;

const ICON_FILES: Record<AppIcon, string> = {
  'knowledge-garden': 'knowledge-garden.ico',
  'neural-core': 'neural-core.ico',
  'circuit-cortex': 'circuit-cortex.ico',
  'brain-chip': 'brain-chip.ico',
  'vault-brain': 'vault-brain.ico',
};

function appIconPath(icon: AppIcon): string {
  const root = isDev()
    ? resolve('assets', 'app-icons')
    : join(process.resourcesPath, 'assets/app-icons');
  return join(root, ICON_FILES[icon]);
}

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

  window.once('ready-to-show', () => {
    if (saved.maximized) window.maximize();
    if (!services.settings.app().startMinimized) window.show();
  });

  attachBoundsPersistence(window, services);
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

/** Auf Windows sind die DevTools nur im Entwicklungsmodus erreichbar. */
function attachDevToolsShortcut(window: BrowserWindow): void {
  window.webContents.on('before-input-event', (_event, input) => {
    const toggle =
      input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i');
    if (input.type === 'keyDown' && toggle) window.webContents.toggleDevTools();
  });
}
