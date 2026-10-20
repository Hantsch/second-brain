/* Numbers, dates, and deadlines for display. Everything the user reads
   comes from `t()`; this file only computes and assembles.

   Calculations use calendar days, not 24-hour blocks: "due tomorrow" stays
   due tomorrow no matter whether it's 8am or 11pm. The core computes it the
   same way (`core/index/dates`) — it's duplicated here because the renderer
   doesn't know the core. */

import { t } from '../i18n';
import type { UiLanguage } from '@shared/types';

const MS_PER_DAY = 86_400_000;

/** BCP-47 locale for the UI language — shared by every `Intl` call in the
    renderer, so a date or number never picks its own separate idea of the
    locale (`MonthCalendar.tsx` is the first caller outside this file). */
export function locale(language: UiLanguage): string {
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

/** Compact binary file size for source details. */
export function formatBytes(bytes: number | null, language: UiLanguage): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${new Intl.NumberFormat(locale(language), { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
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

/** Date and time of day, for a moment the user may want to compare to the clock. */
export function formatDateTime(iso: string | null, language: UiLanguage): string {
  if (iso === null || iso.length === 0) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

/**
 * Compact session/job duration: '42m', '1h 12m'. Units are technical
 * notation, not prose — same convention as `formatBytes`'s 'KB'/'MB', so no
 * `t()` lookup for the letter itself. Callers render `null` (the trail
 * didn't record a duration) as their own "unknown" text; this function only
 * covers the "we have a number" case.
 */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  if (totalMinutes < 1) return '<1m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Tiny per-run cost estimate, e.g. $0.0012 — a normal 2-decimal currency
    format would round it to $0.00 and hide the only digits that matter. */
export function formatCostUsd(value: number, language: UiLanguage): string {
  return new Intl.NumberFormat(locale(language), {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

/** Singular or plural via two keys — German and English both need them. */
export function plural(count: number, oneKey: string, manyKey: string): string {
  return count === 1 ? t(oneKey) : t(manyKey, { count });
}
