/* Fenster-Kanäle für die eigene Titelzeile. Rahmenlos heißt: Minimieren,
   Maximieren und Schließen liegen beim Renderer — hier ist die Gegenseite. */

import { BrowserWindow } from 'electron';
import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';

function target(services: Services): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? services.mainWindow();
}

export function windowHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'window:minimize': () => {
      target(services)?.minimize();
    },

    'window:toggleMaximize': () => {
      const window = target(services);
      if (!window) return { maximized: false };
      if (window.isMaximized()) window.unmaximize();
      else window.maximize();
      return { maximized: window.isMaximized() };
    },

    'window:close': () => {
      target(services)?.close();
    },

    'window:isMaximized': () => target(services)?.isMaximized() ?? false,

    /* Ausdrücklich das Hauptfenster, nicht das fokussierte: gerufen wird dieser
       Kanal aus dem Schnell-Erfassen — das ist gerade das fokussierte. */
    'window:show': () => {
      const main = services.mainWindow();
      if (!main) return;
      if (main.isMinimized()) main.restore();
      main.show();
      main.focus();
    },
  });
}
