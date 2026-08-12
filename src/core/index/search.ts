/**
 * Volltextsuche mit MiniSearch — kein natives Modul, kein Server, keine Embeddings.
 *
 * Drei Entscheidungen bestimmen die Trefferqualitaet:
 * 1. **Gefaltete Begriffe.** Dokument und Anfrage werden auf eine ASCII-Form
 *    gebracht ('Rückmeldung' → 'rueckmeldung'). Beide Schreibweisen treffen sich.
 * 2. **Praefix und Fuzzy.** 'dokum' findet 'dokumentieren', ein Tippfehler kostet
 *    keinen Treffer (fuzzy 0.2). Erst wird mit UND gesucht, dann mit ODER.
 * 3. **Teilwort als Notausgang.** Deutsche Komposita ('Rollenkonzept') findet kein
 *    Praefix, wenn der Nutzer die zweite Haelfte tippt. Bleibt die Trefferliste
 *    dann duenn, wird zusaetzlich im Text gesucht — mit sichtbar kleinerem Wert.
 *
 * Leere Anfrage ist kein Fehler, sondern die Frage „was war zuletzt?".
 */

import MiniSearch from 'minisearch';
import type { Options, SearchResult } from 'minisearch';
import type { DocType, SearchHit, SearchQuery } from '@shared/types';
import { makeSnippet } from './snippet';
import { fold } from './text';
import { DEFAULT_SEARCH_LIMIT } from './types';
import type { IndexedDoc, SerializedSearch } from './types';

/** Was MiniSearch von einem Dokument sieht. */
interface SearchDoc {
  path: string;
  title: string;
  tags: string;
  text: string;
}

/** Der Titel wiegt schwer: wer ihn trifft, meint das Dokument. */
const BOOST = { title: 6, tags: 3, text: 1 };
const FUZZY = 0.2;

/** Volltreffer liegen ab hier, Teilworttreffer darunter — sichtbar zweite Wahl. */
const FULL_HIT_FLOOR = 0.4;
const SUBSTRING_SCORE = 0.3;

/** Kuerzere Bruchstuecke wuerden alles treffen und nichts sagen. */
const MIN_SUBSTRING_LENGTH = 3;

export type DocLookup = ReadonlyMap<string, IndexedDoc>;

function searchOptions(): Options<SearchDoc> {
  return {
    fields: ['title', 'tags', 'text'],
    idField: 'path',
    /* Eine kanonische Form fuer beide Seiten — sonst treffen 'Rückmeldung' und
       'Rueckmeldung' einander nie. */
    processTerm: (term: string) => {
      const folded = fold(term);
      return folded.length > 0 ? folded : null;
    },
  };
}

function toSearchDoc(doc: IndexedDoc): SearchDoc {
  return { path: doc.path, title: doc.title, tags: doc.tags.join(' '), text: doc.text };
}

/** Anfragebegriffe, wie der Nutzer sie getippt hat — Grundlage der Markierung. */
function queryTerms(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}_]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function matchesTags(doc: IndexedDoc, wanted: readonly string[]): boolean {
  if (wanted.length === 0) return true;
  const own = doc.tags.map((tag) => tag.toLowerCase());
  return wanted.every((tag) => own.includes(tag.toLowerCase()));
}

function matchesTypes(doc: IndexedDoc, types: readonly DocType[] | undefined): boolean {
  return types === undefined || types.length === 0 || types.includes(doc.docType);
}

/** Alle Filter der Anfrage als ein Praedikat. */
function filterFor(query: SearchQuery): (doc: IndexedDoc | undefined) => boolean {
  const tags = query.tags ?? [];
  return (doc) => {
    if (doc === undefined) return false;
    if (!matchesTypes(doc, query.types)) return false;
    if (query.module !== undefined && doc.module !== query.module) return false;
    if (query.since !== undefined && doc.updated.slice(0, 10) < query.since) return false;
    return matchesTags(doc, tags);
  };
}

function hitFor(doc: IndexedDoc, score: number, terms: readonly string[]): SearchHit {
  return {
    path: doc.path,
    title: doc.title,
    docType: doc.docType,
    module: doc.module,
    score,
    snippet: makeSnippet(doc.body, terms),
    updated: doc.updated,
    tags: doc.tags,
  };
}

function byUpdatedDesc(a: IndexedDoc, b: IndexedDoc): number {
  if (a.updated === b.updated) return a.path.localeCompare(b.path);
  return a.updated < b.updated ? 1 : -1;
}

/**
 * Der Suchindex. Haelt nur den invertierten Index; Titel, Tags und Rumpf bleiben
 * im `VaultIndex` und werden beim Suchen nachgeschlagen — nichts doppelt.
 */
export class SearchEngine {
  private readonly mini: MiniSearch<SearchDoc>;

  private constructor(mini: MiniSearch<SearchDoc>) {
    this.mini = mini;
  }

  /** Leerer Suchindex. */
  static create(): SearchEngine {
    return new SearchEngine(new MiniSearch<SearchDoc>(searchOptions()));
  }

  /** Aus Dokumenten aufbauen. */
  static from(docs: Iterable<IndexedDoc>): SearchEngine {
    const engine = SearchEngine.create();
    engine.addAll(docs);
    return engine;
  }

  /**
   * Gespeicherten Zustand laden. `null`, wenn er nicht passt (andere
   * MiniSearch-Fassung, beschaedigte Datei) — dann baut der Aufrufer neu.
   */
  static restore(state: SerializedSearch | null): SearchEngine | null {
    if (state === null) return null;
    try {
      return new SearchEngine(MiniSearch.loadJS<SearchDoc>(state, searchOptions()));
    } catch {
      return null;
    }
  }

  get size(): number {
    return this.mini.documentCount;
  }

  has(path: string): boolean {
    return this.mini.has(path);
  }

  addAll(docs: Iterable<IndexedDoc>): void {
    this.mini.addAll([...docs].map(toSearchDoc));
  }

  /** Hinzufuegen oder ersetzen — beides derselbe Vorgang fuer den Aufrufer. */
  replace(doc: IndexedDoc): void {
    if (this.mini.has(doc.path)) this.mini.discard(doc.path);
    this.mini.add(toSearchDoc(doc));
  }

  remove(path: string): void {
    if (this.mini.has(path)) this.mini.discard(path);
  }

  serialize(): SerializedSearch {
    return this.mini.toJSON();
  }

  /** Treffer zur Anfrage, absteigend nach Wert. Wirft nie. */
  search(query: SearchQuery, docs: DocLookup): SearchHit[] {
    const limit = Math.max(1, query.limit ?? DEFAULT_SEARCH_LIMIT);
    const keep = filterFor(query);
    const text = (query.text ?? '').trim();
    if (text.length === 0) return this.recent(docs, keep, limit);

    const matched = this.matched(text, keep, docs);
    const best = matched[0]?.score ?? 1;
    const terms = queryTerms(text);
    const hits: SearchHit[] = [];
    const taken = new Set<string>();

    for (const result of matched.slice(0, limit)) {
      const path = String(result.id);
      const doc = docs.get(path);
      if (doc === undefined) continue;
      const share = best > 0 ? Math.min(1, result.score / best) : 1;
      taken.add(path);
      hits.push(
        hitFor(doc, FULL_HIT_FLOOR + (1 - FULL_HIT_FLOOR) * share, [...result.terms, ...terms]),
      );
    }

    if (hits.length < limit) {
      for (const doc of this.substringHits(terms, docs, keep, limit - hits.length, taken)) {
        hits.push(hitFor(doc, SUBSTRING_SCORE, terms));
      }
    }
    return hits;
  }

  /** MiniSearch zweimal fragen: erst UND, dann ODER — nie mit leeren Haenden. */
  private matched(
    text: string,
    keep: (doc: IndexedDoc | undefined) => boolean,
    docs: DocLookup,
  ): SearchResult[] {
    const common = { prefix: true, fuzzy: FUZZY, boost: BOOST };
    const strict = this.mini
      .search(text, { ...common, combineWith: 'AND' })
      .filter((result) => keep(docs.get(String(result.id))));
    if (strict.length > 0) return strict;
    return this.mini
      .search(text, { ...common, combineWith: 'OR' })
      .filter((result) => keep(docs.get(String(result.id))));
  }

  /** Notausgang fuer Komposita: alle Begriffe muessen im Text vorkommen. */
  private substringHits(
    terms: readonly string[],
    docs: DocLookup,
    keep: (doc: IndexedDoc | undefined) => boolean,
    room: number,
    taken: ReadonlySet<string>,
  ): IndexedDoc[] {
    const needles = terms
      .map((term) => term.toLowerCase())
      .filter((term) => term.length >= MIN_SUBSTRING_LENGTH);
    if (needles.length === 0) return [];
    const found: IndexedDoc[] = [];
    for (const doc of docs.values()) {
      if (taken.has(doc.path) || !keep(doc)) continue;
      if (!needles.every((needle) => doc.text.includes(needle))) continue;
      found.push(doc);
    }
    found.sort(byUpdatedDesc);
    return found.slice(0, room);
  }

  /** Leere Anfrage: die juengsten Dokumente. Ohne Wert, weil ohne Relevanz. */
  private recent(
    docs: DocLookup,
    keep: (doc: IndexedDoc | undefined) => boolean,
    limit: number,
  ): SearchHit[] {
    const candidates = [...docs.values()].filter((doc) => keep(doc));
    candidates.sort(byUpdatedDesc);
    return candidates.slice(0, limit).map((doc) => hitFor(doc, 0, []));
  }
}
