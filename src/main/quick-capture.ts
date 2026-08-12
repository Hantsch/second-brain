/* Das Schnell-Erfassen-Fenster: klein, rahmenlos, über allem, ohne Eintrag in
   der Taskleiste. Es erscheint auf dem Bildschirm, auf dem der Zeiger steht —
   dort schaut der Nutzer gerade hin. */

import { BrowserWindow, screen } from 'electron';
import { loadPage, preloadPath } from './renderer-entry';
import type { Services } from './services';

const SIZE = { width: 560, height: 220 } as const;
const BACKGROUND = '#0A0F16';

let window: BrowserWindow | null = null;
/** Beim Fokusverlust schließen. Abschaltbar, weil es beim Debuggen im Weg ist. */
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
  created.once('ready-to-show', () => created.show());
  created.on('blur', () => {
    if (closeOnBlur) hideQuickCapture();
  });
  /* Escape gehört dem Renderer, nicht dem Rahmen: steht Text im Feld, fragt er
     erst nach („Entwurf verwerfen?"). Würde der Rahmen hier mithören, wäre das
     Fenster versteckt, bevor die Rückfrage jemand zu sehen bekommt. Er schließt
     dann über `capture:window`. */
  created.on('closed', () => {
    window = null;
  });

  /* Der Container weiß nichts von diesem Fenster — Ereignisse gehen ohnehin an
     alle Fenster. Wir halten die Referenz nur lokal. */
  void services;
  loadPage(created, 'quick-capture');
  return created;
}

/**
 * Zeigt das Fenster (legt es beim ersten Mal an) und gibt ihm den Fokus.
 *
 * Beim Wiederzeigen wird `event:capture-focus` geschickt, egal über welchen Weg
 * das Fenster kam — Hotkey, Knopf im Hauptfenster, Tray. Das Fenster wird nur
 * versteckt, nicht zerstört: ohne dieses Signal stünde darin noch der Zustand
 * des vorigen Gedanken (Bestätigung, Pfad) und der Fokus läge nicht im Feld.
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
