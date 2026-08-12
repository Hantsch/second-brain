/* Information about the running app. Used in "About" and in error reports. */

import { app } from 'electron';
import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';

/**
 * Demo mode: either the launcher set `SB_DEMO` (test scripts), or the open
 * vault is the seeded example folder. The UI is allowed to flag this so
 * nobody mistakes example content for real content.
 */
function isDemoVault(root: string | null): boolean {
  if (process.env['SB_DEMO'] === '1') return true;
  return root !== null && /[\\/]\.demo-vault$/.test(root);
}

export function appHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'app:info': () => ({
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron ?? '',
      userData: services.userDataDir,
      demo: isDemoVault(services.vaultRoot()),
    }),
  });
}
