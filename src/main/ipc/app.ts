/* Information about the running app. Used in "About" and in error reports. */

import { app } from 'electron';
import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';
import { isDemoVault } from '../demo';
import { installedReleaseNotes } from '../release-notes';

export function appHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'app:info': () => ({
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron ?? '',
      userData: services.userDataDir,
      demo: isDemoVault(services.vaultRoot()),
    }),
    'app:releaseNotes': () => installedReleaseNotes(app.getVersion()),
  });
}
