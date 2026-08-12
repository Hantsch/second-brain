/* Reminders as Windows notifications.

   Four rules so this doesn't turn into spam:
   - **Only when `overview.notifications` is on.** Otherwise nothing happens, and the
     toggle in the Behavior tab tells the truth.
   - **Only what's actually due:** overdue or due today. "In three
     days" isn't worth a notification.
   - **At most one collected notification** per run, never one per item.
   - **The same item never twice on the same day.** The state lives in
     `.secondbrain/overview.json` and survives a restart — otherwise every
     app start would repeat the notification.

   Checked when a vault is opened and once per hour after that. Clicking
   brings the main window forward and switches it to the dashboard.

   The notification itself sits behind `Notifier`: in tests a stand-in
   is used so no run produces a real Windows notification. */

import { Notification } from 'electron';
import { reminders } from '@core/overview';
import { isoDay } from '@core/vault/paths';
import type { Reminder } from '@shared/types';
import {
  claudeSessions,
  overviewIndex,
  overviewSettings,
  overviewStateFor,
} from './ipc/overview-deps';
import { dueBody, dueSummary } from './messages';
import type { Services } from './services';

/** Check interval: once per hour. */
export const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** How long after opening the first check runs — the index needs a moment. */
export const FIRST_CHECK_DELAY_MS = 4000;

/** How many times to wait for the index before the run gives up. */
const INDEX_RETRIES = 8;

/** How many titles appear in the body of the notification. */
const MAX_TITLES = 3;

/** What a run did — the test reads this to confirm nothing was made up. */
export type CheckResult = 'sent' | 'nothing-due' | 'already-announced' | 'off' | 'no-index';

export interface NotifyInput {
  title: string;
  body: string;
  onClick: () => void;
}

/** The seam to the notification. Exactly one line of Electron. */
export interface Notifier {
  show(input: NotifyInput): void;
}

export function electronNotifier(): Notifier {
  return {
    show({ title, body, onClick }: NotifyInput): void {
      if (!Notification.isSupported()) return;
      const notification = new Notification({ title, body });
      notification.on('click', onClick);
      notification.show();
    },
  };
}

/** Due means: overdue or today. Everything else is nudged by the UI instead. */
function isDue(reminder: Reminder): boolean {
  return reminder.urgency === 'overdue' || reminder.urgency === 'today';
}

export interface NotifierOptions {
  notifier?: Notifier;
  now?: () => Date;
}

export class ReminderNotifier {
  private timer: ReturnType<typeof setInterval> | null = null;
  private first: ReturnType<typeof setTimeout> | null = null;
  private unwatch: (() => void) | null = null;
  private lastVault: string | null = null;
  private running = false;

  constructor(
    private readonly services: Services,
    private readonly options: NotifierOptions = {},
  ) {}

  private get notifier(): Notifier {
    return this.options.notifier ?? electronNotifier();
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  /**
   * Starts the check. A vault switch is detected via `app.lastVault`: the
   * settings report every change, and opening a vault always writes this
   * entry. This way the notifier doesn't need a second hook into the
   * service container.
   */
  start(): void {
    this.lastVault = this.services.settings.app().lastVault;
    this.unwatch = this.services.settings.onChange((snapshot) => {
      if (snapshot.app.lastVault === this.lastVault) return;
      this.lastVault = snapshot.app.lastVault;
      if (snapshot.app.lastVault !== null) this.scheduleFirst();
    });
    this.scheduleFirst();
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    if (this.first !== null) clearTimeout(this.first);
    this.timer = null;
    this.first = null;
    this.unwatch?.();
    this.unwatch = null;
  }

  private scheduleFirst(): void {
    if (this.first !== null) clearTimeout(this.first);
    this.first = setTimeout(() => {
      this.first = null;
      void this.checkWhenReady();
    }, FIRST_CHECK_DELAY_MS);
  }

  /** Waits until the index is ready — it's still building right after opening. */
  private async checkWhenReady(attempt = 0): Promise<CheckResult> {
    const result = await this.check();
    if (result !== 'no-index' || attempt >= INDEX_RETRIES) return result;
    return new Promise((resolve) => {
      setTimeout(() => void this.checkWhenReady(attempt + 1).then(resolve), FIRST_CHECK_DELAY_MS);
    });
  }

  /**
   * A single run. Reports at most one collected notification and records
   * what was reported. Two runs on the same day over the same items result
   * in exactly one notification.
   */
  async check(): Promise<CheckResult> {
    if (this.running) return 'nothing-due';
    this.running = true;
    try {
      return await this.run();
    } catch (error) {
      /* A notification must never cost the app its stability. */
      console.warn('[reminder] Prüfung fehlgeschlagen:', error);
      return 'no-index';
    } finally {
      this.running = false;
    }
  }

  private async run(): Promise<CheckResult> {
    const settings = overviewSettings(this.services);
    if (settings === undefined || !settings.notifications) return 'off';
    const status = this.services.status();
    if (!status.ready || this.services.index() === null) return 'no-index';

    const now = this.now();
    const today = isoDay(now);
    const state = await overviewStateFor(this.services, today);
    await claudeSessions(this.services);
    const due = reminders(overviewIndex(this.services), settings, now, state.snoozes()).filter(
      isDue,
    );
    if (due.length === 0) return 'nothing-due';

    const fresh = state.unannounced(
      due.map((reminder) => reminder.id),
      today,
    );
    if (fresh.length === 0) return 'already-announced';

    const announced = due.filter((reminder) => fresh.includes(reminder.id));
    this.notifier.show({
      title: dueSummary(
        this.services.settings.uiLanguage(),
        announced.filter((reminder) => reminder.urgency === 'overdue').length,
        announced.filter((reminder) => reminder.urgency === 'today').length,
      ),
      body: dueBody(
        this.services.settings.uiLanguage(),
        announced.slice(0, MAX_TITLES).map((reminder) => reminder.title),
        announced.length - MAX_TITLES,
      ),
      onClick: () => this.openDashboard(),
    });
    await state.markAnnounced(fresh, today);
    return 'sent';
  }

  /** Window forward and to the dashboard. No new channel needed: the
      UI routes via the hash. */
  private openDashboard(): void {
    const window = this.services.mainWindow();
    if (window === null) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    void window.webContents
      .executeJavaScript("window.location.hash = '#/dashboard';")
      .catch(() => undefined);
  }
}

/** Builds the notifier and starts it. The return value stops it again. */
export function startReminderNotifier(
  services: Services,
  options: NotifierOptions = {},
): ReminderNotifier {
  const notifier = new ReminderNotifier(services, options);
  notifier.start();
  return notifier;
}
