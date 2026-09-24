/* App startup. Order: secure a single instance, load settings and keys,
   register IPC, open the window, set the hotkey, restore the last vault.
   If the last vault fails to open, the app starts in onboarding instead
   of not starting at all. */

import { app } from 'electron';
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
import { createAppTray } from './tray';
import { showMainWindow } from './show-main-window';
import { startGardenerAutorun } from './gardener-autorun';
import { startReminderNotifier } from './reminder-notify';
import { runTasksFixture } from './ipc/tasks-e2e-fixture';
import { isVault } from './vault-layout';
import { getWorkQueue } from './work-queue';
import type { Services } from './services';
import type { GardenerAutorun } from './gardener-autorun';
import type { ReminderNotifier } from './reminder-notify';
import type { Tray } from 'electron';

let reminderNotifier: ReminderNotifier | null = null;
let gardenerAutorun: GardenerAutorun | null = null;
/* Module-scope for the same reason as `reminderNotifier`/`gardenerAutorun`
   just above: a `Tray` that only lives in `start()`'s closure would be
   garbage-collected and silently vanish from the system tray (a known
   Electron footgun), and `will-quit` needs the reference to destroy it. */
let tray: Tray | null = null;
/* `will-quit` runs at module scope, outside `start()`'s closure — this is the
   one place that reference is kept so the handler below can reach it (071,
   D4), the same pattern `reminderNotifier`/`gardenerAutorun` already use. */
let runningServices: Services | null = null;

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
  runningServices = services;
  /* Tray before window (058, D4): `canStartHidden` below needs to know whether a
     tray exists, and the tray itself needs no window to be created. */
  try {
    tray = createAppTray(services);
  } catch (error) {
    /* A tray that can't be built (e.g. an unloadable icon) must cost the app its
       tray, not its window: without this, `start()` rejects before any window
       exists and the process sits on the single-instance lock, unreachable. */
    console.warn('[start] tray could not be created:', error);
    tray = null;
  }
  const trayAlive = tray !== null && !tray.isDestroyed();
  const window = createMainWindow(services, { canStartHidden: trayAlive });
  services.setMainWindow(window);
  /* Close-to-tray (058, D-f): hide only while a tray actually exists — a
     window hidden with no tray icon to bring it back would be an app the user
     can neither see nor quit. Read on every close, so the setting takes effect
     without a restart. */
  const closeGuardOptions = {
    hideInsteadOfClose: () =>
      services.settings.app().closeToTray && tray !== null && !tray.isDestroyed(),
  };
  /* Ask before closing kills a running maintenance pass (042, D6). A layer in
     front of `will-quit`'s `cancelAll('shutdown')` below, which stays the
     last-resort net for every close this one lets through. */
  attachCloseGuard(services, window, closeGuardOptions);

  /* The hidden quick-capture window must not keep the app alive. */
  window.on('closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('second-instance', () => {
    showMainWindow(services);
  });

  app.on('activate', () => {
    /* A window hidden to the tray still exists, so "no windows at all" is the
       wrong test here: the dock click would do nothing. Give back the one that
       exists, and only build a new one when the old one is really gone. */
    if (services.mainWindow()) {
      showMainWindow(services);
      return;
    }
    const next = createMainWindow(services);
    services.setMainWindow(next);
    attachCloseGuard(services, next, closeGuardOptions);
  });

  await restoreVault(services);
  /* 072, D5: after the vault opens, never before — `openVault` clears the
     work queue on its way in (`Services.closeVault`), so anything enqueued
     earlier would not survive to be seen. Env-gated; off (no
     `SB_E2E_TASKS_FIXTURE`) this call does nothing. */
  runTasksFixture(services);
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
    if (tray && !tray.isDestroyed()) tray.destroy();
    tray = null;
    reminderNotifier?.stop();
    reminderNotifier = null;
    gardenerAutorun?.stop();
    gardenerAutorun = null;
    /* The shutdown net for everything in flight (071, D4) — a task running
       against the vault must not be left going once the process is on its way
       out, and since 074 D2 that reaches the maintenance run too: it is
       mirrored onto this queue and stops its own real run via the registry's
       `onCancel` hook. On the way out nothing of a running pass is kept
       (021b, D2): the atomic write could not be awaited here anyway, and a
       vault left behind must not carry half a report. A stop the user asked
       for goes through `gardener:cancel` and says `'user'` instead. */
    if (runningServices) {
      getWorkQueue(runningServices).cancelAll('shutdown');
      getWorkQueue(runningServices).clear();
    }
  } finally {
    /* What the app started, the app stops (034, AC 6): the llama.cpp engine is
       tracked and not detached, so nothing else would ever end it. An engine
       the app did not start is left running (Decisions, Q6). */
    stopOwnedLlamaEngineOnQuit();
  }
});
