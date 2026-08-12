/**
 * Oeffentliche Oberflaeche des Ueberblicks. Andere Module importieren von hier.
 *
 *   `recent`     „woran habe ich gearbeitet" — Dateien, Sitzungen, Journal, Quellen
 *   `reminders`  Fristen, ueberfaellige Antworten, stagnierende Projekte
 *   `dashboard`  alles fuer einen Rutsch, Todos nach Arbeit und Privat getrennt
 *   `status`     Statusvorschlag je Projekt, mit und ohne Modell
 *
 * Nichts hier liest oder schreibt eine Datei; alles rechnet auf dem Index.
 */

export {
  DEFAULT_DEADLINE_HORIZON_DAYS,
  DEFAULT_RECENT_DAYS,
  DEFAULT_RECENT_LIMIT,
  DEFAULT_STALE_AFTER_DAYS,
  DEFAULT_TODO_LIMIT,
  DEFAULT_WAITING_NUDGE_DAYS,
  MOOD_TREND_DAYS,
  SOON_DAYS,
  limits,
  type OverviewIndex,
  type OverviewLimits,
} from './types';
export { shiftDay, windowStart } from './dates';
export { GERMAN_RECENT_LABELS, type RecentWorkLabels } from './labels';
export { recentWork, type RecentWorkOptions } from './recent';
export { closedProjects, reminders, urgencyFor } from './reminders';
export {
  dashboardData,
  inboxCount,
  journalStreak,
  moodTrend,
  openTodos,
  staleProjects,
  waitingList,
  type DashboardOptions,
} from './dashboard';
export {
  heuristicStatus,
  suggestProjectStatus,
  type ProjectStatusSuggestion,
  type SuggestStatusDeps,
} from './status';
