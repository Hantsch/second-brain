/* The defaults of both settings levels in one place.
   Anything not listed here does not exist — loading always merges over
   these defaults so new fields don't break old files. */

import { DEFAULT_DASHBOARD_TILES } from '@shared/types';
import type { AppSettings, DashboardLayout, VaultSettings } from '@shared/types';

export const APP_SETTINGS_VERSION = 2;
export const VAULT_SETTINGS_VERSION = 1;

/** Default size of the main window. The lower bound lives here too, so it exists only once. */
export const WINDOW_DEFAULT = { width: 1440, height: 900 } as const;
export const WINDOW_MIN = { width: 1024, height: 680 } as const;

/* The default layout lives in `@shared/types`: the renderer needs the same one
   for "reset layout", and two lists would be two truths. */
export function defaultDashboardLayout(now = new Date().toISOString()): DashboardLayout {
  return { tiles: DEFAULT_DASHBOARD_TILES.map((tile) => ({ ...tile })), updated: now };
}

export function defaultAppSettings(): AppSettings {
  return {
    version: APP_SETTINGS_VERSION,
    lastVault: null,
    recentVaults: [],
    theme: 'dark',
    customization: { background: 'none', appIcon: 'knowledge-garden' },
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
      /* 1 = never file automatically: the AI proposes, the human confirms. */
      closeAfterCapture: true,
    },
    overview: {
      staleAfterDays: 14,
      deadlineHorizonDays: 14,
      waitingNudgeDays: 5,
      useClaudeSessions: true,
      claudeProjectsDir: '',
      useCodexSessions: true,
      codexSessionsDir: '',
      notifications: true,
      dismissedAgentProjects: [],
      showEmptySessionsTab: false,
    },
    journal: { mode: 'tips' },
    gardener: { runOnOpen: true, reviewAfterDays: 120, useLlm: true },
    providers: [],
    routing: { tasks: {}, defaults: {} },
    dashboard: defaultDashboardLayout(now),
    preferredTags: [],
  };
}
