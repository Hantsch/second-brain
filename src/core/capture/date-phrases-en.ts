/**
 * English relative dates in free text — the counterpart to the German tables in
 * `dates.ts`. Kept in its own file so `dates.ts` stays under the soft line limit
 * and the German behavior stays untouched when 'en' isn't requested.
 *
 * Deliberately not supported: slash dates, bare 'week 34' (without 'KW'), and
 * vague spans ('in a few days', 'soon') — a wrong deadline is worse than none.
 */

import {
  addDays,
  endOfMonth,
  nextMonday,
  nextWeekday,
  plainDay,
  resolveYear,
  type DateHit,
} from './dates';
import { LEFT_EDGE, RIGHT_EDGE, matchAll, wordRegex } from './words';

const WEEKDAYS_EN: readonly [string, number][] = [
  ['monday', 1],
  ['tuesday', 2],
  ['wednesday', 3],
  ['thursday', 4],
  ['friday', 5],
  ['saturday', 6],
  ['sunday', 7],
];

const MONTH_KEYS_EN: readonly string[] = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const MONTHS_ALT = MONTH_KEYS_EN.join('|');
const ORDINAL = '(?:st|nd|rd|th)?';

/** '15 August', '15th August', '15th of August'. */
const DAY_MONTH_DATE = new RegExp(
  `${LEFT_EDGE}(\\d{1,2})${ORDINAL}\\s+(?:of\\s+)?(${MONTHS_ALT})${RIGHT_EDGE}`,
  'giu',
);
/** 'August 15', 'August 15th'. */
const MONTH_DAY_DATE = new RegExp(
  `${LEFT_EDGE}(${MONTHS_ALT})\\s+(\\d{1,2})${ORDINAL}${RIGHT_EDGE}`,
  'giu',
);

const IN_DAYS_EN = wordRegex('in\\s+(\\d{1,2})\\s+days');

/** Fixed phrases pointing at a day. */
const PHRASES_EN: readonly [RegExp, (today: string) => string][] = [
  [wordRegex('day\\s+after\\s+tomorrow'), (today) => addDays(today, 2)],
  [wordRegex('today'), (today) => today],
  [wordRegex('tomorrow'), (today) => addDays(today, 1)],
  [wordRegex('yesterday'), (today) => addDays(today, -1)],
  [wordRegex('(?:next|coming)\\s+week'), (today) => nextMonday(today)],
  [wordRegex('in\\s+a\\s+week'), (today) => addDays(today, 7)],
  [wordRegex('in\\s+two\\s+weeks'), (today) => addDays(today, 14)],
  [wordRegex('end\\s+of\\s+(?:the\\s+)?month'), (today) => endOfMonth(today)],
];

function monthDateHits(text: string, today: string): DateHit[] {
  const hits: DateHit[] = [];
  for (const match of matchAll(DAY_MONTH_DATE, text)) {
    const day = Number(match.groups[0]);
    const month = MONTH_KEYS_EN.indexOf((match.groups[1] ?? '').toLowerCase()) + 1;
    const iso = plainDay(resolveYear(day, month, undefined, today), month, day);
    if (iso !== null) hits.push({ at: match.at, iso, label: match.text.trim() });
  }
  for (const match of matchAll(MONTH_DAY_DATE, text)) {
    const month = MONTH_KEYS_EN.indexOf((match.groups[0] ?? '').toLowerCase()) + 1;
    const day = Number(match.groups[1]);
    const iso = plainDay(resolveYear(day, month, undefined, today), month, day);
    if (iso !== null) hits.push({ at: match.at, iso, label: match.text.trim() });
  }
  return hits;
}

/** Every English relative date or named date in `text`, unsorted. */
export function englishHits(text: string, today: string): DateHit[] {
  const hits: DateHit[] = [...monthDateHits(text, today)];

  for (const [name, number] of WEEKDAYS_EN) {
    for (const match of matchAll(wordRegex(name), text)) {
      hits.push({ at: match.at, iso: nextWeekday(today, number), label: match.text });
    }
  }
  for (const match of matchAll(IN_DAYS_EN, text)) {
    hits.push({
      at: match.at,
      iso: addDays(today, Number(match.groups[0])),
      label: match.text.trim(),
    });
  }
  for (const [pattern, resolve] of PHRASES_EN) {
    for (const match of matchAll(pattern, text)) {
      hits.push({ at: match.at, iso: resolve(today), label: match.text });
    }
  }

  return hits;
}
