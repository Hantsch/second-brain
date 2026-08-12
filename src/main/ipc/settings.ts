/* Settings channels. Every change writes immediately and sends
   `event:settings` to all windows (the service container is hooked up to
   this) — the renderer keeps no state of its own.

   The payload is validated beforehand: `settings-validate.ts` only lets
   known fields through, clamps numbers to sensible ranges, and rejects
   nonsense with `invalid` instead of writing it to the file. */

import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { sanitizeAppPatch, sanitizeLanguages, sanitizeVaultPatch } from './settings-validate';
import type { Services } from '../services';

export function settingsHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'settings:get': () => services.settings.snapshot(),

    'settings:setApp': async ({ patch }) => {
      await services.settings.patchApp(sanitizeAppPatch(patch));
      return services.settings.snapshot();
    },

    'settings:setVault': async ({ patch }) => {
      if (!services.settings.vault()) throw fail('no-vault', 'kein Vault geöffnet');
      /* Validate first, then write: a rejected change must not touch the
         file. */
      await services.settings.patchVault(sanitizeVaultPatch(patch));
      return services.settings.snapshot();
    },

    /* Languages live in the vault as long as one is open; the UI language
       additionally lives in the app settings, so it already applies before
       the first vault. `SettingsService.setLanguages` handles both. */
    'settings:setLanguages': (next) => services.settings.setLanguages(sanitizeLanguages(next)),
  });
}
