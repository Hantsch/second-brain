/* Erinnerungen als Windows-Benachrichtigung.

   Vier Regeln, damit das nicht zum Spam wird:
   - **Nur wenn `overview.notifications` an ist.** Sonst passiert nichts, und der
     Schalter im Verhalten-Tab sagt die Wahrheit.
   - **Nur was wirklich fällig ist:** überfällig oder heute fällig. „In drei
     Tagen" ist keine Benachrichtigung wert.
   - **Höchstens eine Sammelbenachrichtigung** je Lauf, nie eine je Sache.
   - **Dieselbe Sache nicht zweimal am selben Tag.** Der Zustand liegt in
     `.secondbrain/overview.json` und überlebt einen Neustart — sonst würde jeder
     Start der App die Meldung wiederholen.

   Geprüft wird beim Öffnen eines Vaults und danach einmal pro Stunde. Der Klick
   holt das Hauptfenster nach vorn und stellt es auf das Dashboard.

   Die Benachrichtigung selbst steckt hinter `Notifier`: im Test wird eine
   Attrappe eingesetzt, damit kein Lauf eine echte Windows-Meldung erzeugt. */

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

/** Prüfabstand: einmal pro Stunde. */
export const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** So lange nach dem Öffnen wird das erste Mal geprüft — der Index braucht kurz. */
export const FIRST_CHECK_DELAY_MS = 4000;

/** So oft wird auf den Index gewartet, bevor der Lauf ausfällt. */
const INDEX_RETRIES = 8;

/** So viele Titel stehen im Rumpf der Meldung. */
const MAX_TITLES = 3;

/** Was ein Lauf getan hat — der Test liest daran ab, dass nichts erfunden wurde. */
export type CheckResult = 'sent' | 'nothing-due' | 'already-announced' | 'off' | 'no-index';

export interface NotifyInput {
  title: string;
  body: string;
  onClick: () => void;
}

/** Die Nahtstelle zur Benachrichtigung. Genau eine Zeile Electron. */
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

/** Fällig heißt: überfällig oder heute. Alles andere mahnt die Oberfläche. */
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
   * Startet die Prüfung. Ein Vaultwechsel wird an `app.lastVault` erkannt: die
   * Einstellungen melden jede Änderung, und das Öffnen eines Vaults schreibt
   * immer diesen Eintrag. So braucht der Melder keinen zweiten Haken im
   * Service-Container.
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

  /** Wartet, bis der Index steht — beim Öffnen baut er noch. */
  private async checkWhenReady(attempt = 0): Promise<CheckResult> {
    const result = await this.check();
    if (result !== 'no-index' || attempt >= INDEX_RETRIES) return result;
    return new Promise((resolve) => {
      setTimeout(() => void this.checkWhenReady(attempt + 1).then(resolve), FIRST_CHECK_DELAY_MS);
    });
  }

  /**
   * Ein Lauf. Meldet höchstens eine Sammelbenachrichtigung und schreibt fort,
   * was gemeldet wurde. Zwei Läufe am selben Tag über dieselben Sachen ergeben
   * genau eine Meldung.
   */
  async check(): Promise<CheckResult> {
    if (this.running) return 'nothing-due';
    this.running = true;
    try {
      return await this.run();
    } catch (error) {
      /* Eine Benachrichtigung darf die App nicht kosten. */
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

  /** Fenster nach vorn und auf das Dashboard. Kein neuer Kanal nötig: die
      Oberfläche routet über den Hash. */
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

/** Baut den Melder und startet ihn. Rückgabe hält ihn wieder an. */
export function startReminderNotifier(
  services: Services,
  options: NotifierOptions = {},
): ReminderNotifier {
  const notifier = new ReminderNotifier(services, options);
  notifier.start();
  return notifier;
}
