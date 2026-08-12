/* The global hotkey for quick capture.
   It's allowed to fail: if the key combination is claimed by the operating
   system or another app, the app reports it via a toast and keeps running. */

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

/** `globalShortcut.register` can return false or throw — both mean "already claimed". */
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
 * Re-registers the hotkey if it has changed.
 * Returns true if the current combination is active.
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
  console.warn('[hotkey] key combination already claimed:', wanted);
  services.sendEvent('event:toast', { kind: 'warn', message: 'toast.hotkeyBusy' });
  return false;
}

/** Keeps the hotkey in sync with the settings: if the user changes it, it takes effect immediately. */
export function watchQuickCaptureHotkey(services: Services): void {
  services.settings.onChange(() => {
    syncQuickCaptureHotkey(services);
  });
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
  registered = null;
}
