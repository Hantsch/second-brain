/* App startup. Order: secure a single instance, load settings and keys,
   register IPC, open the window, set the hotkey, restore the last vault.
   If the last vault fails to open, the app starts in onboarding instead
   of not starting at all. */

import { app, BrowserWindow } from 'electron';
import { APP_ID } from './app-identity';
import { attachCloseGuard } from './close-guard';
import { attachCore } from './core-bridge';
import { createKeyStore } from './secrets';
import { createServices } from './services';
import { SettingsService } from './settings';
import { registerAllHandlers } from './ipc/register-all';
import { stopOwnedLlamaEngineOnQuit } from './ipc/runtime/llamacpp-lifecycle';
import { createMainWindow } from './window';
import { syncQuickCaptureHotkey, unregisterHotkeys, watchQuickCaptureHotkey } from './hotkey';
import { destroyQuickCapture } from './quick-capture';
import { startGardenerAutorun } from './gardener-autorun';
import { cancelGardenerRun } from './gardener-run-state';
import { startReminderNotifier } from './reminder-notify';
import { isVault } from './vault-layout';
import type { Services } from './services';
import type { GardenerAutorun } from './gardener-autorun';
import type { ReminderNotifier } from './reminder-notify';

let reminderNotifier: ReminderNotifier | null = null;
let gardenerAutorun: GardenerAutorun | null = null;

/* Only one instance: the vault is a file-based source of truth, and two
   processes on it would mean two writers. */
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

app.setAppUserModelId(APP_ID);

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
 * Which vault is opened at startup.
 *
 * `SB_VAULT` overrides the history: the check scripts (`npm run shot`,
 * `npm run a11y`) use it to start the app on the demo vault without
 * touching the user's settings. If the variable is missing, the last
 * vault applies. If neither fits, the app starts in onboarding — never
 * not at all.
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

/** Opens the vault from `SB_VAULT` or the last one. Errors stay silent. */
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
  /* Ask before closing kills a running maintenance pass (042, D6). A layer in
     front of `will-quit`'s `cancelGardenerRun('shutdown')` below, which stays
     the last-resort net for every close this one lets through. */
  attachCloseGuard(services, window);

  /* The hidden quick-capture window must not keep the app alive. */
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
      attachCloseGuard(services, next);
    }
  });

  await restoreVault(services);
  syncQuickCaptureHotkey(services);
  watchQuickCaptureHotkey(services);
  /* Due reminders as notifications: on open and once per hour, at most
     one bundled message, nothing twice on the same day. */
  reminderNotifier = startReminderNotifier(services);
  /* Maintenance run on open — only if `gardener.runOnOpen` is on. */
  gardenerAutorun = startGardenerAutorun(services);
}

if (hasSingleInstanceLock) {
  void app.whenReady().then(start);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  /* `finally`, not just "last in the list": every step above is best-effort
     cleanup of in-process state, and one of them throwing must not be able to
     leave a real OS process behind. The original error still propagates —
     this only guarantees the engine is signalled on the way past. */
  try {
    unregisterHotkeys();
    destroyQuickCapture();
    reminderNotifier?.stop();
    reminderNotifier = null;
    gardenerAutorun?.stop();
    gardenerAutorun = null;
    /* On the way out nothing of a running pass is kept (021b, D2): the atomic
       write could not be awaited here anyway, and a vault being left behind must
       not carry half a report. A stop the user asked for goes through
       `gardener:cancel` and says `'user'` instead. */
    cancelGardenerRun('shutdown');
  } finally {
    /* What the app started, the app stops (034, AC 6): the llama.cpp engine is
       tracked and not detached, so nothing else would ever end it. An engine
       the app did not start is left running (Decisions, Q6). */
    stopOwnedLlamaEngineOnQuit();
  }
});
