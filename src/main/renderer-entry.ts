/* Die beiden Renderer-Einstiegspunkte laden — im Entwicklungsmodus vom
   Vite-Server, im gebauten Zustand aus `out/renderer/`. */

import { join } from 'node:path';
import { app } from 'electron';
import type { BrowserWindow } from 'electron';

export type RendererPage = 'index' | 'quick-capture';

export function isDev(): boolean {
  return !app.isPackaged;
}

/** Pfad zum Preload-Bundle. Liegt neben dem Main-Bundle in `out/`. */
export function preloadPath(): string {
  return join(__dirname, '../preload/index.cjs');
}

export function loadPage(window: BrowserWindow, page: RendererPage): void {
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (isDev() && devServer) {
    void window.loadURL(`${devServer}/${page}.html`);
    return;
  }
  void window.loadFile(join(__dirname, `../renderer/${page}.html`));
}
