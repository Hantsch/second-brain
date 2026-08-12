/* Einstellungen. Zwei Ebenen, bewusst getrennt:
   - App-Settings liegen in userData (maschinengebunden: Fenster, Vault-Historie, Schlüssel)
   - Vault-Settings liegen in `<vault>/.secondbrain/settings.json` (reisen mit dem Vault) */

import type { CoachMode } from './domain';
import type { ProviderConfig, Routing } from './llm';
import type { DashboardLayout } from './overview';

export type UiLanguage = 'de' | 'en';

/** Sprache, in der Dokumente im Vault geschrieben werden. */
export type DocLanguage = 'de' | 'en';

export type ThemeMode = 'dark' | 'light' | 'system';

export interface LanguageSettings {
  /** Sprache der Oberfläche. */
  ui: UiLanguage;
  /** Sprache, in der das LLM Notizen, Wiki-Seiten und Zusammenfassungen schreibt. */
  documents: DocLanguage;
  /** Sprache, in der geantwortet wird (Chat, Coaching). */
  conversation: UiLanguage;
  /** Fremdsprachige Quellen beim Verdichten in die Dokumentsprache übersetzen. */
  translateSources: boolean;
}

/*
 * Es gab hier eine Schwelle, ab der ein Ablage-Vorschlag ohne Rückfrage
 * ausgeführt worden wäre. Sie ist weg: Guardrail 2 lässt sie nicht zu (nichts
 * wird geschrieben, was niemand bestätigt hat), also konnte sie niemand lesen —
 * und ein Schieber in den Einstellungen, den niemand liest, ist eine Behauptung.
 */
export interface CaptureSettings {
  /** Globaler Hotkey für das Schnell-Erfassen-Fenster. */
  quickCaptureShortcut: string;
  /** Dumps nach dem Speichern sofort vom LLM einordnen lassen. */
  autoClassify: boolean;
  /** Nach dem Speichern das Fenster schließen. */
  closeAfterCapture: boolean;
}

export interface OverviewSettings {
  /** Ab wie vielen Tagen ohne Spur ein Projekt als stagnierend gilt. */
  staleAfterDays: number;
  /** Wie viele Tage im Voraus Deadlines auftauchen. */
  deadlineHorizonDays: number;
  /** Warte-auf ohne Frist nach so vielen Tagen anmahnen. */
  waitingNudgeDays: number;
  /** Claude-Sessions als Arbeitsspur mitlesen. */
  useClaudeSessions: boolean;
  /** Wurzel der Claude-Projekte; leer = `~/.claude/projects`. */
  claudeProjectsDir: string;
  /** Windows-Benachrichtigungen für fällige Erinnerungen. */
  notifications: boolean;
}

/*
 * Auch hier standen zwei Schalter zu viel (`askMood`, `extractFacts`). Der
 * Tagesabschluss schlägt vor, was im Text steht, und der Mensch hakt an — es gibt
 * nichts vorab abzuschalten, ohne ihm einen Vorschlag zu verschweigen, den er
 * ohnehin ablehnen kann. Niemand hat sie gelesen; jetzt gibt es sie nicht mehr.
 */
export interface JournalSettings {
  /** Grundhaltung des Coachs — die Vorgabe des Segments auf dem Tagebuch-Screen. */
  mode: CoachMode;
}

export interface GardenerSettings {
  /** Pflegelauf beim Öffnen des Vaults automatisch starten. */
  runOnOpen: boolean;
  /** Seiten, die länger als das nicht überprüft wurden, gelten als angestaubt. */
  reviewAfterDays: number;
  /** Deutet ein LLM die Befunde (Widersprüche, fehlende Seiten)? */
  useLlm: boolean;
}

/** Was mit dem Vault reist. */
export interface VaultSettings {
  version: number;
  languages: LanguageSettings;
  capture: CaptureSettings;
  overview: OverviewSettings;
  journal: JournalSettings;
  gardener: GardenerSettings;
  /** Provider ohne Schlüssel — die Schlüssel bleiben auf der Maschine. */
  providers: ProviderConfig[];
  routing: Routing;
  dashboard: DashboardLayout;
  /** Zusätzliche Tags, die bei der Einordnung bevorzugt werden. */
  preferredTags: string[];
}

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

/** Was an der Maschine hängt. */
export interface AppSettings {
  version: number;
  /** Zuletzt geöffneter Vault. */
  lastVault: string | null;
  /** Verlauf für die Vault-Auswahl. */
  recentVaults: string[];
  theme: ThemeMode;
  /** UI-Sprache, bevor ein Vault geöffnet ist. */
  uiLanguage: UiLanguage;
  window: WindowBounds;
  /** Beim Start minimiert in den Tray. */
  startMinimized: boolean;
  /** Onboarding schon durchlaufen. */
  onboarded: boolean;
}

export interface SettingsSnapshot {
  app: AppSettings;
  /** null, solange kein Vault offen ist. */
  vault: VaultSettings | null;
}
