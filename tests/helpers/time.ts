/* Zeit in Tests: eine feste Gegenwart, gerechnet in UTC.
 *
 * Warum UTC: `day(-3)` muss auf jedem Rechner dasselbe Datum liefern, egal in
 * welcher Zeitzone die Tests laufen. Für Frontmatter zählt ohnehin nur der
 * Kalendertag.
 *
 * `TODAY` und `NOW` sind dieselben Werte, die die Mock-Fixtures des Renderers
 * benutzen (`src/renderer/lib/mock-fixtures.ts`) — damit reden Renderer- und
 * Kern-Tests über denselben Tag.
 */

import { vi } from 'vitest';

/** Die feste Gegenwart aller Tests, als Kalendertag. */
export const TODAY = '2026-08-10';

/** Die feste Gegenwart als Zeitstempel (Sommerzeit Mitteleuropa). */
export const NOW = '2026-08-10T14:32:00+02:00';

/** `NOW` in Millisekunden — für `vi.setSystemTime` und eigene Rechnungen. */
export const NOW_MS = Date.parse(NOW);

const DAY_MS = 86_400_000;
const TODAY_UTC = Date.parse(`${TODAY}T00:00:00Z`);

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Kalendertag relativ zu `TODAY`: negativ ist Vergangenheit, positiv Zukunft. */
export function day(offsetDays = 0): string {
  const date = new Date(TODAY_UTC + offsetDays * DAY_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Zeitstempel zu einem Tag, mit fester Zone — reicht für Frontmatter-Vergleiche. */
export function stamp(offsetDays = 0, time = '09:00'): string {
  return `${day(offsetDays)}T${time.length === 5 ? `${time}:00` : time}+02:00`;
}

/** Tage zwischen zwei Kalendertagen; positiv, wenn `later` später liegt. */
export function daysBetween(earlier: string, later: string = TODAY): number {
  const from = Date.parse(`${earlier.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${later.slice(0, 10)}T00:00:00Z`);
  return Math.round((to - from) / DAY_MS);
}

/**
 * Friert die Uhr auf `NOW` ein. Nur `Date` wird ersetzt, keine Timer — sonst
 * würden `await`-Ketten und Testing-Library-Wartefunktionen hängen.
 * Der Rückgabewert stellt die echte Uhr wieder her; `tests/setup.ts` tut das
 * ohnehin nach jedem Test.
 */
export function freezeTime(at: string | number = NOW_MS): () => void {
  vi.useFakeTimers({ now: typeof at === 'string' ? Date.parse(at) : at, toFake: ['Date'] });
  return () => vi.useRealTimers();
}

/** Führt `run` mit eingefrorener Uhr aus und gibt die echte Uhr sicher zurück. */
export async function withFrozenTime<T>(
  run: () => T | Promise<T>,
  at?: string | number,
): Promise<T> {
  const restore = freezeTime(at);
  try {
    return await run();
  } finally {
    restore();
  }
}
