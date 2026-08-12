/* Window channels for the custom title bar. Frameless means minimize,
   maximize, and close live in the renderer — this is the counterpart. */

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

    /* Explicitly the main window, not the focused one: this channel is
       called from quick capture — which is itself the focused window at
       that point. */
    'window:show': () => {
      const main = services.mainWindow();
      if (!main) return;
      if (main.isMinimized()) main.restore();
      main.show();
      main.focus();
    },
  });
}
