/**
 * `wiki/index.md` maschinell pflegen — ohne die Zeilen des Nutzers anzufassen.
 *
 * Der Katalog ist eine gemeinsame Datei: die App traegt je Seite einen Einzeiler
 * ein, der Mensch schreibt daneben eigene Rubriken, Notizen und Reihenfolgen.
 * Deshalb arbeitet `upsertEntries` zeilenweise: es ersetzt genau die Zeile, die zu
 * einem Slug gehoert, und haengt Neues an die passende Rubrik. Alles andere bleibt,
 * wie es ist — auch eine Rubrik, die „Begriffe" statt „Konzepte" heisst.
 *
 * `diffIndex` ist die Grundlage des Pflege-Befunds `index-drift`.
 */

import type { DocLanguage, WikiPageType } from '@shared/types';
import { splitFrontmatterBlock } from '@core/vault/frontmatter';
import { findSections } from '@core/vault/sections';
import { CATEGORY_ORDER, categoryHeading, categoryTypeOf } from './text';

/** Ein Katalogeintrag: in welcher Rubrik er steht, auf welche Seite er zeigt. */
export interface WikiIndexEntry {
  type: WikiPageType;
  slug: string;
  /** Der Einzeiler hinter dem Gedankenstrich; '' wenn keiner dasteht. */
  summary: string;
}

/** Eine Seite, wie `diffIndex` sie erwartet. */
export interface IndexDiffPage {
  slug: string;
  type: WikiPageType;
  title: string;
}

/** Was zwischen Katalog und Bestand auseinanderlaeuft. */
export interface IndexDiff {
  /** Seiten, die es gibt, die aber nicht im Katalog stehen. */
  missing: IndexDiffPage[];
  /** Eintraege ohne Einzeiler oder in der falschen Rubrik. */
  outdated: WikiIndexEntry[];
  /** Eintraege, zu denen keine Seite mehr existiert. */
  orphaned: WikiIndexEntry[];
}

/** `- [[slug]] — Einzeiler` — die eine Form eines Katalogeintrags. */
const ENTRY = /^\s*[-*+]\s*\[\[([^\]|\n]+?)(?:\|[^\]\n]*)?\]\]\s*(?:[—–-]\s*(.*))?$/;

/** Eine Zeile, wie sie in `index.md` steht. */
export function entryLine(entry: WikiIndexEntry): string {
  const summary = entry.summary.replace(/\s+/g, ' ').trim();
  return summary.length === 0 ? `- [[${entry.slug}]]` : `- [[${entry.slug}]] — ${summary}`;
}

/** Slug einer Eintragszeile, oder `null` wenn die Zeile keine ist. */
function slugOfLine(line: string): { slug: string; summary: string } | null {
  const match = ENTRY.exec(line);
  if (match === null) return null;
  const raw = (match[1] ?? '').trim();
  const slug = (raw.includes('/') ? (raw.split('/').pop() ?? raw) : raw).trim();
  if (slug.length === 0) return null;
  return { slug, summary: (match[2] ?? '').trim() };
}

interface Rubric {
  type: WikiPageType | null;
  heading: string;
  headingLine: number;
  end: number;
}

function rubricsOf(body: string): Rubric[] {
  return findSections(body, 2).map((range) => ({
    type: categoryTypeOf(range.heading),
    heading: range.heading,
    headingLine: range.headingLine,
    end: range.end,
  }));
}

/**
 * Alle Eintraege des Katalogs, in Dateireihenfolge. Eintraege ausserhalb einer
 * bekannten Rubrik zaehlen als Konzept — sie stehen im Katalog, also gehoeren sie
 * hinein; die Rubrik ist nur die Ordnung, nicht die Wahrheit.
 */
export function parseIndex(content: string): WikiIndexEntry[] {
  const { body } = splitFrontmatterBlock(content ?? '');
  const lines = body.split('\n');
  const rubrics = rubricsOf(body);
  const entries: WikiIndexEntry[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const found = slugOfLine(lines[index] ?? '');
    if (found === null) continue;
    const rubric = [...rubrics].reverse().find((candidate) => candidate.headingLine < index);
    entries.push({ type: rubric?.type ?? 'concept', slug: found.slug, summary: found.summary });
  }
  return entries;
}

/** Ort, an dem eine fehlende Rubrik entsteht — stabil nach `CATEGORY_ORDER`. */
function insertionForRubric(rubrics: readonly Rubric[], type: WikiPageType, lines: number): number {
  const rank = CATEGORY_ORDER.indexOf(type);
  let after = -1;
  for (const rubric of rubrics) {
    if (rubric.type === null) continue;
    const other = CATEGORY_ORDER.indexOf(rubric.type);
    if (other < rank) after = Math.max(after, rubric.end);
    else if (other > rank) return rubric.headingLine;
  }
  return after < 0 ? lines : after;
}

/** Letzte Inhaltszeile einer Rubrik — dort wird angehaengt. */
function appendPointOf(lines: readonly string[], rubric: Rubric): number {
  let at = rubric.end;
  while (at > rubric.headingLine + 1 && (lines[at - 1] ?? '').trim().length === 0) at -= 1;
  return at;
}

export interface UpsertOptions {
  /** Sprache der Rubrik-Ueberschriften, die neu entstehen. */
  language?: DocLanguage;
}

/**
 * Eintraege anhaengen oder aktualisieren. Bestehende Zeilen werden nur ersetzt,
 * wenn ein neuer Einzeiler mitkommt: ein von Hand geschriebener Einzeiler
 * ueberlebt einen Ingest, der nichts Besseres zu sagen hat.
 */
export function upsertEntries(
  content: string,
  entries: readonly WikiIndexEntry[],
  options: UpsertOptions = {},
): string {
  const { prefix, body } = splitFrontmatterBlock(content ?? '');
  let lines = body.split('\n');
  const pending: WikiIndexEntry[] = [];

  for (const entry of entries) {
    if (entry.slug.trim().length === 0) continue;
    const at = lines.findIndex((line) => slugOfLine(line)?.slug === entry.slug);
    if (at < 0) {
      pending.push(entry);
      continue;
    }
    const existing = slugOfLine(lines[at] ?? '');
    const summary = entry.summary.trim().length > 0 ? entry.summary : (existing?.summary ?? '');
    lines[at] = entryLine({ ...entry, summary });
  }

  for (const entry of pending) {
    const rubrics = rubricsOf(lines.join('\n'));
    const rubric = rubrics.find((candidate) => candidate.type === entry.type);
    if (rubric !== undefined) {
      const at = appendPointOf(lines, rubric);
      lines = [...lines.slice(0, at), entryLine(entry), ...lines.slice(at)];
      continue;
    }
    const at = insertionForRubric(rubrics, entry.type, lines.length);
    const heading = `## ${categoryHeading(entry.type, options.language ?? 'de')}`;
    const head = lines.slice(0, at);
    while (head.length > 0 && (head[head.length - 1] ?? '').trim().length === 0) head.pop();
    const tail = lines.slice(at);
    lines = [
      ...head,
      '',
      heading,
      '',
      entryLine(entry),
      ...(tail.length > 0 ? [''] : []),
      ...trimLeadingBlank(tail),
    ];
  }

  // Nur der Dateischluss wird normalisiert; Leerzeilen im Bestand sind Formatierung
  // des Nutzers und bleiben, wo sie stehen.
  const text = lines.join('\n').replace(/\s+$/, '');
  return prefix.length > 0 ? `${prefix}\n${text}\n` : `${text}\n`;
}

/** Reserviert fuer spaetere Deliverables (D3/D4) — bislang ohne Wirkung. */
export type RemoveOptions = Record<string, never>;

/**
 * Eintraege herausnehmen. Genau die Zeilen der gegebenen Slugs verschwinden,
 * jede andere Zeile — Ueberschrift, Leerzeile oder von Hand geschrieben —
 * bleibt stehen. Ist keiner der Slugs im Katalog, kommt der Inhalt unveraendert
 * zurueck, statt neu formatiert zu werden.
 */
export function removeEntries(
  content: string,
  slugs: readonly string[],
  // Unused for now: reserved for symmetry with UpsertOptions, until a later deliverable needs it.
  _options: RemoveOptions = {},
): string {
  const wanted = new Set(slugs);
  if (wanted.size === 0) return content ?? '';

  const { prefix, body } = splitFrontmatterBlock(content ?? '');
  const lines = body.split('\n');
  const kept = lines.filter((line) => {
    const found = slugOfLine(line);
    return found === null || !wanted.has(found.slug);
  });
  if (kept.length === lines.length) return content ?? '';

  const text = kept.join('\n').replace(/\s+$/, '');
  return prefix.length > 0 ? `${prefix}\n${text}\n` : `${text}\n`;
}

function trimLeadingBlank(lines: readonly string[]): string[] {
  const result = [...lines];
  while (result.length > 0 && (result[0] ?? '').trim().length === 0) result.shift();
  return result;
}

/**
 * Katalog gegen den Bestand pruefen. `index` ist der Dateiinhalt oder die schon
 * geparsten Eintraege.
 */
export function diffIndex(
  index: string | readonly WikiIndexEntry[],
  pages: readonly IndexDiffPage[],
): IndexDiff {
  const entries = typeof index === 'string' ? parseIndex(index) : [...index];
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const known = new Set(pages.map((page) => page.slug));

  const missing = pages.filter((page) => !bySlug.has(page.slug));
  const outdated: WikiIndexEntry[] = [];
  for (const page of pages) {
    const entry = bySlug.get(page.slug);
    if (entry === undefined) continue;
    if (entry.summary.length === 0 || entry.type !== page.type) outdated.push(entry);
  }
  const orphaned = entries.filter((entry) => !known.has(entry.slug));
  return { missing, outdated, orphaned };
}
