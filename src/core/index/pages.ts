/**
 * Wiki-Seiten und der Wikilink-Graph.
 *
 * `[[slug]]` verweist innerhalb eines Moduls, `[[modul/slug]]` darueber hinaus,
 * `[[slug|Text]]` zeigt einen anderen Anzeigetext (VAULT-FORMAT.md). Links in
 * Code-Zaeunen sind Beispiele und zaehlen nicht.
 *
 * `inbound` wird ausschliesslich aus `outbound` invertiert — es gibt keine zweite
 * Wahrheit ueber den Graphen. Ziele, die es nicht gibt, landen in `brokenLinks`
 * statt still zu verschwinden; daraus lebt der Pflegelauf.
 */

import type { RawSource, SourceBlockReason, WikiPage, WikiPageType } from '@shared/types';
import { excerpt } from '@core/vault/doc';
import { isTranscriptAvailable } from '@core/ingest/youtube/writer';
import { baseName, extName } from '@core/vault/paths';
import { asDate, asStringList, asText, contentLines } from './text';
import type { BrokenLink, IndexedDoc, ModulePageCounts } from './types';

const WIKILINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g;

/** Dateien im Wiki, die keine Seite sind: Katalog und Chronik. */
const NON_PAGES = new Set(['index', 'log']);

const PAGE_DIRS: Record<string, WikiPageType> = {
  sources: 'source',
  entities: 'entity',
  concepts: 'concept',
};

/** Ein einzelner Wikilink, wie er in der Datei steht. */
export interface WikiLink {
  /** Modul-Teil, falls angegeben (`[[modul/slug]]`). */
  module: string | null;
  slug: string;
  /** Anzeigetext bei `[[slug|Text]]`. */
  label: string | null;
  /** Ziel unveraendert, fuer Fehlermeldungen. */
  raw: string;
}

export interface PageGraph {
  pages: WikiPage[];
  /** Modul-Slug → Seitenzahlen, wie `KnowledgeModule.counts` sie braucht. */
  counts: Map<string, ModulePageCounts>;
  brokenLinks: BrokenLink[];
}

/** Alle Wikilinks eines Rumpfs, in Reihenfolge des Auftretens. */
export function parseWikilinks(body: string): WikiLink[] {
  const links: WikiLink[] = [];
  for (const { line } of contentLines(body)) {
    if (!line.includes('[[')) continue;
    WIKILINK.lastIndex = 0;
    for (let match = WIKILINK.exec(line); match !== null; match = WIKILINK.exec(line)) {
      const raw = (match[1] ?? '').trim();
      if (raw.length === 0) continue;
      const label = asText(match[2]);
      const cut = raw.lastIndexOf('/');
      const slug = (cut < 0 ? raw : raw.slice(cut + 1)).trim();
      if (slug.length === 0) continue;
      links.push({
        module: cut < 0 ? null : raw.slice(0, cut).trim(),
        slug,
        label,
        raw,
      });
    }
  }
  return links;
}

/** `modules/<modul>/wiki/...` → Modul-Slug, sonst null. */
export function moduleOfPath(path: string): string | null {
  const match = /^modules\/([^/]+)\//.exec(path);
  return match ? (match[1] ?? null) : null;
}

/** Seitentyp: Frontmatter zuerst, sonst der Ordner unter `wiki/`. */
function pageTypeOf(doc: IndexedDoc): WikiPageType | null {
  const declared = doc.frontmatter['type'];
  if (declared === 'source' || declared === 'entity' || declared === 'concept') return declared;
  if (declared === 'overview') return 'overview';
  const parts = doc.path.split('/');
  const folder = parts[parts.length - 2] ?? '';
  if (folder === 'wiki') return baseName(doc.path) === 'overview.md' ? 'overview' : null;
  return PAGE_DIRS[folder] ?? null;
}

function slugOf(doc: IndexedDoc): string {
  const declared = asText(doc.frontmatter['slug']);
  if (declared !== null) return declared;
  const name = baseName(doc.path);
  return name.slice(0, name.length - extName(name).length) || name;
}

/** Ist die Datei eine Wiki-Seite? `index.md` und `log.md` sind keine. */
export function isWikiPage(doc: IndexedDoc): boolean {
  if (!/^modules\/[^/]+\/wiki\//.test(doc.path)) return false;
  const name = baseName(doc.path);
  const stem = name.slice(0, name.length - extName(name).length);
  return !NON_PAGES.has(stem) && pageTypeOf(doc) !== null;
}

function emptyCounts(): ModulePageCounts {
  return { sources: 0, entities: 0, concepts: 0 };
}

function countPage(counts: Map<string, ModulePageCounts>, page: WikiPage): void {
  const entry = counts.get(page.module) ?? emptyCounts();
  if (page.type === 'source') entry.sources += 1;
  if (page.type === 'entity') entry.entities += 1;
  if (page.type === 'concept') entry.concepts += 1;
  counts.set(page.module, entry);
}

/**
 * A condensed module overview records its inputs as vault paths, every other page
 * as slugs. A path to a page of the same module reads as that page's slug, so
 * both spellings name one page; anything else stays exactly as written (story 081).
 */
function sourceRef(entry: string, module: string): string {
  if (!entry.startsWith(`modules/${module}/wiki/`) || extName(entry) !== '.md') return entry;
  const name = baseName(entry);
  return name.slice(0, name.length - extName(name).length) || entry;
}

interface Draft {
  page: WikiPage;
  doc: IndexedDoc;
  id: string;
}

function draftOf(doc: IndexedDoc): Draft | null {
  const module = moduleOfPath(doc.path);
  const type = pageTypeOf(doc);
  if (module === null || type === null) return null;
  const slug = slugOf(doc);
  return {
    id: `${module}/${slug}`,
    doc,
    page: {
      path: doc.path,
      module,
      slug,
      title: doc.title,
      type,
      created: asDate(doc.frontmatter['created']) ?? doc.updated.slice(0, 10),
      updated: doc.updated,
      tags: doc.tags,
      sources: asStringList(doc.frontmatter['sources']).map((entry) => sourceRef(entry, module)),
      outbound: [],
      inbound: [],
      excerpt: excerpt(doc.body),
      wordCount: doc.words,
    },
  };
}

/**
 * Alle Wiki-Seiten mit Graph und Zaehlungen. `docs` darf der ganze Vault sein;
 * alles ausserhalb von `modules/<slug>/wiki/` wird uebergangen.
 */
export function derivePages(docs: readonly IndexedDoc[]): PageGraph {
  const drafts: Draft[] = [];
  const byId = new Map<string, Draft>();
  for (const doc of docs) {
    if (!isWikiPage(doc)) continue;
    const draft = draftOf(doc);
    if (draft === null) continue;
    drafts.push(draft);
    // Bei doppelten Slugs gewinnt der erste Fund; der Pflegelauf meldet den Rest.
    if (!byId.has(draft.id)) byId.set(draft.id, draft);
  }

  const inbound = new Map<string, Set<string>>();
  const brokenLinks: BrokenLink[] = [];

  for (const draft of drafts) {
    const seen = new Set<string>();
    for (const link of parseWikilinks(draft.doc.body)) {
      const module = link.module ?? draft.page.module;
      const target = `${module}/${link.slug}`;
      if (target === draft.id) continue;
      if (!byId.has(target)) {
        // Katalog und Chronik sind gueltige Ziele, aber keine Seiten im Graphen.
        if (NON_PAGES.has(link.slug)) continue;
        brokenLinks.push({ from: draft.id, target: link.raw, path: draft.doc.path });
        continue;
      }
      if (seen.has(target)) continue;
      seen.add(target);
      draft.page.outbound.push(target);
      const set = inbound.get(target) ?? new Set<string>();
      set.add(draft.id);
      inbound.set(target, set);
    }
  }

  const counts = new Map<string, ModulePageCounts>();
  for (const draft of drafts) {
    draft.page.inbound = [...(inbound.get(draft.id) ?? [])].sort((a, b) => a.localeCompare(b));
    countPage(counts, draft.page);
  }

  const pages = drafts.map((draft) => draft.page);
  pages.sort((a, b) => a.path.localeCompare(b.path));
  return { pages, counts, brokenLinks };
}

/** Eine Rohquelle, wie `build.ts` sie beim Durchlaufen findet. */
export interface IngestEntry {
  /**
   * Die Quelle, vault-relativ: der Ordner bei der Ordner-Variante, der Stamm
   * ohne '.ingest.json' bei der Geschwisterdatei-Variante (VAULT-FORMAT.md).
   */
  path: string;
  /** Inhalt der `.ingest.json`, oder null wenn sie nicht lesbar war. */
  json: string | null;
  /** Summe der Dateigroessen unter `path`. */
  bytes: number;
  /** Juengste mtime unter `path` — Ersatz, wenn `ingestedAt` fehlt. */
  modified: string;
}

function kindFromPath(path: string): RawSource['kind'] {
  if (path.startsWith('raw/youtube/')) return 'youtube';
  if (path.startsWith('raw/files/')) return 'file';
  if (path.startsWith('raw/web/')) return 'url';
  return 'bundle';
}

function kindOf(value: unknown, path: string): RawSource['kind'] {
  if (
    value === 'youtube' ||
    value === 'file' ||
    value === 'url' ||
    value === 'text' ||
    value === 'bundle'
  ) {
    return value;
  }
  return kindFromPath(path);
}

/**
 * Warum eine Quelle nichts zum Verdichten hergibt. Nur ein youtube-Protokoll
 * mit `transcript`-Feld trifft ueberhaupt eine Aussage; ein legacy-Protokoll
 * ohne dieses Feld bleibt unblockiert (AC5) statt geraten zu werden.
 */
export function blockedReasonOf(record: Record<string, unknown>): SourceBlockReason | null {
  const transcript = record['transcript'];
  if (typeof transcript !== 'object' || transcript === null) return null;
  return isTranscriptAvailable(transcript) ? null : 'no-transcript';
}

/**
 * Rohquellen aus den `.ingest.json`-Protokollen. Ein kaputtes Protokoll versteckt
 * die Quelle nicht: Art und Titel kommen dann aus dem Pfad.
 */
export function deriveSources(entries: readonly IngestEntry[]): RawSource[] {
  const sources: RawSource[] = [];
  for (const entry of entries) {
    let record: Record<string, unknown> = {};
    if (entry.json !== null) {
      try {
        const parsed: unknown = JSON.parse(entry.json);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          record = parsed as Record<string, unknown>;
        }
      } catch {
        // Unlesbares Protokoll: die Quelle bleibt sichtbar, nur aermer beschrieben.
        record = {};
      }
    }
    sources.push({
      path: entry.path,
      title: asText(record['title']) ?? baseName(entry.path),
      kind: kindOf(record['kind'], entry.path),
      ingestedAt: asText(record['ingestedAt']) ?? entry.modified,
      sourcePage: asText(record['sourcePage']),
      origin: asText(record['origin']),
      bytes: entry.bytes,
      modules: asStringList(record['modules']),
      blocked: blockedReasonOf(record),
    });
  }
  sources.sort((a, b) =>
    a.ingestedAt === b.ingestedAt
      ? a.path.localeCompare(b.path)
      : a.ingestedAt < b.ingestedAt
        ? 1
        : -1,
  );
  return sources;
}
