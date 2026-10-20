/**
 * German word boundaries and a scanner built on top of them.
 *
 * `\b` only knows ASCII and fails on exactly the words that matter for
 * classification: `/\buebermorgen\b/` matches, `/\bübermorgen\b/` never
 * does — because as far as the regex engine is concerned, there's already a
 * word boundary right before the `ü`. That's why every pattern in the
 * capture core is built here.
 */

/** No word character before. */
export const LEFT_EDGE = '(?<![\\p{L}\\p{N}_])';
/** No word character after. */
export const RIGHT_EDGE = '(?![\\p{L}\\p{N}_])';

/** Pattern with word boundaries that count umlauts as word characters. */
export function wordRegex(body: string, flags = 'giu'): RegExp {
  return new RegExp(`${LEFT_EDGE}(?:${body})${RIGHT_EDGE}`, flags);
}

/** Pattern that matches one of the words — including inflected forms (up to three trailing letters). */
export function anyWordRegex(words: readonly string[], extraLetters = 3): RegExp {
  const body = words.map((word) => `${word}\\p{L}{0,${extraLetters}}`).join('|');
  return wordRegex(body);
}

/** A match with its location in the text. */
export interface Match {
  at: number;
  text: string;
  groups: (string | undefined)[];
}

/**
 * All matches of a pattern. The pattern is copied so `lastIndex` doesn't
 * stick around on the caller's copy — shared patterns with `g` are a trap
 * otherwise.
 */
export function matchAll(pattern: RegExp, text: string): Match[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const found: Match[] = [];
  for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
    found.push({ at: match.index, text: match[0], groups: match.slice(1) });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return found;
}

/** Does the pattern match anywhere? */
export function hasMatch(pattern: RegExp, text: string): boolean {
  return new RegExp(pattern.source, pattern.flags.replace('g', '')).test(text);
}

/** The matched words, lowercased and without duplicates. */
export function matchedWords(pattern: RegExp, text: string): string[] {
  const seen = new Set<string>();
  for (const match of matchAll(pattern, text)) {
    seen.add(match.text.toLowerCase().replace(/\s+/g, ' '));
  }
  return [...seen];
}
