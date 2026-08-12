/**
 * Die Serie: wie lange schon geschrieben wird, wie es sich anfuehlte.
 *
 * Reine Funktionen ueber die abgeleiteten Tage — kein Dateizugriff, keine Uhr.
 * „Heute" kommt immer von aussen, sonst waere eine Serie nicht testbar.
 *
 * Die laufende Serie und der Stimmungsverlauf des Dashboards rechnen in
 * `core/overview/dashboard`; von dort kommen sie hierher, statt zweimal zu
 * existieren. Ergaenzt wird, was das Tagebuch selbst zeigt: die laengste Serie,
 * der Monat und ein Verlauf, in dem auch Energie und Datum stehen.
 */

import type { JournalDay } from '@shared/types';
import { journalStreak, shiftDay, windowStart } from '@core/overview';
import { isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';

/** Standard-Fenster des Stimmungsverlaufs in Tagen. */
export const DEFAULT_MOOD_SPAN = 21;

/** Ein Tag im Stimmungsverlauf. Fehlende Angaben bleiben `null` — nicht geraten. */
export interface MoodPoint {
  date: string;
  mood: number | null;
  energy: number | null;
}

/** Was das Tagebuch ueber die Serie sagt. */
export interface JournalStreakStats {
  /** Tage in Folge mit Eintrag, bis heute oder gestern. */
  current: number;
  /** Die laengste Serie im Bestand. */
  longest: number;
  /** Datum des juengsten Eintrags; `null`, wenn es keinen gibt. */
  lastEntry: string | null;
  /** Eintraege im Kalendermonat von `today`. */
  entriesThisMonth: number;
  /** Eintraege insgesamt. */
  total: number;
}

/** Alle Tage mit Eintrag, aufsteigend und ohne Wiederholung. */
function dayList(days: readonly JournalDay[]): string[] {
  const dates = new Set<string>();
  for (const day of days) {
    if (day.date.length > 0) dates.add(day.date);
  }
  return [...dates].sort();
}

/**
 * Die laengste Serie aufeinanderfolgender Tage im Bestand. Eine Luecke von einem
 * Tag beendet sie — auch ueber Monats- und Jahresgrenzen hinweg.
 */
export function longestStreak(days: readonly JournalDay[]): number {
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of dayList(days)) {
    run = previous !== null && shiftDay(previous, 1) === date ? run + 1 : 1;
    previous = date;
    if (run > longest) longest = run;
  }
  return longest;
}

/** Eintraege im Kalendermonat von `when`. */
export function entriesInMonth(days: readonly JournalDay[], when: DateLike): number {
  const month = isoDay(when).slice(0, 7);
  return dayList(days).filter((date) => date.startsWith(month)).length;
}

/** Datum des juengsten Eintrags; `null`, wenn keiner da ist. */
export function lastEntryDate(days: readonly JournalDay[]): string | null {
  const dates = dayList(days);
  return dates.length === 0 ? null : (dates[dates.length - 1] ?? null);
}

/**
 * Der Stimmungsverlauf der letzten `span` Tage, aeltester zuerst. Nur Tage mit
 * Eintrag stehen darin — ein Tag ohne Eintrag ist keine Stimmung von null.
 */
export function moodHistory(
  days: readonly JournalDay[],
  today: DateLike,
  span: number = DEFAULT_MOOD_SPAN,
): MoodPoint[] {
  const end = isoDay(today);
  const start = windowStart(end, span);
  return days
    .filter((day) => day.date >= start && day.date <= end)
    .map((day) => ({ date: day.date, mood: day.mood, energy: day.energy }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Alles ueber die Serie in einem Zug. */
export function journalStreaks(days: readonly JournalDay[], today: DateLike): JournalStreakStats {
  const day = isoDay(today);
  return {
    current: journalStreak(days, day),
    longest: longestStreak(days),
    lastEntry: lastEntryDate(days),
    entriesThisMonth: entriesInMonth(days, day),
    total: dayList(days).length,
  };
}
