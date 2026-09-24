/* Brings the main window forward — restoring it if minimized, showing it if it
   was hidden to the tray, and focusing it (058, D-g).

   One helper for every door that gives the window back: the tray (click and
   "open"), `activate` (macOS dock click), `window:show` (quick capture), and
   later `second-instance` and the reminder notification's click. The same three
   lines used to be copied into each of them; a window hidden to the tray made a
   missing `show()` in any one copy a door that silently does nothing. */

import type { Services } from './services';

export function showMainWindow(services: Services): void {
  /* `mainWindow()` already filters out a destroyed window, so no further
     `isDestroyed()` check is needed before touching it. */
  const window = services.mainWindow();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
