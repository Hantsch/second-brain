/**
 * Tagesrechnung des Index.
 *
 * Alle Fristen werden in **Kalendertagen** gerechnet, nicht in 24-Stunden-Bloecken:
 * „morgen faellig" bleibt morgen faellig, egal ob es 8 oder 23 Uhr ist.
 *
 * Das „heute" kommt immer von aussen. Kein Modul hier ruft `Date.now()` — sonst
 * waeren Fristen nicht testbar.
 */

import { isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';

const MS_PER_DAY = 86_400_000;

/** Mitternacht (UTC) des Kalendertags 'YYYY-MM-DD' als Millisekunden. */
function dayValue(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Kalendertage von `from` bis `to`. Positiv, wenn `to` spaeter liegt.
 * `null`, wenn eines der beiden Daten unbrauchbar ist.
 */
export function daysBetween(from: string, to: string): number | null {
  const a = dayValue(from);
  const b = dayValue(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * Tage bis zur Frist, bezogen auf `today`. Negativ heisst ueberfaellig,
 * 0 heisst heute. `null`, wenn kein Datum vorliegt.
 */
export function dueInDays(due: string | null, today: DateLike): number | null {
  if (due === null) return null;
  return daysBetween(isoDay(today), isoDay(due));
}

/** Tage seit einem Zeitpunkt, bezogen auf `now`. Nie negativ. */
export function ageInDays(at: string | null, now: DateLike): number {
  if (at === null || at.length === 0) return 0;
  const parsed = new Date(at);
  if (Number.isNaN(parsed.getTime())) return 0;
  const days = daysBetween(isoDay(parsed), isoDay(now));
  return days === null ? 0 : Math.max(0, days);
}

/** Der spaetere von zwei ISO-Zeitpunkten. Unbrauchbare Werte verlieren. */
export function laterOf(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  const first = new Date(a).getTime();
  const second = new Date(b).getTime();
  if (Number.isNaN(first)) return Number.isNaN(second) ? null : b;
  if (Number.isNaN(second)) return a;
  return second > first ? b : a;
}
