/* 058, D5: a notification click must not just fire an event — it must reach a
 * window the tray may have hidden or Windows may have minimized. The seam
 * under test is `reminder-notify.ts#openDashboard`, which now goes through
 * the shared `showMainWindow` helper (the same door the tray, `activate` and
 * `window:show` use) instead of its own inline restore/show/focus.
 *
 * The harness mirrors `tests/main/dashboard-ipc.test.ts`'s "Benachrichtigung"
 * section — the existing coverage of `ReminderNotifier`'s `run()`/`check()`
 * path — rather than inventing a new way to reach a due reminder.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { CLAUDE_PROJECTS_DIR } from '../fixtures';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { NOW, freezeTime } from '../helpers/time';

/* Electron does not exist in the test: no windows, no encryption, no real
   notification. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
  Notification: class {
    static isSupported(): boolean {
      return false;
    }
  },
}));

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { resetExternalTouches } = await import('../../src/main/claude-touches');
  const { forgetOverviewState } = await import('../../src/main/overview-state');
  const { forgetSessions } = await import('../../src/main/ipc/overview-deps');

  /* Module-level state from an earlier test must not survive. */
  forgetSessions();
  forgetOverviewState();

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) =>
    IndexService.open(new FsVaultStore(root), {
      now: () => new Date(NOW),
      externalTouches: resetExternalTouches(),
    }),
  );

  return { services, settings };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

/** A `BrowserWindow` reduced to what `showMainWindow` and `openDashboard`
    touch: `isDestroyed` (read by `services.mainWindow()`), `isMinimized`,
    `restore`, `show`, `focus`, and `webContents.executeJavaScript`. */
function fakeMainWindow(startMinimized: boolean) {
  let minimized = startMinimized;
  const restore = vi.fn(() => void (minimized = false));
  const show = vi.fn();
  const focus = vi.fn();
  const executeJavaScript = vi.fn().mockResolvedValue(undefined);
  const window = {
    isDestroyed: () => false,
    isMinimized: () => minimized,
    restore,
    show,
    focus,
    webContents: { executeJavaScript },
  } as unknown as BrowserWindow;
  return { window, restore, show, focus, executeJavaScript };
}

describe('reminder-notify: the notification click', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    /* Deadlines and staleness hang off the calendar day. */
    freezeTime();
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-reminder-notify-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
    /* Sessions come from fixtures, never from the real ~/.claude. */
    await harness.settings.patchVault({
      overview: { claudeProjectsDir: CLAUDE_PROJECTS_DIR, useCodexSessions: false },
    });
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  /* AC4's other half: the periodic check does its work whatever the window is
     doing. `run()` never reads the window at all — only the click does — so a
     window hidden to the tray, or none (`mainWindow()` is `null`), must not
     make a due reminder go unannounced. */
  it.each([
    {
      state: 'hidden to the tray',
      make: () => {
        const fake = fakeMainWindow(true);
        return {
          window: fake.window,
          untouched: [fake.restore, fake.show, fake.focus, fake.executeJavaScript],
        };
      },
    },
    { state: 'gone', make: () => ({ window: null, untouched: [] }) },
  ])('the hourly check keeps firing while the window is $state', async ({ make }) => {
    const { ReminderNotifier } = await import('../../src/main/reminder-notify');
    const { window, untouched } = make();
    harness.services.setMainWindow(window);

    const show = vi.fn();
    const notifier = new ReminderNotifier(harness.services, {
      notifier: { show },
      now: () => new Date(NOW),
    });

    expect(await notifier.check()).toBe('sent');
    expect(show).toHaveBeenCalledTimes(1);
    /* Announcing does not bring the window forward — only a click does. */
    for (const spy of untouched) expect(spy).not.toHaveBeenCalled();
  });

  it('a notification click shows a hidden window and routes it to the dashboard', async () => {
    const { ReminderNotifier } = await import('../../src/main/reminder-notify');
    const { window, restore, show, focus, executeJavaScript } = fakeMainWindow(true);
    harness.services.setMainWindow(window);

    const captured: { onClick: (() => void) | null } = { onClick: null };
    const notifier = new ReminderNotifier(harness.services, {
      notifier: { show: (input) => void (captured.onClick = input.onClick) },
      now: () => new Date(NOW),
    });

    /* The fixture vault has an overdue reminder (also exercised in
       dashboard-ipc.test.ts), so one run reaches `notifier.show()`. */
    expect(await notifier.check()).toBe('sent');
    const onClick = captured.onClick;
    if (onClick === null) throw new Error('notifier.show() was never called');

    /* The click itself — the same call a real notification's `click` event
       would make. */
    onClick();

    /* Restore-if-minimized, then show, then focus: `showMainWindow`'s own
       contract, proven here through the notifier instead of assumed. */
    expect(restore).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    /* And routed to the dashboard — the half `showMainWindow` alone cannot
       prove. */
    expect(executeJavaScript).toHaveBeenCalledWith("window.location.hash = '#/dashboard';");
  });
});
