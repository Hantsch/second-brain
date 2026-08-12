/* Die Defaults beider Einstellungsebenen an einem Ort.
   Alles, was hier nicht steht, existiert nicht — beim Laden wird immer über
   diese Defaults gemergt, damit neue Felder alte Dateien nicht zerbrechen. */

import { DEFAULT_DASHBOARD_TILES } from '@shared/types';
import type { AppSettings, DashboardLayout, VaultSettings } from '@shared/types';

export const APP_SETTINGS_VERSION = 1;
export const VAULT_SETTINGS_VERSION = 1;

/** Startgröße des Hauptfensters. Auch die Untergrenze steht hier, damit sie nur einmal existiert. */
export const WINDOW_DEFAULT = { width: 1440, height: 900 } as const;
export const WINDOW_MIN = { width: 1024, height: 680 } as const;

/* Die Startanordnung steht in `@shared/types`: der Renderer braucht dieselbe für
   „Anordnung zurücksetzen", und zwei Listen wären zwei Wahrheiten. */
export function defaultDashboardLayout(now = new Date().toISOString()): DashboardLayout {
  return { tiles: DEFAULT_DASHBOARD_TILES.map((tile) => ({ ...tile })), updated: now };
}

export function defaultAppSettings(): AppSettings {
  return {
    version: APP_SETTINGS_VERSION,
    lastVault: null,
    recentVaults: [],
    theme: 'dark',
    uiLanguage: 'de',
    window: { width: WINDOW_DEFAULT.width, height: WINDOW_DEFAULT.height },
    startMinimized: false,
    onboarded: false,
  };
}

export function defaultVaultSettings(now = new Date().toISOString()): VaultSettings {
  return {
    version: VAULT_SETTINGS_VERSION,
    languages: { ui: 'de', documents: 'de', conversation: 'de', translateSources: true },
    capture: {
      quickCaptureShortcut: 'Control+Shift+Space',
      autoClassify: true,
      /* 1 = nie automatisch ablegen: die KI schlägt vor, der Mensch bestätigt. */
      closeAfterCapture: true,
    },
    overview: {
      staleAfterDays: 14,
      deadlineHorizonDays: 14,
      waitingNudgeDays: 5,
      useClaudeSessions: true,
      claudeProjectsDir: '',
      notifications: true,
    },
    journal: { mode: 'tips' },
    gardener: { runOnOpen: true, reviewAfterDays: 120, useLlm: true },
    providers: [],
    routing: { tasks: {}, defaults: {} },
    dashboard: defaultDashboardLayout(now),
    preferredTags: [],
  };
}
