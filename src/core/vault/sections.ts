/**
 * Abschnitte in Markdown-Dateien finden und darunter anhaengen.
 *
 * Reine Textarbeit — beide Store-Implementierungen benutzen genau diese Funktionen,
 * damit `append` im Speicher und auf der Platte identisch wirkt.
 *
 * Ueberschriften in Code-Zaeunen (``` oder ~~~) zaehlen nicht als Abschnitte.
 */

import { fold } from '@core/index/text';
import { splitFrontmatterBlock } from './frontmatter';

export interface SectionRange {
  /** Text der Ueberschrift, ohne '#'. */
  heading: string;
  /** 1 fuer '#', 2 fuer '##' ... */
  level: number;
  /** Zeilenindex der Ueberschrift im Rumpf. */
  headingLine: number;
  /** Erste Inhaltszeile. */
  start: number;
  /** Erste Zeile *nach* dem Abschnitt. */
  end: number;
}

interface Heading {
  level: number;
  text: string;
  line: number;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*$/;
const LIST_LINE = /^ {0,3}([-*+]|\d+[.)])\s/;

function scanHeadings(lines: string[]): Heading[] {
  const headings: Heading[] = [];
  let fence: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = (fenceMatch[1] ?? '').slice(0, 1);
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const match = HEADING.exec(line);
    if (match) {
      headings.push({ level: (match[1] ?? '').length, text: match[2] ?? '', line: index });
    }
  }
  return headings;
}

function rangesFrom(lines: string[], headings: Heading[]): SectionRange[] {
  return headings.map((heading, position) => {
    let end = lines.length;
    for (let next = position + 1; next < headings.length; next += 1) {
      const candidate = headings[next];
      if (candidate && candidate.level <= heading.level) {
        end = candidate.line;
        break;
      }
    }
    return {
      heading: heading.text,
      level: heading.level,
      headingLine: heading.line,
      start: heading.line + 1,
      end,
    };
  });
}

/**
 * Vergleichsform einer Ueberschrift: getrimmt, Leerraum zusammengezogen und
 * gefaltet (`core/index/text`'s `fold` — Umlaute ausgeschrieben, Diakritika weg).
 *
 * Warum gefaltet: die Alias-Tabelle in `section-names.ts` haelt ihre Schreibweisen
 * schon in dieser Form ('gespraech'), und `sectionKindOf` vergleicht ebenfalls
 * gefaltet. Wuerde hier nur kleingeschrieben, traefe ein echtes '## Gespräch' in
 * einer Datei niemals auf sein Alias — die Ablage legte einen zweiten Abschnitt
 * fuer dieselbe Sache an. Eine Faltungsregel, auf beiden Seiten dieselbe.
 */
function normalizeHeading(text: string): string {
  return fold(text.trim().replace(/\s+/g, ' '));
}

/** Alle Abschnitte eines Rumpfs, optional auf eine Ueberschriftenebene gefiltert. */
export function findSections(body: string, level?: number): SectionRange[] {
  const lines = body.split('\n');
  const headings = scanHeadings(lines);
  const ranges = rangesFrom(lines, headings);
  return level === undefined ? ranges : ranges.filter((range) => range.level === level);
}

/** Erster Abschnitt mit dieser Ueberschrift (ohne Ruecksicht auf Gross-/Kleinschreibung). */
export function findSection(body: string, heading: string): SectionRange | null {
  const wanted = normalizeHeading(heading);
  return findSections(body).find((range) => normalizeHeading(range.heading) === wanted) ?? null;
}

/**
 * The first `##` heading in `body` that matches one of `aliases` (compared the same
 * way `findSection` does: trimmed, whitespace-collapsed, case-insensitive), in the
 * order headings appear in the document. Falls back to `fallback` when none of the
 * aliases occur as an actual heading yet.
 *
 * Generic on purpose: a section name can have more than one accepted spelling (e.g.
 * a project's notes section is "Notizen" or "Notes"), and once the file has picked
 * one, new content should join it rather than start a second section for the same
 * thing.
 */
export function headingFor(body: string, aliases: string[], fallback: string): string {
  const wanted = new Set(aliases.map((alias) => normalizeHeading(alias)));
  const match = findSections(body, 2).find((range) => wanted.has(normalizeHeading(range.heading)));
  return match?.heading.trim() ?? fallback;
}

/** Abschnitt → Text. Gleichnamige Abschnitte werden zusammengefasst. */
export function sectionMap(content: string, level = 2): Map<string, string> {
  const { body } = splitFrontmatterBlock(content);
  const lines = body.split('\n');
  const result = new Map<string, string>();
  for (const range of findSections(body, level)) {
    const text = lines.slice(range.start, range.end).join('\n').trim();
    const key = range.heading.trim();
    const existing = result.get(key);
    result.set(key, existing === undefined ? text : `${existing}\n\n${text}`.trim());
  }
  return result;
}

function isBlank(line: string | undefined): boolean {
  return (line ?? '').trim().length === 0;
}

/** Leerzeilen am Anfang weg, genau ein Umbruch am Ende. */
function normalizeBody(body: string): string {
  const text = body.replace(/^\s*\n/, '').replace(/\s+$/, '');
  return text.length === 0 ? '' : `${text}\n`;
}

function reassemble(prefix: string, body: string): string {
  const normalized = normalizeBody(body);
  return prefix.length > 0 ? `${prefix}\n${normalized}` : normalized;
}

/**
 * Haengt `text` unter der Ueberschrift `heading` an. Fehlt der Abschnitt, wird er am
 * Dateiende als '## <heading>' angelegt. Vorhandene Abschnitte *danach* bleiben, wo
 * sie sind — angehaengt wird am Ende des gefundenen Abschnitts, nicht am Dateiende.
 *
 * Das Frontmatter wird wortwoertlich uebernommen und nicht neu formatiert.
 */
export function appendToSection(
  content: string,
  heading: string,
  text: string,
): { content: string; sectionCreated: boolean } {
  const { prefix, body } = splitFrontmatterBlock(content);
  const block = text.replace(/^\s*\n/, '').replace(/\s+$/, '');
  if (block.length === 0) return { content, sectionCreated: false };
  const blockLines = block.split('\n');
  const lines = body.split('\n');
  const range = findSection(body, heading);

  if (!range) {
    const kept = [...lines];
    while (kept.length > 0 && isBlank(kept[kept.length - 1])) kept.pop();
    const created = [...kept, '', `## ${heading.trim()}`, '', ...blockLines];
    return { content: reassemble(prefix, created.join('\n')), sectionCreated: true };
  }

  // Letzte Inhaltszeile des Abschnitts suchen; Leerzeilen davor gehoeren zum Abstand.
  let insertAt = range.end;
  while (insertAt > range.start && isBlank(lines[insertAt - 1])) insertAt -= 1;
  const gap = range.end < lines.length ? lines.slice(insertAt, range.end) : [];
  // Liste an Liste braucht keine Leerzeile — sonst reisst der Abschnitt optisch auf.
  const continuesList =
    insertAt > range.start &&
    LIST_LINE.test(lines[insertAt - 1] ?? '') &&
    LIST_LINE.test(blockLines[0] ?? '');
  const updated = [
    ...lines.slice(0, insertAt),
    ...(continuesList ? [] : ['']),
    ...blockLines,
    ...(gap.length > 0 ? gap : range.end < lines.length ? [''] : []),
    ...lines.slice(range.end),
  ];
  return { content: reassemble(prefix, updated.join('\n')), sectionCreated: false };
}
