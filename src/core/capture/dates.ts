/**
 * Datumsangaben in deutschem Freitext → Kalendertag.
 *
 * Erkannt wird, was in echten Dumps steht: 'heute', 'morgen', 'naechste Woche',
 * '15.08.', '15.08.2026', '2026-08-15', '15. August', 'KW 34', 'bis Freitag',
 * 'in 3 Tagen'. Alles Uebrige bleibt liegen — eine falsche Frist ist schlimmer
 * als keine.
 *
 * Das „heute" kommt immer von aussen. Keine Funktion hier fragt die Uhr, sonst
 * waeren Fristen nicht testbar.
 */

import { fold } from '@core/index/text';
import { LEFT_EDGE, RIGHT_EDGE, matchAll, wordRegex } from './words';

const DAY_MS = 86_400_000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dayValue(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function isoFrom(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Kalendertag plus `days`. Unbrauchbare Eingabe kommt unveraendert zurueck. */
export function addDays(iso: string, days: number): string {
  const value = dayValue(iso);
  return value === null ? iso : isoFrom(value + days * DAY_MS);
}

/** Wochentag: 1 = Montag ... 7 = Sonntag. */
export function weekdayOf(iso: string): number {
  const value = dayValue(iso);
  if (value === null) return 1;
  const day = new Date(value).getUTCDay();
  return day === 0 ? 7 : day;
}

function diffDays(from: string, to: string): number {
  const a = dayValue(from);
  const b = dayValue(to);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / DAY_MS);
}

/** Kalendertag aus Zahlen; `null`, wenn es den Tag nicht gibt (31.02.). */
function plainDay(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = isoFrom(Date.UTC(year, month - 1, day));
  return iso.endsWith(`-${pad(month)}-${pad(day)}`) ? iso : null;
}

function nextWeekday(today: string, target: number): string {
  return addDays(today, (target - weekdayOf(today) + 7) % 7);
}

function nextMonday(today: string): string {
  const delta = (1 - weekdayOf(today) + 7) % 7;
  return addDays(today, delta === 0 ? 7 : delta);
}

/** Montag der ISO-Kalenderwoche. Der 4. Januar liegt immer in Woche 1. */
function mondayOfIsoWeek(year: number, week: number): string | null {
  if (week < 1 || week > 53) return null;
  const jan4 = Date.UTC(year, 0, 4);
  const firstMonday = jan4 - (weekdayOf(isoFrom(jan4)) - 1) * DAY_MS;
  return isoFrom(firstMonday + (week - 1) * 7 * DAY_MS);
}

function endOfMonth(today: string): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return isoFrom(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1) - DAY_MS);
}

/** Ein erkanntes Datum samt der Stelle, die dazu gefuehrt hat. */
export interface DateHit {
  /** Kalendertag als 'YYYY-MM-DD'. */
  iso: string;
  /** Wortwoertlich, was im Text stand — Futter fuer die Begruendung. */
  label: string;
}

const WEEKDAYS: readonly [string, number][] = [
  ['montag', 1],
  ['dienstag', 2],
  ['mittwoch', 3],
  ['donnerstag', 4],
  ['freitag', 5],
  ['samstag', 6],
  ['sonnabend', 6],
  ['sonntag', 7],
];

const MONTH_KEYS: readonly string[] = [
  'januar',
  'februar',
  'maerz',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'dezember',
];

const ISO_DATE = /(?<![\p{L}\p{N}])(\d{4})-(\d{2})-(\d{2})(?![\p{N}])/gu;
const NUMERIC_DATE = /(?<![\p{L}\p{N}])(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{4}|\d{2}))?(?![\p{N}])/gu;
const MONTH_DATE = new RegExp(
  `${LEFT_EDGE}(\\d{1,2})\\.?\\s+(${MONTH_KEYS.join('|').replace('maerz', 'm(?:ä|ae)rz')})${RIGHT_EDGE}`,
  'giu',
);
const CALENDAR_WEEK = wordRegex('KW\\s?(\\d{1,2})');
const IN_DAYS = wordRegex('in\\s+(\\d{1,2})\\s+Tagen');

/** Feste Wendungen, die auf einen Tag zeigen. */
const PHRASES: readonly [RegExp, (today: string) => string][] = [
  [wordRegex('(?:ü|ue)bermorgen'), (today) => addDays(today, 2)],
  [wordRegex('heute'), (today) => today],
  [wordRegex('morgen'), (today) => addDays(today, 1)],
  [wordRegex('gestern'), (today) => addDays(today, -1)],
  [wordRegex('(?:n(?:ä|ae)chste|kommende)[nr]?\\s+Woche'), (today) => nextMonday(today)],
  [wordRegex('in\\s+einer\\s+Woche'), (today) => addDays(today, 7)],
  [wordRegex('in\\s+zwei\\s+Wochen'), (today) => addDays(today, 14)],
  [wordRegex('Monatsende|Ende\\s+des\\s+Monats'), (today) => endOfMonth(today)],
];

interface RawHit extends DateHit {
  at: number;
}

/**
 * Jahr zu einem Datum ohne Jahresangabe. Ein Dump plant nach vorn: liegt der Tag
 * mehr als ein halbes Jahr zurueck, ist das naechste Jahr gemeint.
 */
function resolveYear(day: number, month: number, raw: string | undefined, today: string): number {
  if (raw !== undefined && raw.length === 4) return Number(raw);
  if (raw !== undefined && raw.length === 2) return 2000 + Number(raw);
  const year = Number(today.slice(0, 4));
  const candidate = plainDay(year, month, day);
  if (candidate === null) return year;
  return diffDays(candidate, today) > 183 ? year + 1 : year;
}

function numericHits(text: string, today: string): RawHit[] {
  const hits: RawHit[] = [];
  for (const match of matchAll(NUMERIC_DATE, text)) {
    const day = Number(match.groups[0]);
    const month = Number(match.groups[1]);
    const iso = plainDay(resolveYear(day, month, match.groups[2], today), month, day);
    if (iso !== null) hits.push({ at: match.at, iso, label: match.text.trim() });
  }
  return hits;
}

function namedHits(text: string, today: string): RawHit[] {
  const hits: RawHit[] = [];
  for (const match of matchAll(MONTH_DATE, text)) {
    const day = Number(match.groups[0]);
    const month = MONTH_KEYS.indexOf(fold(match.groups[1] ?? '')) + 1;
    const iso = plainDay(resolveYear(day, month, undefined, today), month, day);
    if (iso !== null) hits.push({ at: match.at, iso, label: match.text.trim() });
  }
  for (const [name, number] of WEEKDAYS) {
    for (const match of matchAll(wordRegex(name), text)) {
      hits.push({ at: match.at, iso: nextWeekday(today, number), label: match.text });
    }
  }
  return hits;
}

/**
 * Alle Datumsangaben in Textreihenfolge, jeder Kalendertag nur einmal.
 * `today` ist die Grundlage jeder relativen Angabe.
 */
export function findDates(text: string, today: string): DateHit[] {
  const raw: RawHit[] = [...numericHits(text, today), ...namedHits(text, today)];

  for (const match of matchAll(ISO_DATE, text)) {
    const iso = plainDay(Number(match.groups[0]), Number(match.groups[1]), Number(match.groups[2]));
    if (iso !== null) raw.push({ at: match.at, iso, label: match.text });
  }
  for (const match of matchAll(CALENDAR_WEEK, text)) {
    const iso = mondayOfIsoWeek(Number(today.slice(0, 4)), Number(match.groups[0]));
    if (iso !== null) raw.push({ at: match.at, iso, label: match.text.trim() });
  }
  for (const match of matchAll(IN_DAYS, text)) {
    raw.push({
      at: match.at,
      iso: addDays(today, Number(match.groups[0])),
      label: match.text.trim(),
    });
  }
  for (const [pattern, resolve] of PHRASES) {
    for (const match of matchAll(pattern, text)) {
      raw.push({ at: match.at, iso: resolve(today), label: match.text });
    }
  }

  raw.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  const hits: DateHit[] = [];
  for (const hit of raw) {
    if (seen.has(hit.iso)) continue;
    seen.add(hit.iso);
    hits.push({ iso: hit.iso, label: hit.label });
  }
  return hits;
}

/** Das Datum, das eine Frist am ehesten meint: das erste, das nicht vorbei ist. */
export function primaryDate(hits: readonly DateHit[], today: string): DateHit | null {
  return hits.find((hit) => hit.iso >= today) ?? hits[0] ?? null;
}

/** Deutsche Schreibweise fuer eine Begruendung: '15.08.' im laufenden Jahr. */
export function germanDay(iso: string, today: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) return iso;
  return `${match[3]}.${match[2]}.${match[1] === today.slice(0, 4) ? '' : match[1]}`;
}

/** Ist das ein Kalendertag 'YYYY-MM-DD'? Grundlage jeder Pruefung von Modellausgaben. */
export function isCalendarDay(value: unknown): value is string {
  return typeof value === 'string' && dayValue(value.trim()) !== null;
}
