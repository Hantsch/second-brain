/**
 * Is a date reference an announcement? Step 3 of the loose-end rule
 * (`loose-ends.ts`), split out because the tables behind it now carry two
 * languages.
 *
 * German and English are read at once, deliberately without a language
 * parameter: a journal mixes both in one day, and the tables cannot collide —
 * no German phrase is an English one, and a label `findDates()` produced in one
 * language only ever matches that language's entries here.
 */

import { collapse, fold } from '@core/index/text';

/** Weekday labels `findDates()` produces, folded — always projected forward. */
const WEEKDAYS = new Set([
  'montag',
  'dienstag',
  'mittwoch',
  'donnerstag',
  'freitag',
  'samstag',
  'sonnabend',
  'sonntag',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

/**
 * Relative phrases that point forward, folded. `heute`/`today` and
 * `gestern`/`yesterday` are deliberately absent: none of them announces
 * anything. "day after tomorrow" never arrives as a bare "tomorrow" —
 * `findDates()` drops a hit whose span lies inside a longer one — so each
 * label is matched whole, never by a substring.
 */
const FORWARD_PHRASES: readonly RegExp[] = [
  /^morgen$/,
  /^uebermorgen$/,
  /^(naechste|kommende)[nrs]?\s+woche$/,
  /^in\s+(einer|zwei)\s+wochen?$/,
  /^(monatsende|ende\s+des\s+monats)$/,
  /^tomorrow$/,
  /^day\s+after\s+tomorrow$/,
  /^(next|coming)\s+week$/,
  /^in\s+(a|two)\s+weeks?$/,
  /^end\s+of\s+(the\s+)?month$/,
];

/**
 * The words in front of a weekday that can only mean the future. The English
 * ones need a word edge on the left — "becoming" ends in "coming"; the German
 * pattern stays exactly as it always read.
 */
const FUTURE_PREFIX = '(?:(?:naechste|kommende)[nrs]?|(?<![\\p{L}\\p{N}])(?:next|coming))';

/**
 * Is this date reference an announcement?
 *
 * A reference carrying digits is a date the user wrote out (`15.08.`, `KW 34`,
 * "in 3 Tagen", "in 3 days"). Whether it lies ahead is then the date's business,
 * not the wording's — and step 3 of the rule has already decided that.
 *
 * A bare weekday is the one ambiguous case: `findDates()` always projects
 * `Freitag`/`Friday` forward, so "am Freitag war der Notar da" would resolve to a
 * day that was never announced. It therefore only counts with a word in front of
 * it that can only mean the future ("nächsten Freitag", "next Friday"). Anything
 * softer is left to the model pass — an invented loose end costs the user more
 * than one this rule passes on.
 */
export function isForward(label: string, sentence: string): boolean {
  const key = collapse(fold(label));
  if (/\d/.test(key)) return true;
  if (FORWARD_PHRASES.some((phrase) => phrase.test(key))) return true;
  if (!WEEKDAYS.has(key)) return false;
  return new RegExp(`${FUTURE_PREFIX}\\s+${key}`, 'u').test(fold(sentence));
}
