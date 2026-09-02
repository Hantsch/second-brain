/* Window channels for the custom title bar. Frameless means minimize,
   maximize, and close live in the renderer — this is the counterpart. */

import { BrowserWindow } from 'electron';
import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import { cancelClose, confirmClose } from '../close-guard';
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

    /* The answer to `event:close-requested` (042, D6): close anyway, even
       though a maintenance run is going. Deliberately not `close()` here —
       the guard carries out exactly the close it vetoed, and only it knows
       which one that was; closing from here would sidestep the flag that keeps
       the retry from being vetoed a second time. */
    'window:confirmClose': () => {
      confirmClose();
    },

    /* The opposite answer (AC 8): leave the run and the window alone. Without
       this the guard's dead-man timer would close the window a few seconds
       after the user said not to — a cancel that only postpones is not a
       cancel. */
    'window:cancelClose': () => {
      cancelClose();
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
