/* App-Start. Reihenfolge: eine Instanz sichern, Einstellungen und Schlüssel
   laden, IPC registrieren, Fenster öffnen, Hotkey setzen, letzten Vault
   wiederherstellen. Schlägt der letzte Vault fehl, startet die App im
   Onboarding statt gar nicht. */

import { app, BrowserWindow } from 'electron';
import { attachCore } from './core-bridge';
import { createKeyStore } from './secrets';
import { createServices } from './services';
import { SettingsService } from './settings';
import { registerAllHandlers } from './ipc/register-all';
import { createMainWindow } from './window';
import { syncQuickCaptureHotkey, unregisterHotkeys, watchQuickCaptureHotkey } from './hotkey';
import { destroyQuickCapture } from './quick-capture';
import { startGardenerAutorun } from './gardener-autorun';
import { cancelGardenerRun } from './ipc/gardener';
import { startReminderNotifier } from './reminder-notify';
import { isVault } from './vault-layout';
import type { Services } from './services';
import type { GardenerAutorun } from './gardener-autorun';
import type { ReminderNotifier } from './reminder-notify';

let reminderNotifier: ReminderNotifier | null = null;
let gardenerAutorun: GardenerAutorun | null = null;

/* Nur eine Instanz: der Vault ist eine Datei-Wahrheit, zwei Prozesse darauf
   wären zwei Schreiber. */
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

app.setAppUserModelId('app.hantsch.guston');

async function bootstrap(): Promise<Services> {
  const userDataDir = app.getPath('userData');
  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  attachCore(services);
  registerAllHandlers(services);
  return services;
}

/**
 * Welcher Vault beim Start geöffnet wird.
 *
 * `SB_VAULT` schlägt die Historie: die Prüfskripte (`npm run shot`,
 * `npm run a11y`) starten die App damit auf dem Demo-Vault, ohne die
 * Einstellungen des Nutzers anzufassen. Fehlt die Variable, gilt der letzte
 * Vault. Passt beides nicht, startet die App im Onboarding — nie gar nicht.
 */
async function vaultToRestore(services: Services): Promise<string | null> {
  const forced = process.env['SB_VAULT']?.trim();
  if (forced) {
    if (await isVault(forced)) return forced;
    console.warn('[start] SB_VAULT zeigt auf keinen Vault:', forced);
  }
  const last = services.settings.app().lastVault;
  if (!last) return null;
  if (await isVault(last)) return last;
  await services.settings.forgetVault(last);
  return null;
}

/** Öffnet den Vault aus `SB_VAULT` bzw. den letzten. Fehler bleiben leise. */
async function restoreVault(services: Services): Promise<void> {
  const root = await vaultToRestore(services);
  if (!root) return;
  try {
    await services.openVault(root);
  } catch (error) {
    console.warn('[start] Vault ließ sich nicht öffnen:', root, error);
  }
}

async function start(): Promise<void> {
  const services = await bootstrap();
  const window = createMainWindow(services);
  services.setMainWindow(window);

  /* Das versteckte Schnell-Erfassen-Fenster darf die App nicht am Leben halten. */
  window.on('closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('second-instance', () => {
    const main = services.mainWindow();
    if (!main) return;
    if (main.isMinimized()) main.restore();
    main.focus();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const next = createMainWindow(services);
      services.setMainWindow(next);
    }
  });

  await restoreVault(services);
  syncQuickCaptureHotkey(services);
  watchQuickCaptureHotkey(services);
  /* Fällige Erinnerungen als Benachrichtigung: beim Öffnen und einmal pro
     Stunde, höchstens eine Sammelmeldung, nichts zweimal am selben Tag. */
  reminderNotifier = startReminderNotifier(services);
  /* Pflegelauf beim Öffnen — nur wenn `gardener.runOnOpen` an ist. */
  gardenerAutorun = startGardenerAutorun(services);
}

if (hasSingleInstanceLock) {
  void app.whenReady().then(start);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  unregisterHotkeys();
  destroyQuickCapture();
  reminderNotifier?.stop();
  reminderNotifier = null;
  gardenerAutorun?.stop();
  gardenerAutorun = null;
  cancelGardenerRun();
});
