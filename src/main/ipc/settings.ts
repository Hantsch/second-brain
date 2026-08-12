/* Einstellungs-Kanäle. Jede Änderung schreibt sofort und schickt
   `event:settings` an alle Fenster (der Service-Container hängt daran) — der
   Renderer hält keinen eigenen Zustand.

   Die Nutzlast wird vorher geprüft: `settings-validate.ts` lässt nur bekannte
   Felder durch, klemmt Zahlen in sinnvolle Bereiche und weist Unsinn mit
   `invalid` ab, statt ihn in die Datei zu schreiben. */

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
      /* Erst prüfen, dann schreiben: eine abgewiesene Änderung darf die Datei
         nicht anfassen. */
      await services.settings.patchVault(sanitizeVaultPatch(patch));
      return services.settings.snapshot();
    },

    /* Die Sprachen sitzen im Vault, solange einer offen ist; die UI-Sprache
       zusätzlich in den App-Einstellungen, damit sie schon vor dem ersten Vault
       gilt. Beides macht `SettingsService.setLanguages`. */
    'settings:setLanguages': (next) => services.settings.setLanguages(sanitizeLanguages(next)),
  });
}
