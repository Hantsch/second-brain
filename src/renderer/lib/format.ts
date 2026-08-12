/* Numbers, dates, and deadlines for display. Everything the user reads
   comes from `t()`; this file only computes and assembles.

   Calculations use calendar days, not 24-hour blocks: "due tomorrow" stays
   due tomorrow no matter whether it's 8am or 11pm. The core computes it the
   same way (`core/index/dates`) — it's duplicated here because the renderer
   doesn't know the core. */

import { t } from '../i18n';
import type { UiLanguage } from '@shared/types';

const MS_PER_DAY = 86_400_000;

function locale(language: UiLanguage): string {
  return language === 'de' ? 'de-DE' : 'en-GB';
}

/** Midnight of the calendar day in local time. */
function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/** Calendar days between two points in time. Positive if `to` is later. */
export function dayDiff(from: Date, to: Date): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / MS_PER_DAY);
}

/** Number with thousands separators for the UI language. */
export function formatNumber(value: number, language: UiLanguage): string {
  return new Intl.NumberFormat(locale(language)).format(value);
}

/** Short date: '10. Aug. 2026' or '10 Aug 2026'. Empty for an unusable value. */
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
 * How long ago something was: "today", "yesterday", "5 days ago". From one
 * week on, the date is shown instead — "34 days ago" requires doing the math.
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

/** Deadline as a sentence: overdue, today, tomorrow, in N days. */
export function formatDue(dueInDays: number | null): string {
  if (dueInDays === null) return t('due.none');
  if (dueInDays < -1) return t('due.overdue', { count: Math.abs(dueInDays) });
  if (dueInDays === -1) return t('due.overdueOne');
  if (dueInDays === 0) return t('due.today');
  if (dueInDays === 1) return t('due.tomorrow');
  return t('due.inDays', { count: dueInDays });
}

/** How urgent a deadline is — controls only the color, never the text. */
export function dueTone(dueInDays: number | null): 'overdue' | 'soon' | 'later' | 'none' {
  if (dueInDays === null) return 'none';
  if (dueInDays < 0) return 'overdue';
  return dueInDays <= 2 ? 'soon' : 'later';
}

/** Singular or plural via two keys — German and English both need them. */
export function plural(count: number, oneKey: string, manyKey: string): string {
  return count === 1 ? t(oneKey) : t(manyKey, { count });
}
