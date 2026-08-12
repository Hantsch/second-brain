/**
 * Kalenderrechnung des Ueberblicks.
 *
 * Gerechnet wird in **Kalendertagen** und in UTC, genau wie in `index/dates.ts`:
 * „vor 14 Tagen" muss auf jedem Rechner denselben Tag ergeben, egal in welcher
 * Zeitzone die App laeuft. `isoDay` aus dem Vault liefert den lokalen Tag eines
 * Zeitstempels — von dort an wird nur noch mit Tagesketten gerechnet, nie mit
 * Millisekunden.
 */

import { isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';

const MS_PER_DAY = 86_400_000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Kalendertag 'YYYY-MM-DD' um `offset` Tage verschoben. Negativ heisst zurueck. */
export function shiftDay(day: string, offset: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!match) return day;
  const base = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const shifted = new Date(base + offset * MS_PER_DAY);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Der Kalendertag, ab dem ein Fenster von `days` Tagen zaehlt (heute eingeschlossen). */
export function windowStart(now: DateLike, days: number): string {
  return shiftDay(isoDay(now), -Math.max(0, days - 1));
}
