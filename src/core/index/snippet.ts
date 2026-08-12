/**
 * Snippets: die Textstelle, die einen Treffer belegt.
 *
 * Regeln, die aus der Bedienbarkeit folgen:
 * - hoechstens ~240 Zeichen, an Wortgrenzen geschnitten, mit '…' wo gekuerzt wurde,
 * - der Treffer moeglichst mittig und mit `**` markiert,
 * - das Fenster liegt dort, wo die meisten Treffer beieinanderstehen.
 *
 * Gesucht wird auf dem Text in **Originalschreibung**: nur so bleiben die
 * Fundstellen dort, wo sie hingehoeren. Umlaute treffen in beiden Schreibweisen,
 * damit 'Rueckmeldung' auch 'Rückmeldung' markiert.
 */

import { collapse, escapeRegExp } from './text';
import { SNIPPET_CHARS } from './types';

/** Ein Fund im Anzeigetext. */
interface Range {
  start: number;
  end: number;
}

/* Reihenfolge wichtig: jede Regel laeuft genau einmal, keine greift in die Ausgabe
   einer anderen. */
const UMLAUT_CLASSES: [RegExp, string][] = [
  [/ae|ä/g, '(?:ae|ä)'],
  [/oe|ö/g, '(?:oe|ö)'],
  [/ue|ü/g, '(?:ue|ü)'],
  [/ss|ß/g, '(?:ss|ß)'],
];

/** Hoechstzahl an Funden je Begriff — begrenzt die Arbeit bei langen Texten. */
const MAX_HITS_PER_TERM = 20;

/** Suchmuster eines Begriffs: Gross-/Kleinschreibung und Umlautform sind gleich. */
export function termPattern(term: string): RegExp {
  let source = escapeRegExp(term.toLowerCase());
  for (const [pattern, replacement] of UMLAUT_CLASSES)
    source = source.replace(pattern, replacement);
  return new RegExp(source, 'gi');
}

/**
 * Anzeigeform eines Rumpfs: eine Zeile Fliesstext, ohne Markdown-Syntax.
 *
 * Der Ausschnitt wird gelesen, nicht gerendert — Backticks, Listenstriche und
 * `[[wikilinks]]` waeren darin ein Leck aus der Datenschicht. Belege stehen laut
 * VAULT-FORMAT.md als `(source: [[s-...]])` im Text: Herkunft, keine Prosa, also
 * fallen sie hier weg. Die Reihenfolge ist Absicht — zuerst zeilenweise Marker,
 * dann Inline-Auszeichnung.
 */
export function displayText(body: string): string {
  const text = (body ?? '')
    // Zeilenanfaenge: Ueberschrift, Zitat, Liste, Aufzaehlung, Checkbox.
    .replace(/^ {0,3}#{1,6}\s+/gm, '')
    .replace(/^ {0,3}>\s?/gm, '')
    .replace(/^ {0,3}(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/gm, '')
    // Zaunzeilen ganz weg, der Code dazwischen bleibt lesbarer Text.
    .replace(/^ {0,3}(?:`{3,}|~{3,}).*$/gm, '')
    .replace(/`+/g, '')
    // Belegklammern, danach die Wikilinks, die ausserhalb davon stehen.
    .replace(/\(\s*source:[^)]*\)/gi, '')
    .replace(/\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g, (_match, target: string, label?: string) =>
      wikilinkText(target, label),
    )
    // Markdown-Links: der Text zaehlt, das Ziel ist kein Fliesstext.
    .replace(/\[([^\]\n]*)\]\([^)\s]*[^)]*\)/g, '$1')
    // Fettung: sie kollidiert mit der Markierung, die makeSnippet selbst setzt.
    .replace(/\*\*/g, '')
    // Was von Tabellen und Trennlinien uebrig bleibt.
    .replace(/^ {0,3}(?:[-*_]\s*){3,}$/gm, '')
    .replace(/\|/g, ' ');
  return collapse(text);
}

/** Anzeigetext eines Wikilinks: `[[a|b]]` → 'b', `[[modul/a]]` → 'a'. */
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
  // Ueberlappungen zusammenfassen, sonst schachteln sich die '**' ineinander.
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

/** Das Fenster mit den meisten Funden; bei Gleichstand das frueheste. */
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

/** Fensterraender auf Wortgrenzen schieben, damit kein Wort zerrissen wird. */
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
  // Von hinten nach vorn einsetzen, damit die Positionen davor gueltig bleiben.
  for (let index = inside.length - 1; index >= 0; index -= 1) {
    const range = inside[index];
    if (range === undefined) continue;
    const from = range.start - window.start;
    const to = range.end - window.start;
    result = `${result.slice(0, from)}**${result.slice(from, to)}**${result.slice(to)}`;
  }
  return result;
}

/** Textanfang, wenn es keine Fundstelle zu zeigen gibt. */
function head(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const space = cut.lastIndexOf(' ');
  const base = space > maxChars * 0.6 ? cut.slice(0, space) : cut;
  return `${base.replace(/[\s.,;:!?-]+$/, '')}…`;
}

/**
 * Snippet zu einem Rumpf. Ohne Fundstelle (leere Anfrage, Treffer nur im Titel)
 * kommt der Textanfang zurueck — nie eine leere Zeichenkette und nie ein Fehler.
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
