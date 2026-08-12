/* Überblick: Dashboard-Module, Erinnerungen, Claude-Sessions, Pflege-Befunde. */

import type { Scope } from './vault';
import type { Todo, WaitingOn } from './domain';

/** Alle Bausteine, die auf dem Dashboard liegen können. */
export type DashboardModuleId =
  | 'quick-capture'
  | 'ask'
  | 'recent-work'
  | 'stale-projects'
  | 'todos-work'
  | 'todos-private'
  | 'waiting-on'
  | 'deadlines'
  | 'inbox'
  | 'journal-streak'
  | 'gardener'
  | 'claude-sessions'
  | 'active-projects';

/**
 * Dieselbe Menge zur Laufzeit. Main und Renderer brauchen sie beide: der Main
 * prüft damit eine hereinkommende Anordnung, der Renderer baut daraus die Auswahl
 * der Module. Die Reihenfolge ist die Vorgabe-Reihenfolge des Katalogs.
 */
export const DASHBOARD_MODULES: readonly DashboardModuleId[] = [
  'quick-capture',
  'ask',
  'recent-work',
  'deadlines',
  'waiting-on',
  'todos-work',
  'todos-private',
  'active-projects',
  'inbox',
  'stale-projects',
  'journal-streak',
  'claude-sessions',
  'gardener',
];

export type ModuleSize = 'sm' | 'md' | 'lg' | 'xl';

/** Von schmal nach breit — die Auswahl im Kartenmenü folgt dieser Reihenfolge. */
export const MODULE_SIZES: readonly ModuleSize[] = ['sm', 'md', 'lg', 'xl'];

export interface DashboardTile {
  id: DashboardModuleId;
  size: ModuleSize;
  /** Ausgeblendet, aber in der Auswahl vorhanden. */
  hidden?: boolean;
  /** Modul-spezifische Einstellungen, z. B. Anzahl Zeilen. */
  options?: Record<string, unknown>;
}

export interface DashboardLayout {
  /** Reihenfolge = Position im Grid, von links oben nach rechts unten. */
  tiles: DashboardTile[];
  updated: string;
}

/**
 * Die Startanordnung: **Signal zuerst.** Sichtbar sind fünf Module: die drei
 * Fragen aus CLAUDE.md (was ansteht, worauf gewartet wird, woran zuletzt
 * gearbeitet wurde, die offenen Aufgaben der Arbeit) — und der Gesundheitswert
 * der Pflege. Sie steht hier und nicht in `main/settings-defaults`, weil auch der
 * Renderer sie braucht: „Anordnung zurücksetzen" muss dieselbe Reihenfolge
 * ergeben wie ein frischer Vault.
 *
 * Acht Module starten ausgeblendet, und zwar aus einem Grund: **Platz ist die
 * knappe Ressource.** Das Standardgitter muss auf 1152×720 unter zwei
 * Bildschirmen bleiben (geprüft in `scripts/shot.mjs`), sonst beantwortet der
 * Screen seine eine Frage erst nach dem Rollen. Zwei leere Eingabefelder
 * („Schnell erfassen", „Frage") auf der wertvollsten Fläche sind dafür der
 * schlechteste Tausch: beides ist einen Tastendruck entfernt
 * (`Ctrl+Shift+Space`, Ziffer 4) und steht als Knopf in der Kopfzeile.
 *
 * **„Pflege" ist sichtbar**, seit der Pflegelauf existiert: die Kachel zeigt den
 * Gesundheitswert und die zwei dringendsten Kategorien — und ohne Lauf sagt sie
 * „noch nicht geprüft" statt einer erfundenen Zahl. Kein anderes Modul trägt das
 * Signal „glaube ich meinem Archiv noch?".
 *
 * Dafür startet **„Todos Privat" ausgeblendet**, und zwar nicht aus Geschmack:
 * bei 1152 px sind zwei Spalten, sechs sichtbare Module ergeben vier Reihen, und
 * vier Reihen reißen das Budget von zwei Bildschirmen. Von den fünf war dieses
 * das entbehrlichste — was privat eine Frist hat, steht ohnehin in „Steht an"
 * (die Erinnerungen kennen beide Bereiche), und die ganze Liste ist einen Haken
 * in der Auswahl bzw. einen Klick im Projekte-Screen entfernt.
 *
 * Ausgeblendet heißt nicht weg: alle dreizehn stehen in der Auswahl („Module"),
 * mit einem Haken und der Wirkung sofort. Jedes Modul kommt genau einmal vor.
 */
export const DEFAULT_DASHBOARD_TILES: readonly DashboardTile[] = [
  { id: 'deadlines', size: 'md' },
  { id: 'waiting-on', size: 'md' },
  { id: 'recent-work', size: 'xl' },
  { id: 'todos-work', size: 'md' },
  { id: 'gardener', size: 'sm' },
  { id: 'todos-private', size: 'md', hidden: true },
  { id: 'active-projects', size: 'xl', hidden: true },
  { id: 'inbox', size: 'sm', hidden: true },
  { id: 'stale-projects', size: 'md', hidden: true },
  { id: 'journal-streak', size: 'sm', hidden: true },
  { id: 'claude-sessions', size: 'md', hidden: true },
  { id: 'quick-capture', size: 'md', hidden: true },
  { id: 'ask', size: 'md', hidden: true },
];

/** Was eine Erinnerung auslöst. */
export type ReminderSource = 'todo-due' | 'project-deadline' | 'waiting-overdue' | 'stale-project';

export type ReminderUrgency = 'overdue' | 'today' | 'soon' | 'upcoming';

export interface Reminder {
  id: string;
  source: ReminderSource;
  urgency: ReminderUrgency;
  title: string;
  /** Wann es fällig ist bzw. war, ISO-Datum. */
  date: string;
  daysOut: number;
  scope: Scope;
  /** Datei, die dahinter steht. */
  path: string;
  project: string | null;
  who: string | null;
}

/** Eine Claude-Code-Session, aus `~/.claude/projects` gelesen. */
export interface ClaudeSession {
  id: string;
  /** Arbeitsverzeichnis der Session. */
  cwd: string;
  /** Kurzer Projektname aus dem Pfad. */
  projectName: string;
  /** Verknüpftes Vault-Projekt, wenn zuordenbar. */
  vaultProject: string | null;
  gitBranch: string | null;
  startedAt: string;
  lastActivity: string;
  messageCount: number;
  /** Erste Nutzer-Nachricht, gekürzt — woran gearbeitet wurde. */
  firstPrompt: string;
  /** Zusammenfassung der Session, falls Claude eine geschrieben hat. */
  summary: string | null;
  /** Vom Nutzer berührte Dateien, die häufigsten zuerst. */
  files: string[];
}

/** Arbeit der letzten Tage, aus Dateiänderungen und Claude-Sessions gemischt. */
export interface RecentWorkItem {
  at: string;
  kind: 'file' | 'claude-session' | 'journal' | 'ingest';
  title: string;
  detail: string;
  path: string | null;
  project: string | null;
  scope: Scope | null;
}

/** Ein Befund des Pflegelaufs — das Gegenmittel gegen ein verrottendes Wiki. */
export type GardenerFindingKind =
  /** Seite, auf die niemand verlinkt. */
  | 'orphan'
  /** Wikilink, der ins Nichts zeigt. */
  | 'broken-link'
  /** Seite fehlt im `index.md` des Moduls oder steht dort falsch. */
  | 'index-drift'
  /** Seite ist alt und wurde nie überprüft. */
  | 'stale-page'
  /** Zwei Seiten behaupten Widersprüchliches. */
  | 'contradiction'
  /** Häufig genannter Begriff ohne eigene Seite. */
  | 'missing-page'
  /** Zwei Seiten sind fast dasselbe. */
  | 'near-duplicate'
  /** Dump liegt zu lange unsortiert in der Inbox. */
  | 'unfiled-dump'
  /** Quelle liegt in `raw/`, ist aber nie verdichtet worden. */
  | 'unprocessed-source'
  /** Projekt ohne nächsten Schritt. */
  | 'project-without-next-step';

export type FindingSeverity = 'info' | 'warn' | 'high';

export interface GardenerFinding {
  id: string;
  kind: GardenerFindingKind;
  severity: FindingSeverity;
  title: string;
  detail: string;
  /** Betroffene Dateien. */
  paths: string[];
  module: string | null;
  foundAt: string;
  /** Vorschlag, den der Nutzer per Klick annehmen kann. */
  fix: GardenerFix | null;
  /** Vom Nutzer als „passt so" markiert — taucht nicht wieder auf. */
  dismissed?: boolean;
}

export interface GardenerFix {
  /** Was der Klick tut. */
  action:
    'add-to-index' | 'add-links' | 'mark-reviewed' | 'open-classify' | 'open-ingest' | 'merge';
  label: string;
  /** Vorschau der Änderung, wenn maschinell erzeugbar. */
  preview: string | null;
}

/**
 * Woher der Gesundheitswert kommt. Eine Zahl ohne Begründung ist eine
 * Behauptung — mit dieser Aufschlüsselung kann der Screen sagen, **warum** der
 * Wert so ist. Die Punkte summieren sich auf `100 − health`.
 */
export interface GardenerHealthContribution {
  kind: GardenerFindingKind;
  count: number;
  /** Verlorene Punkte dieser Kategorie, gerundet. */
  points: number;
}

export interface GardenerReport {
  ranAt: string;
  /** Wurde ein LLM benutzt, oder nur die deterministischen Checks? */
  usedLlm: boolean;
  findings: GardenerFinding[];
  /** Gesundheitswert 0..100, aus Anzahl und Schwere der Befunde. */
  health: number;
  /**
   * Gibt es überhaupt Bestand, auf den sich der Wert beziehen kann? `false`
   * heißt: `health` ist unbekannt, nicht 0 — ein leerer Vault hat keine
   * Gesundheit. Dieselbe Zusage wie `DashboardData.healthKnown`.
   */
  healthKnown?: boolean;
  /** Beiträge je Kategorie, größter zuerst. */
  healthContributions?: GardenerHealthContribution[];
  /** Was der Nutzer als nächstes tun sollte, höchstens drei Sätze. */
  advice: string[];
}

/** Alles, was das Dashboard in einem Rutsch braucht. */
export interface DashboardData {
  reminders: Reminder[];
  recentWork: RecentWorkItem[];
  staleProjects: string[];
  todos: { work: Todo[]; private: Todo[] };
  waitingOn: (WaitingOn & { project: string; projectTitle: string; path: string })[];
  inboxCount: number;
  journal: { streak: number; lastEntry: string | null; moodTrend: number[] };
  health: number;
  findingCount: number;
  /**
   * Liegt ein Pflegelauf vor? `false` heißt: `health` und `findingCount` sind
   * unbekannt, nicht null — die Karte sagt „noch nicht geprüft" statt eine Zahl
   * zu behaupten.
   */
  healthKnown?: boolean;
  sessions: ClaudeSession[];
}
