/* The quick capture window: small, frameless, on top of everything, with no
   taskbar entry. It appears on the screen the cursor is on — that's where the
   user is currently looking. */

import { BrowserWindow, screen } from 'electron';
import { attachNavigationGuards } from './navigation';
import { loadPage, preloadPath } from './renderer-entry';
import type { Services } from './services';

const SIZE = { width: 560, height: 220 } as const;
const BACKGROUND = '#0A0F16';

let window: BrowserWindow | null = null;
/** Close on focus loss. Can be turned off because it gets in the way while debugging. */
let closeOnBlur = true;

export function setCloseOnBlur(value: boolean): void {
  closeOnBlur = value;
}

export function quickCaptureWindow(): BrowserWindow | null {
  return window && !window.isDestroyed() ? window : null;
}

function centeredOnCursor(): { x: number; y: number } {
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  return {
    x: Math.round(area.x + (area.width - SIZE.width) / 2),
    y: Math.round(area.y + (area.height - SIZE.height) / 3),
  };
}

function create(services: Services): BrowserWindow {
  const created = new BrowserWindow({
    ...SIZE,
    ...centeredOnCursor(),
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: BACKGROUND,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'Schnell erfassen',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  created.setAlwaysOnTop(true, 'floating');
  attachNavigationGuards(created);
  created.once('ready-to-show', () => created.show());
  created.on('blur', () => {
    if (closeOnBlur) hideQuickCapture();
  });
  /* Escape belongs to the renderer, not the shell: if there's text in the field,
     it asks first ("Discard draft?"). If the shell listened for it here, the
     window would be hidden before anyone got to see the confirmation. It
     closes via `capture:window` instead. */
  created.on('closed', () => {
    window = null;
  });

  /* The container knows nothing about this window — events go to all windows
     anyway. We only keep the reference locally. */
  void services;
  loadPage(created, 'quick-capture');
  return created;
}

/**
 * Shows the window (creating it the first time) and gives it focus.
 *
 * When shown again, `event:capture-focus` is sent, regardless of how the
 * window was triggered — hotkey, button in the main window, tray. The window
 * is only hidden, never destroyed: without this signal it would still show
 * the previous thought's state (confirmation, path) and focus wouldn't be in
 * the field.
 */
export function showQuickCapture(services: Services): BrowserWindow {
  const existing = quickCaptureWindow();
  if (existing) {
    const position = centeredOnCursor();
    existing.setPosition(position.x, position.y);
    existing.show();
    existing.focus();
    services.sendEvent('event:capture-focus', {});
    return existing;
  }
  window = create(services);
  return window;
}

export function hideQuickCapture(): void {
  const existing = quickCaptureWindow();
  if (existing) existing.hide();
}

export function destroyQuickCapture(): void {
  const existing = quickCaptureWindow();
  if (existing) existing.destroy();
  window = null;
}
