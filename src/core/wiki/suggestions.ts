/**
 * Die Antwort des Modells auf `wiki-ingest` **hart** pruefen.
 *
 * Dasselbe Prinzip wie beim Einordnen eines Dumps (`core/capture/classify`): was
 * die Pruefung nicht besteht, ist keine Einordnung, sondern eine Halluzination. Sie
 * wird verworfen, nicht repariert.
 *
 * Geprueft wird hier alles, was ohne Dateizugriff geht: Slugs normalisieren, Typen
 * begrenzen, erfundene Modulnamen wegwerfen, strukturelle Dateien schuetzen, Patches
 * saeubern. Ob eine Seite wirklich existiert, entscheidet danach `ingest.ts` am Store —
 * denn nur der Store weiss es.
 */

import { slugify } from '@core/vault/paths';

/** Ein geprueftes Vorhaben fuer genau eine Seite. */
export interface WikiSuggestion {
  slug: string;
  type: 'entity' | 'concept';
  title: string;
  /** Vorschlag des Modells; `ingest.ts` korrigiert ihn am Bestand. */
  action: 'create' | 'extend';
  /** Der Text, der auf die Seite kommt. Bei `extend` ein eigener Absatz. */
  patch: string;
  tags: string[];
  /** Rohangabe des Modells; erst `findPage` entscheidet, ob die Seite existiert. */
  contradicts: { page: string; note: string } | null;
}

export interface IngestReply {
  suggestions: WikiSuggestion[];
  /** Nur gesetzt, wenn das Modell eine wesentliche Aenderung der Synthese meldet. */
  overviewChange: string | null;
}

/** Hoechstzahl an Seiten, die aus einer Antwort uebernommen werden. */
export const MAX_SUGGESTIONS = 8;
/** Hoechstlaenge eines Patches. Ein Modell, das mehr schreibt, schreibt Prosa ins Blaue. */
export const MAX_PATCH_CHARS = 6000;
const MAX_TAGS = 6;

/** Dateinamen unter `wiki/`, die keine Wissensseite sind — sie gehoeren der Struktur. */
const RESERVED = new Set(['index', 'log', 'overview', 'agents', 'module']);

function asText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length === 0 ? null : trimmed.slice(0, maxChars);
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags: string[] = [];
  for (const entry of value) {
    const text = asText(entry, 40);
    if (text === null) continue;
    const tag = text.toLowerCase().replace(/^#/, '');
    if (tag.length > 0 && !tags.includes(tag)) tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

/**
 * Der Slug einer vorgeschlagenen Seite, oder `null`.
 *
 * `modul/slug` ist erlaubt, solange `modul` das Zielmodul ist — ein fremder
 * Modulname ist erfunden und die ganze Seite faellt weg. Reservierte Namen und
 * Source-Slugs (`s-…`) sind keine Ziele: Source-Seiten entstehen beim Verdichten,
 * nicht beim Verknuepfen.
 */
export function suggestionSlug(raw: unknown, fallback: string, module: string): string | null {
  const text = asText(raw, 120) ?? fallback;
  const cleaned = text.replace(/^\[\[|\]\]$/g, '').split('|')[0] ?? text;
  const parts = cleaned.split('/').filter((part) => part.trim().length > 0);
  // Ohne Teile gibt es nichts zu slugifizieren — `slugify('')` waere 'notiz' und
  // damit eine Seite, die niemand vorgeschlagen hat.
  if (parts.length === 0 || parts.length > 2) return null;
  if (parts.length === 2 && slugify(parts[0] ?? '') !== module) return null;
  const slug = slugify(parts[parts.length - 1] ?? '');
  if (slug.length === 0) return null;
  if (RESERVED.has(slug) || /^s-\d{4}-\d{2}-\d{2}/.test(slug)) return null;
  return slug;
}

/**
 * Einen Patch saeubern: Frontmatter und Titelzeile weg (die schreibt die App), eigene
 * Modulpraefixe in Wikilinks weg, Laenge begrenzt. Das Modell liefert Inhalt, nie
 * Dateistruktur.
 */
export function cleanPatch(raw: unknown, module: string): string | null {
  if (typeof raw !== 'string') return null;
  let text = raw.replace(/\r\n/g, '\n').trim();
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end >= 0) text = text.slice(end + 4).trim();
  }
  text = text.replace(/^#\s+.*\n?/, '').trim();
  text = text.replace(
    /\[\[([^\]|\n]+?)(\|[^\]\n]*)?\]\]/g,
    (all, target: string, label?: string) => {
      const parts = target.split('/');
      if (parts.length !== 2 || slugify(parts[0] ?? '') !== module) return all;
      return `[[${(parts[1] ?? '').trim()}${label ?? ''}]]`;
    },
  );
  if (text.length === 0) return null;
  return text.length > MAX_PATCH_CHARS ? `${text.slice(0, MAX_PATCH_CHARS).trim()}\n[…]` : text;
}

function readContradiction(value: unknown): { page: string; note: string } | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const page = asText(record['page'], 120);
  const note = asText(record['note'], 300);
  if (page === null || note === null) return null;
  return { page, note };
}

function readSuggestion(value: unknown, module: string): WikiSuggestion | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  // Ein Modulname in der Antwort muss der sein, um den es geht — sonst ist er erfunden.
  const named = asText(record['module'], 120);
  if (named !== null && slugify(named) !== module) return null;

  const title = asText(record['title'], 120);
  const slug = suggestionSlug(record['slug'], title ?? '', module);
  if (slug === null) return null;
  const type =
    record['type'] === 'entity' ? 'entity' : record['type'] === 'concept' ? 'concept' : null;
  if (type === null) return null;
  const patch = cleanPatch(record['patch'], module);
  if (patch === null) return null;

  return {
    slug,
    type,
    title: title ?? slug.replace(/-/g, ' '),
    action: record['action'] === 'extend' ? 'extend' : 'create',
    patch,
    tags: asTags(record['tags']),
    contradicts: readContradiction(record['contradicts']),
  };
}

/**
 * Die geprueften Vorschlaege einer Modellantwort. Unbrauchbare Eintraege fallen
 * still weg; eine leere Liste ist ein gueltiges Ergebnis („die Quelle traegt keine
 * neue Seite") und kein Fehler.
 */
export function readIngestReply(
  raw: unknown,
  module: string,
  maxPages = MAX_SUGGESTIONS,
): IngestReply {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { suggestions: [], overviewChange: null };
  }
  const record = raw as Record<string, unknown>;
  const list = Array.isArray(record['pages']) ? record['pages'] : [];
  const suggestions: WikiSuggestion[] = [];
  for (const entry of list) {
    const suggestion = readSuggestion(entry, module);
    if (suggestion === null) continue;
    if (suggestions.some((known) => known.slug === suggestion.slug)) continue;
    suggestions.push(suggestion);
    if (suggestions.length >= Math.max(1, maxPages)) break;
  }
  return { suggestions, overviewChange: asText(record['overviewChange'], 600) };
}
