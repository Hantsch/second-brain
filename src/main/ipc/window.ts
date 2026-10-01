/* Window channels for the custom title bar. Frameless means minimize,
   maximize, and close live in the renderer — this is the counterpart. */

import { BrowserWindow } from 'electron';
import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import { cancelClose, confirmClose } from '../close-guard';
import { showMainWindow } from '../show-main-window';
import type { Services } from '../services';
import { OFFSCREEN } from '../window-shared';

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
      /* A verification run's window lives left of every display; maximizing
         would pull it onto one, in front of the developer. */
      if (OFFSCREEN) return { maximized: window.isMaximized() };
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
      showMainWindow(services);
    },
  });
}
