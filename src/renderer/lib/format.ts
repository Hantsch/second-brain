/* Zahlen, Daten und Fristen für die Anzeige. Alles, was der Nutzer liest, kommt
   aus `t()`; hier wird nur gerechnet und zusammengesetzt.

   Gerechnet wird in Kalendertagen, nicht in 24-Stunden-Blöcken: „morgen fällig"
   bleibt morgen fällig, egal ob es 8 oder 23 Uhr ist. Der Kern rechnet genauso
   (`core/index/dates`) — hier steht es nochmal, weil der Renderer den Kern nicht
   kennt. */

import { t } from '../i18n';
import type { UiLanguage } from '@shared/types';

const MS_PER_DAY = 86_400_000;

function locale(language: UiLanguage): string {
  return language === 'de' ? 'de-DE' : 'en-GB';
}

/** Mitternacht des Kalendertags in lokaler Zeit. */
function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/** Kalendertage zwischen zwei Zeitpunkten. Positiv, wenn `to` später liegt. */
export function dayDiff(from: Date, to: Date): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / MS_PER_DAY);
}

/** Zahl mit Tausendertrennung der Oberflächensprache. */
export function formatNumber(value: number, language: UiLanguage): string {
  return new Intl.NumberFormat(locale(language)).format(value);
}

/** Datum kurz: '10. Aug. 2026' bzw. '10 Aug 2026'. Leer bei unbrauchbarem Wert. */
export function formatDate(iso: string | null, language: UiLanguage): string {
  if (iso === null || iso.length === 0) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Wie lange etwas her ist: „heute", „gestern", „vor 5 Tagen". Ab einer Woche
 * steht das Datum da — „vor 34 Tagen" muss man nachrechnen.
 */
export function formatAge(iso: string | null, language: UiLanguage, now = new Date()): string {
  if (iso === null || iso.length === 0) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = dayDiff(date, now);
  if (days <= 0) return t('time.today');
  if (days === 1) return t('time.yesterday');
  if (days < 7) return t('time.daysAgo', { count: days });
  return formatDate(iso, language);
}

/** Frist als Satz: überfällig, heute, morgen, in N Tagen. */
export function formatDue(dueInDays: number | null): string {
  if (dueInDays === null) return t('due.none');
  if (dueInDays < -1) return t('due.overdue', { count: Math.abs(dueInDays) });
  if (dueInDays === -1) return t('due.overdueOne');
  if (dueInDays === 0) return t('due.today');
  if (dueInDays === 1) return t('due.tomorrow');
  return t('due.inDays', { count: dueInDays });
}

/** Wie dringend eine Frist ist — steuert nur die Farbe, nie den Text. */
export function dueTone(dueInDays: number | null): 'overdue' | 'soon' | 'later' | 'none' {
  if (dueInDays === null) return 'none';
  if (dueInDays < 0) return 'overdue';
  return dueInDays <= 2 ? 'soon' : 'later';
}

/** Ein- oder Mehrzahl über zwei Keys — Deutsch und Englisch brauchen beide. */
export function plural(count: number, oneKey: string, manyKey: string): string {
  return count === 1 ? t(oneKey) : t(manyKey, { count });
}
