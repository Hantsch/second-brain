/* Auskunft über die laufende App. Landet in „Über" und in Fehlerberichten. */

import { app } from 'electron';
import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';

/**
 * Demo-Modus: entweder hat der Starter `SB_DEMO` gesetzt (Prüfskripte), oder der
 * offene Vault ist der geseedete Beispielordner. Die Oberfläche darf das
 * kennzeichnen, damit niemand Beispielinhalte für echte hält.
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
