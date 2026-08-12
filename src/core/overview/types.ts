/**
 * Der Vertrag des Ueberblicks.
 *
 * Der Ueberblick rechnet nur — er liest keine Datei und schreibt keine. Alles, was
 * er braucht, steht schon im Index; die Claude-Sitzungen kommen als Liste herein.
 * Deshalb ist `OverviewIndex` eine schmale Sicht, die `IndexService` strukturell
 * erfuellt (wie `CaptureIndex` im Erfassen).
 *
 * Das „heute" kommt immer von aussen. Kein Modul hier ruft `Date.now()` — sonst
 * waeren Fristen, Serien und Stagnation nicht testbar.
 */

import type { OverviewSettings, Project, RawSource, Todo } from '@shared/types';
import type { IndexedDoc } from '@core/index/types';

/** Was der Ueberblick am Index benutzt. */
export interface OverviewIndex {
  projects(): readonly Project[];
  todos(): readonly Todo[];
  sources(): readonly RawSource[];
  /** Der abgeleitete Zustand; Journal, Dumps und Bereiche stehen in den Dokumenten. */
  index(): { docs: readonly IndexedDoc[] };
}

/**
 * Die Schwellen aus den Vault-Einstellungen. `OverviewSettings` erfuellt das —
 * Aufrufer koennen die ganzen Einstellungen durchgeben.
 */
export type OverviewLimits = Partial<
  Pick<OverviewSettings, 'staleAfterDays' | 'deadlineHorizonDays' | 'waitingNudgeDays'>
>;

/** Ab so vielen Tagen ohne Spur gilt ein Projekt als stagnierend. */
export const DEFAULT_STALE_AFTER_DAYS = 14;

/** So weit im Voraus tauchen Fristen auf. */
export const DEFAULT_DEADLINE_HORIZON_DAYS = 14;

/** Warte-auf ohne Frist wird nach so vielen Tagen angemahnt. */
export const DEFAULT_WAITING_NUDGE_DAYS = 5;

/** Bis zu so vielen Tagen Vorlauf gilt eine Frist als „bald". */
export const SOON_DAYS = 3;

/** So viele Zeilen liefert „zuletzt gearbeitet", wenn niemand eine Zahl nennt. */
export const DEFAULT_RECENT_LIMIT = 12;

/** So weit zurueck schaut „zuletzt gearbeitet". */
export const DEFAULT_RECENT_DAYS = 14;

/** So viele Todos je Bereich liefert das Dashboard. */
export const DEFAULT_TODO_LIMIT = 10;

/** So viele Tage weit reicht die Stimmungsreihe. */
export const MOOD_TREND_DAYS = 14;

/** Vollstaendige Schwellen aus teilweisen Einstellungen. */
export function limits(settings: OverviewLimits | undefined): Required<OverviewLimits> {
  return {
    staleAfterDays: settings?.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS,
    deadlineHorizonDays: settings?.deadlineHorizonDays ?? DEFAULT_DEADLINE_HORIZON_DAYS,
    waitingNudgeDays: settings?.waitingNudgeDays ?? DEFAULT_WAITING_NUDGE_DAYS,
  };
}
