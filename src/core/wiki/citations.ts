/**
 * Belege pruefen — hier haengt Guardrail 3 („Keine Halluzinationen").
 *
 * Eine Antwort darf sagen, was in den Dateien steht, und sonst nichts. Zwei
 * Pruefungen setzen das durch:
 *
 * 1. **Pfade.** Ein `[[pfad]]` in der Antwort muss zu einem Ausschnitt gehoeren, der
 *    dem Modell vorlag. Ein erfundener Pfad ist kein Beleg und faellt weg.
 * 2. **Zitate.** Was in Anfuehrungszeichen steht, muss sich wortwoertlich in einer
 *    der gelesenen Dateien wiederfinden. Findet es sich nicht, wird das Zitat
 *    verworfen **und** die Antwort als `unsupported` markiert: dann hat das Modell
 *    formuliert, was nicht dasteht, und der Nutzer muss das sehen.
 *
 * Verglichen wird auf zusammengezogenem Text (Umbrueche und Mehrfach-Leerzeichen
 * eingeebnet): ein Modell darf eine Datei umbrechen, aber nicht umschreiben.
 */

import type { Citation } from '@shared/types';
import { collapse } from '@core/index/text';
import type { WikiExcerpt } from './types';

/** Kuerzere Zitate sind Wortfetzen; sie zu pruefen sagt nichts. */
export const MIN_QUOTE_CHARS = 12;
/** So viel Zitat wird fuer die Zeilensuche benutzt. */
const ANCHOR_CHARS = 40;

/** Eine gelesene Datei, gegen die geprueft wird. */
export interface CitationSource {
  path: string;
  title: string;
  /** Rumpf der Datei, unveraendert. */
  body: string;
  /** 1-basierte Zeilennummer der ersten Rumpfzeile. */
  bodyLine: number;
}

export interface CitationCheck {
  citations: Citation[];
  /** Antwort ohne tragfaehigen Beleg — oder mit einem Zitat, das nirgends steht. */
  unsupported: boolean;
  /** Verworfene Zitate und Pfade, fuer Diagnose und Tests. */
  rejected: string[];
}

const MARKER = /\[\[([^\]|\n]+?)(?:\|[^\]\n]*)?\]\]/g;
/* Gerade und typografische Anfuehrungszeichen, deutsche und englische Fassung. */
const QUOTED = /[„"“”»]([^„"“”»«\n]{6,400})[""“”«]/g;

/** Alle `[[…]]`-Marker einer Antwort, in Reihenfolge und ohne Dubletten. */
export function citedTargets(answer: string): string[] {
  const targets: string[] = [];
  MARKER.lastIndex = 0;
  for (let match = MARKER.exec(answer); match !== null; match = MARKER.exec(answer)) {
    const target = (match[1] ?? '').trim();
    if (target.length > 0 && !targets.includes(target)) targets.push(target);
  }
  return targets;
}

/** Alle woertlichen Zitate einer Antwort. */
export function quotedSpans(answer: string): string[] {
  const spans: string[] = [];
  QUOTED.lastIndex = 0;
  for (let match = QUOTED.exec(answer); match !== null; match = QUOTED.exec(answer)) {
    const span = (match[1] ?? '').trim();
    if (span.length >= MIN_QUOTE_CHARS && !spans.includes(span)) spans.push(span);
  }
  for (const line of answer.split('\n')) {
    const blockquote = /^\s*>\s?(.+)$/.exec(line);
    const span = (blockquote?.[1] ?? '').trim();
    if (span.length >= MIN_QUOTE_CHARS && !spans.includes(span)) spans.push(span);
  }
  return spans;
}

/** Der Beleg, auf den ein Marker zeigt — exakt, sonst eindeutig ueber den Dateinamen. */
function resolveTarget(target: string, sources: readonly CitationSource[]): CitationSource | null {
  const wanted = target.replace(/^\.\//, '').trim();
  const exact = sources.find((source) => source.path === wanted);
  if (exact !== undefined) return exact;
  const name = wanted.split('/').pop() ?? wanted;
  const stem = name.replace(/\.md$/i, '');
  const matches = sources.filter((source) => {
    const own = source.path.split('/').pop() ?? source.path;
    return own === name || own.replace(/\.md$/i, '') === stem;
  });
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/**
 * Die Zeile, in der ein Zitat beginnt; `null`, wenn sie sich nicht bestimmen laesst.
 *
 * Gesucht wird in einem Fenster von vier Zeilen, weil ein Zitat ueber Umbrueche
 * laufen darf. Gefunden wird das **spaeteste** Fenster, das den Anfang noch enthaelt:
 * sonst zeigte die Fundstelle auf die Leerzeile davor.
 */
export function lineOfQuote(source: CitationSource, quote: string): number | null {
  const anchor = collapse(quote).slice(0, ANCHOR_CHARS).toLowerCase();
  if (anchor.length === 0) return null;
  const lines = source.body.replace(/\r\n/g, '\n').split('\n');
  let found: number | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const window = collapse(lines.slice(index, index + 4).join(' ')).toLowerCase();
    if (window.includes(anchor)) found = index;
    else if (found !== null) break;
  }
  return found === null ? null : source.bodyLine + found;
}

/** Steht dieses Zitat wortwoertlich in der Datei? */
function containsQuote(source: CitationSource, quote: string): boolean {
  return collapse(source.body).toLowerCase().includes(collapse(quote).toLowerCase());
}

/**
 * Antwort gegen Ausschnitte und Dateien pruefen.
 *
 * `excerpts` sind die Stellen, die dem Modell vorlagen — sie sind woertlich aus den
 * Dateien geschnitten und deshalb selbst gueltige Belege. `sources` sind die ganzen
 * Dateien: nur darin darf ein Zitat des Modells stehen.
 */
export function validateCitations(
  answer: string,
  excerpts: readonly WikiExcerpt[],
  sources: readonly CitationSource[],
): CitationCheck {
  const citations: Citation[] = [];
  const rejected: string[] = [];
  let broken = false;

  const add = (citation: Citation): void => {
    if (citations.some((known) => known.path === citation.path && known.quote === citation.quote)) {
      return;
    }
    citations.push(citation);
  };

  for (const span of quotedSpans(answer)) {
    const source = sources.find((candidate) => containsQuote(candidate, span));
    if (source === undefined) {
      // Ein Zitat, das in keiner gelesenen Datei steht, ist erfunden.
      rejected.push(span);
      broken = true;
      continue;
    }
    add({ path: source.path, title: source.title, quote: span, line: lineOfQuote(source, span) });
  }

  for (const target of citedTargets(answer)) {
    const source = resolveTarget(target, sources);
    if (source === null) {
      rejected.push(target);
      broken = true;
      continue;
    }
    if (citations.some((known) => known.path === source.path)) continue;
    const excerpt = excerpts.find((candidate) => candidate.path === source.path);
    if (excerpt === undefined) continue;
    add({
      path: source.path,
      title: source.title,
      quote: excerpt.quote,
      line: excerpt.line,
    });
  }

  return { citations, unsupported: broken || citations.length === 0, rejected };
}

/** Belege ohne Modell: die Ausschnitte selbst. Sie stehen woertlich in den Dateien. */
export function citationsFromExcerpts(excerpts: readonly WikiExcerpt[]): Citation[] {
  return excerpts.map((excerpt) => ({
    path: excerpt.path,
    title: excerpt.title,
    quote: excerpt.quote,
    line: excerpt.line,
  }));
}
