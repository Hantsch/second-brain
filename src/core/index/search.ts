/**
 * Full-text search with MiniSearch — no native module, no server, no embeddings.
 *
 * Three decisions determine hit quality:
 * 1. **Folded terms.** Document and query are both brought into an ASCII form
 *    ('Rückmeldung' → 'rueckmeldung'). Both spellings meet in the middle.
 * 2. **Prefix and fuzzy.** 'dokum' finds 'dokumentieren'; a typo doesn't cost
 *    a hit (fuzzy 0.2). Search runs with AND first, then with OR.
 * 3. **Substring as a fallback.** German compound words ('Rollenkonzept')
 *    won't be found by prefix matching if the user types the second half. If
 *    the hit list stays thin, the text is also searched directly — with a
 *    visibly lower score.
 *
 * An empty query isn't an error, it's the question "what happened recently?".
 */

import MiniSearch from 'minisearch';
import type { Options, SearchResult } from 'minisearch';
import type { DocType, SearchHit, SearchQuery } from '@shared/types';
import { makeSnippet } from './snippet';
import { fold } from './text';
import { DEFAULT_SEARCH_LIMIT } from './types';
import type { IndexedDoc, SerializedSearch } from './types';
import { YIELD_EVERY, yieldToEventLoop } from './yield';

/** What MiniSearch sees of a document. */
interface SearchDoc {
  path: string;
  title: string;
  tags: string;
  text: string;
}

/** The title carries a lot of weight: whoever matches it means the document. */
const BOOST = { title: 6, tags: 3, text: 1 };
const FUZZY = 0.2;

/** Full matches sit at this floor and above; substring matches below it — visibly second choice. */
const FULL_HIT_FLOOR = 0.4;
const SUBSTRING_SCORE = 0.3;

/** Shorter fragments would match everything and say nothing. */
const MIN_SUBSTRING_LENGTH = 3;

export type DocLookup = ReadonlyMap<string, IndexedDoc>;

function searchOptions(): Options<SearchDoc> {
  return {
    fields: ['title', 'tags', 'text'],
    idField: 'path',
    /* One canonical form for both sides — otherwise 'Rückmeldung' and
       'Rueckmeldung' would never match each other. */
    processTerm: (term: string) => {
      const folded = fold(term);
      return folded.length > 0 ? folded : null;
    },
  };
}

function toSearchDoc(doc: IndexedDoc): SearchDoc {
  return { path: doc.path, title: doc.title, tags: doc.tags.join(' '), text: doc.text };
}

/** Query terms as the user typed them — the basis for highlighting. */
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

/**
 * All of the query's filters as one predicate — including `scope` and `project`.
 * This predicate is applied to every candidate *before* the result count is cut
 * down to `limit` (see `search()` and `substringHits()`): a related bug (story
 * 052) came from applying a filter after the limit cut, which can silently drop
 * matching documents that the limit already excluded in favor of non-matching
 * ones.
 */
function filterFor(query: SearchQuery): (doc: IndexedDoc | undefined) => boolean {
  const tags = query.tags ?? [];
  return (doc) => {
    if (doc === undefined) return false;
    if (!matchesTypes(doc, query.types)) return false;
    if (query.module !== undefined && doc.module !== query.module) return false;
    if (query.scope !== undefined && doc.scope !== query.scope) return false;
    if (query.project !== undefined && doc.project !== query.project) return false;
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
 * The search index. Holds only the inverted index; title, tags, and body stay
 * in `VaultIndex` and are looked up when searching — nothing is duplicated.
 */
export class SearchEngine {
  private readonly mini: MiniSearch<SearchDoc>;

  private constructor(mini: MiniSearch<SearchDoc>) {
    this.mini = mini;
  }

  /** Empty search index. */
  static create(): SearchEngine {
    return new SearchEngine(new MiniSearch<SearchDoc>(searchOptions()));
  }

  /** Build from documents. */
  static from(docs: Iterable<IndexedDoc>): SearchEngine {
    const engine = SearchEngine.create();
    engine.addAll(docs);
    return engine;
  }

  /**
   * Load saved state. `null` if it doesn't fit (different MiniSearch version,
   * corrupted file) — the caller then rebuilds from scratch.
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

  /**
   * Wie `addAll`, aber in Haeppchen von `YIELD_EVERY` Dokumenten mit einem Yield
   * dazwischen — ein voller Neuaufbau des Suchindex soll die Shell nicht fuer die
   * ganze Laufzeit einfrieren.
   */
  async addAllYielding(
    docs: readonly IndexedDoc[],
    yieldControl: () => Promise<void> = yieldToEventLoop,
  ): Promise<void> {
    for (let start = 0; start < docs.length; start += YIELD_EVERY) {
      this.mini.addAll(docs.slice(start, start + YIELD_EVERY).map(toSearchDoc));
      if (start + YIELD_EVERY < docs.length) await yieldControl();
    }
  }

  /** Add or replace — both the same operation from the caller's perspective. */
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

  /** Hits for the query, descending by score. Never throws. */
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

  /** Query MiniSearch twice: AND first, then OR — never come back empty-handed. */
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

  /** Fallback for compound words: every term must appear in the text. */
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

  /** Empty query: the most recent documents. No score, because no relevance. */
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
