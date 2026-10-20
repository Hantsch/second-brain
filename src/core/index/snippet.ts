/**
 * Snippets: the passage of text that substantiates a hit.
 *
 * Rules that follow from usability:
 * - at most ~240 characters, cut at word boundaries, with '…' where truncated,
 * - the hit centered as much as possible and marked with `**`,
 * - the window sits where the most hits cluster together.
 *
 * Search runs on the text in **original spelling**: only this way do the
 * hits stay where they belong. Umlauts match both spellings, so
 * 'Rueckmeldung' also marks 'Rückmeldung'.
 */

import { collapse, escapeRegExp } from './text';
import { SNIPPET_CHARS } from './types';

/** A hit in the display text. */
interface Range {
  start: number;
  end: number;
}

/* Order matters: each rule runs exactly once, none reaches into another
   one's output. */
const UMLAUT_CLASSES: [RegExp, string][] = [
  [/ae|ä/g, '(?:ae|ä)'],
  [/oe|ö/g, '(?:oe|ö)'],
  [/ue|ü/g, '(?:ue|ü)'],
  [/ss|ß/g, '(?:ss|ß)'],
];

/** Maximum number of hits per term — bounds the work on long texts. */
const MAX_HITS_PER_TERM = 20;

/** Search pattern for a term: case and umlaut spelling don't matter. */
export function termPattern(term: string): RegExp {
  let source = escapeRegExp(term.toLowerCase());
  for (const [pattern, replacement] of UMLAUT_CLASSES)
    source = source.replace(pattern, replacement);
  return new RegExp(source, 'gi');
}

/**
 * Display form of a body: one line of flowing text, without markdown syntax.
 *
 * The excerpt is read, not rendered — backticks, list dashes, and
 * `[[wikilinks]]` would be a leak from the data layer in there. Per
 * VAULT-FORMAT.md, citations appear in the text as `(source: [[s-...]])`:
 * provenance, not prose, so they're stripped here. The order is
 * intentional — line-level markers first, then inline markup.
 */
export function displayText(body: string): string {
  const text = (body ?? '')
    // Line starts: heading, quote, list, enumeration, checkbox.
    .replace(/^ {0,3}#{1,6}\s+/gm, '')
    .replace(/^ {0,3}>\s?/gm, '')
    .replace(/^ {0,3}(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/gm, '')
    // Fence lines removed entirely, the code between them stays readable text.
    .replace(/^ {0,3}(?:`{3,}|~{3,}).*$/gm, '')
    .replace(/`+/g, '')
    // Source parentheses, then the wikilinks that sit outside of them.
    .replace(/\(\s*source:[^)]*\)/gi, '')
    .replace(/\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g, (_match, target: string, label?: string) =>
      wikilinkText(target, label),
    )
    // Markdown links: the text counts, the target isn't flowing text.
    .replace(/\[([^\]\n]*)\]\([^)\s]*[^)]*\)/g, '$1')
    // Bold markup: it collides with the marking that makeSnippet itself applies.
    .replace(/\*\*/g, '')
    // What's left over from tables and dividers.
    .replace(/^ {0,3}(?:[-*_]\s*){3,}$/gm, '')
    .replace(/\|/g, ' ');
  return collapse(text);
}

/** Display text of a wikilink: `[[a|b]]` → 'b', `[[modul/a]]` → 'a'. */
function wikilinkText(target: string, label?: string): string {
  const shown = (label ?? '').trim();
  if (shown.length > 0) return shown;
  const cut = target.lastIndexOf('/');
  return (cut < 0 ? target : target.slice(cut + 1)).trim();
}

function findRanges(text: string, terms: readonly string[]): Range[] {
  const ranges: Range[] = [];
  for (const term of terms) {
    if (term.length < 2) continue;
    const pattern = termPattern(term);
    let hits = 0;
    for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
      if (match[0].length === 0) break;
      ranges.push({ start: match.index, end: match.index + match[0].length });
      hits += 1;
      if (hits >= MAX_HITS_PER_TERM) break;
    }
  }
  ranges.sort((a, b) => (a.start === b.start ? b.end - a.end : a.start - b.start));
  // Merge overlaps, otherwise the '**' markers would nest into each other.
  const merged: Range[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.start <= last.end) {
      if (range.end > last.end) last.end = range.end;
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}

/** The window with the most hits; the earliest one on a tie. */
function bestWindow(ranges: readonly Range[], maxChars: number, length: number): Range {
  let bestIndex = 0;
  let bestCount = 0;
  let bestEnd = 0;
  for (let index = 0; index < ranges.length; index += 1) {
    const anchor = ranges[index];
    if (anchor === undefined) continue;
    let count = 0;
    let covered = anchor.end;
    for (let next = index; next < ranges.length; next += 1) {
      const candidate = ranges[next];
      if (candidate === undefined || candidate.end > anchor.start + maxChars) break;
      count += 1;
      covered = candidate.end;
    }
    if (count > bestCount) {
      bestCount = count;
      bestIndex = index;
      bestEnd = covered;
    }
  }
  const anchor = ranges[bestIndex] ?? { start: 0, end: 0 };
  const span = Math.max(0, bestEnd - anchor.start);
  const padding = Math.max(0, maxChars - span);
  let start = Math.max(0, anchor.start - Math.floor(padding / 2));
  let end = Math.min(length, start + maxChars);
  start = Math.max(0, Math.min(start, end - maxChars));
  if (end < anchor.end) end = Math.min(length, anchor.end);
  return { start, end };
}

/** Snap the window edges to word boundaries so no word gets torn apart. */
function snapToWords(text: string, window: Range): Range {
  let { start, end } = window;
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space >= 0 && space - start < 24) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > start && end - space < 24) end = space;
  }
  return { start, end };
}

function mark(text: string, ranges: readonly Range[], window: Range): string {
  let result = text.slice(window.start, window.end);
  const inside = ranges.filter((range) => range.start >= window.start && range.end <= window.end);
  // Insert back to front, so the positions before them stay valid.
  for (let index = inside.length - 1; index >= 0; index -= 1) {
    const range = inside[index];
    if (range === undefined) continue;
    const from = range.start - window.start;
    const to = range.end - window.start;
    result = `${result.slice(0, from)}**${result.slice(from, to)}**${result.slice(to)}`;
  }
  return result;
}

/** Start of the text, when there's no hit location to show. */
function head(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const space = cut.lastIndexOf(' ');
  const base = space > maxChars * 0.6 ? cut.slice(0, space) : cut;
  return `${base.replace(/[\s.,;:!?-]+$/, '')}…`;
}

/**
 * Snippet for a body. Without a hit location (empty query, hit only in the
 * title), the start of the text comes back — never an empty string and
 * never an error.
 */
export function makeSnippet(
  body: string,
  terms: readonly string[],
  maxChars = SNIPPET_CHARS,
): string {
  const text = displayText(body);
  if (text.length === 0) return '';
  const unique = [...new Set(terms.map((term) => term.trim().toLowerCase()))].filter(
    (term) => term.length > 0,
  );
  const ranges = findRanges(text, unique);
  if (ranges.length === 0) return head(text, maxChars);
  const window = snapToWords(text, bestWindow(ranges, maxChars, text.length));
  const marked = mark(text, ranges, window);
  const prefix = window.start > 0 ? '…' : '';
  const suffix = window.end < text.length ? '…' : '';
  return `${prefix}${marked}${suffix}`;
}
