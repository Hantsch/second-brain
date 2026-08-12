/* Der globale Hotkey für das Schnell-Erfassen.
   Er darf fehlschlagen: ist die Tastenkombination vom Betriebssystem oder einer
   anderen App belegt, sagt die App das per Toast und läuft weiter. */

import { globalShortcut } from 'electron';
import { defaultVaultSettings } from './settings-defaults';
import { showQuickCapture } from './quick-capture';
import type { Services } from './services';

let registered: string | null = null;

function configuredShortcut(services: Services): string {
  return (
    services.settings.vault()?.capture.quickCaptureShortcut ??
    defaultVaultSettings().capture.quickCaptureShortcut
  );
}

/** `globalShortcut.register` kann false liefern oder werfen — beides heißt „belegt". */
function tryRegister(services: Services, shortcut: string): boolean {
  try {
    return globalShortcut.register(shortcut, () => {
      showQuickCapture(services);
      services.sendEvent('event:capture-focus', {});
    });
  } catch {
    return false;
  }
}

/**
 * Registriert den Hotkey neu, wenn er sich geändert hat.
 * Rückgabe: true, wenn die aktuelle Kombination aktiv ist.
 */
export function syncQuickCaptureHotkey(services: Services): boolean {
  const wanted = configuredShortcut(services);
  if (registered === wanted) return true;
  if (registered) {
    globalShortcut.unregister(registered);
    registered = null;
  }
  if (!wanted) return false;

  if (tryRegister(services, wanted)) {
    registered = wanted;
    return true;
  }
  console.warn('[hotkey] Tastenkombination belegt:', wanted);
  services.sendEvent('event:toast', { kind: 'warn', message: 'toast.hotkeyBusy' });
  return false;
}

/** Hält den Hotkey an den Einstellungen: ändert der Nutzer ihn, greift er sofort. */
export function watchQuickCaptureHotkey(services: Services): void {
  services.settings.onChange(() => {
    syncQuickCaptureHotkey(services);
  });
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
  registered = null;
}
