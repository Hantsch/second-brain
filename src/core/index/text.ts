/**
 * Text utilities for the index. Two responsibilities shared by several derivations:
 *
 * 1. **Lines without code.** Checkboxes and wikilinks inside code fences are examples,
 *    not data — the todo parser and the wikilink graph must treat them the same way.
 * 2. **German folding.** 'Rueckmeldung' and 'Rückmeldung' are the same word for
 *    search purposes. Both sides are folded to an ASCII form.
 */

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/* Spelled out, not stripped — the same rule as in vault/slug.ts. */
const UMLAUTS: [RegExp, string][] = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
  [/æ/g, 'ae'],
  [/œ/g, 'oe'],
  [/ø/g, 'oe'],
];

/** A line of the body with its 0-based index. */
export interface ContentLine {
  line: string;
  index: number;
}

/**
 * All lines of a body **outside** of code fences, with their original
 * index. The index is preserved so that line numbers stay correct.
 */
export function* contentLines(body: string): Generator<ContentLine> {
  const lines = body.split('\n');
  let fence: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = FENCE.exec(line);
    if (match) {
      const marker = (match[1] ?? '').slice(0, 1);
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    yield { line, index };
  }
}

/**
 * Search form of a word: lowercase, ASCII, umlauts spelled out, diacritics removed.
 * Applied on both the document *and* the query side, so both meet in the middle.
 */
export function fold(term: string): string {
  let text = (term ?? '').normalize('NFC').toLowerCase();
  for (const [pattern, replacement] of UMLAUTS) text = text.replace(pattern, replacement);
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Collapses multiple whitespace characters and line breaks into a single space. */
export function collapse(text: string): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Escapes characters that would have meaning in a regular expression. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 'YYYY-MM-DD' or nothing. Never throws. */
export function asDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return match ? (match[0] ?? null) : null;
}

/** A value as a list of strings — frontmatter is never to be trusted. */
export function asStringList(value: unknown): string[] {
  if (typeof value === 'string') return value.trim().length > 0 ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim().length > 0) result.push(entry.trim());
    else if (typeof entry === 'number') result.push(String(entry));
  }
  return result;
}

/** A value as a string, or null. */
export function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}
