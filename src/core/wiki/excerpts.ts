/**
 * Ausschnitte fuer eine Antwort — **wortwoertlich**, mit Pfad und Zeilennummer.
 *
 * Ein Snippet aus der Suche (`core/index/snippet`) ist Anzeigetext: Markdown
 * entfernt, Fundstellen markiert, Zeilen zusammengezogen. Als Beleg taugt es nicht,
 * denn es steht so in keiner Datei. Ein Zitat muss sich wiederfinden lassen —
 * deshalb schneidet diese Datei einen **zusammenhaengenden Block echter Zeilen**
 * heraus und merkt sich, in welcher Zeile er beginnt.
 */

import { fold } from '@core/index/text';
import type { IndexedDoc } from '@core/index/types';

/** Hoechstzahl Zeilen eines Ausschnitts. */
export const EXCERPT_LINES = 8;
/** Hoechstlaenge eines Ausschnitts in Zeichen. */
export const EXCERPT_CHARS = 700;
/**
 * Kuerzere Woerter tragen die Suche nicht: „was", „wie", „der" stehen in jeder
 * Datei. Ziffern zaehlen immer mit („OAuth 2.1", „15").
 */
const MIN_TERM_LENGTH = 4;

/** Ein Ausschnitt, wie er in der Datei steht. */
export interface ExcerptSlice {
  /** Wortwoertlicher Text, mehrere Zeilen moeglich. */
  quote: string;
  /** 1-basierte Zeilennummer der ersten Zitatzeile in der Datei. */
  line: number;
}

/** Die Woerter einer Frage, die beim Suchen etwas aussagen. */
export function questionTerms(question: string): string[] {
  const terms: string[] = [];
  for (const raw of (question ?? '').split(/[^\p{L}\p{N}_]+/u)) {
    const term = raw.trim();
    if (term.length === 0) continue;
    if (term.length < MIN_TERM_LENGTH && !/\d/.test(term)) continue;
    const folded = fold(term);
    if (!terms.includes(folded)) terms.push(folded);
  }
  return terms;
}

/** Wie viele der Begriffe in dieser Zeile stehen. */
function hitsIn(line: string, terms: readonly string[]): number {
  if (terms.length === 0) return 0;
  const folded = fold(line);
  let hits = 0;
  for (const term of terms) if (folded.includes(term)) hits += 1;
  return hits;
}

function isBlank(line: string | undefined): boolean {
  return (line ?? '').trim().length === 0;
}

/* The `# Titel` line repeats the title the citation already shows above the quote. */
function isTitleLine(line: string | undefined): boolean {
  return /^#\s/.test(line ?? '');
}

/** Fenster auf `maxChars` kuerzen — nur an Zeilengrenzen, damit es woertlich bleibt. */
function clampLines(lines: readonly string[], maxChars: number): string[] {
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    const next = length + line.length + (kept.length > 0 ? 1 : 0);
    if (kept.length > 0 && next > maxChars) break;
    kept.push(line);
    length = next;
  }
  return kept.length > 0 ? kept : [(lines[0] ?? '').slice(0, maxChars)];
}

export interface ExcerptOptions {
  maxLines?: number;
  maxChars?: number;
}

/**
 * Der Ausschnitt eines Dokuments, der am meisten zur Frage sagt. Er beginnt mit einer
 * Trefferzeile, nicht bis zu sieben Zeilen davor; die Titelzeile zaehlt nicht als
 * Treffer. Ohne Treffer kommt der Textanfang nach dem Titel — nie eine leere
 * Zeichenkette, nie ein Fehler. `null` nur, wenn das Dokument keinen Inhalt hat.
 */
export function buildExcerpt(
  doc: Pick<IndexedDoc, 'body' | 'bodyLine'>,
  terms: readonly string[],
  options: ExcerptOptions = {},
): ExcerptSlice | null {
  const maxLines = Math.max(1, options.maxLines ?? EXCERPT_LINES);
  const maxChars = Math.max(80, options.maxChars ?? EXCERPT_CHARS);
  const lines = doc.body.replace(/\r\n/g, '\n').split('\n');
  const scores = lines.map((line) =>
    isBlank(line) || isTitleLine(line) ? 0 : hitsIn(line, terms),
  );

  let bestStart = -1;
  let bestScore = 0;
  for (let start = 0; start < lines.length; start += 1) {
    // A window that starts on a hit holds every hit one starting earlier would.
    if ((scores[start] ?? 0) === 0) continue;
    let score = 0;
    for (let at = start; at < Math.min(lines.length, start + maxLines); at += 1) {
      score += scores[at] ?? 0;
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }
  if (bestStart < 0) bestStart = lines.findIndex((line) => !isBlank(line) && !isTitleLine(line));
  if (bestStart < 0) bestStart = lines.findIndex((line) => !isBlank(line));
  if (bestStart < 0) return null;

  const window = lines.slice(bestStart, bestStart + maxLines);
  while (window.length > 0 && isBlank(window[window.length - 1])) window.pop();
  const quote = clampLines(window, maxChars).join('\n').replace(/\s+$/, '');
  if (quote.trim().length === 0) return null;
  return { quote, line: doc.bodyLine + bestStart };
}
