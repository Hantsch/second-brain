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
 * The unit MiniSearch indexes is the **passage** (053, `passages.ts`), not the
 * file: a long transcript would otherwise drown every term in its own length.
 * There is no whole-document entry next to the passages — `search()` collapses
 * passage hits back to one hit per file, `searchPassages()` hands them out as they are.
 *
 * An empty query isn't an error, it's the question "what happened recently?".
 */

import MiniSearch from 'minisearch';
import type { Options, SearchResult } from 'minisearch';
import type { SearchHit, SearchQuery } from '@shared/types';
import { countsOf, entryId, passageOf, toEntries } from './search-entries';
import type { SearchEntry } from './search-entries';
import { filterFor } from './search-filter';
import type { Keep } from './search-filter';
import { makeSnippet } from './snippet';
import { fold } from './text';
import { DEFAULT_SEARCH_LIMIT } from './types';
import type { IndexedDoc, PassageHit, SerializedSearch } from './types';
import { YIELD_EVERY, yieldToEventLoop } from './yield';

/** The title carries a lot of weight: whoever matches it means the document. */
const BOOST = { title: 6, tags: 3, text: 1 };
const FUZZY = 0.2;

/** Full matches sit at this floor and above; substring matches below it — visibly second choice. */
const FULL_HIT_FLOOR = 0.4;
const SUBSTRING_SCORE = 0.3;

/** Shorter fragments would match everything and say nothing. */
const MIN_SUBSTRING_LENGTH = 3;

export type DocLookup = ReadonlyMap<string, IndexedDoc>;

function searchOptions(): Options<SearchEntry> {
  return {
    fields: ['title', 'tags', 'text'],
    idField: 'id',
    storeFields: ['path'],
    /* One canonical form for both sides — otherwise 'Rückmeldung' and
       'Rueckmeldung' would never match each other. */
    processTerm: (term: string) => {
      const folded = fold(term);
      return folded.length > 0 ? folded : null;
    },
  };
}

/** The file a MiniSearch result belongs to — a stored field of every entry. */
function pathOf(result: SearchResult): string {
  return String(result['path']);
}

/** Query terms as the user typed them — the basis for highlighting. */
function queryTerms(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}_]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function substringNeedles(terms: readonly string[]): string[] {
  return terms
    .map((term) => term.toLowerCase())
    .filter((term) => term.length >= MIN_SUBSTRING_LENGTH);
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

/** A MiniSearch score as a share of the best one, lifted above the substring floor. */
function fullScore(score: number, best: number): number {
  const share = best > 0 ? Math.min(1, score / best) : 1;
  return FULL_HIT_FLOOR + (1 - FULL_HIT_FLOOR) * share;
}

/**
 * The search index. Holds only the inverted index; title, tags, body and
 * passages stay in `VaultIndex` and are looked up when searching.
 */
export class SearchEngine {
  private readonly mini: MiniSearch<SearchEntry>;
  /** Path → number of passage entries it holds: what `replace`/`remove` discard. */
  private readonly counts: Map<string, number>;

  private constructor(mini: MiniSearch<SearchEntry>, counts: Map<string, number>) {
    this.mini = mini;
    this.counts = counts;
  }

  /** Empty search index. */
  static create(): SearchEngine {
    return new SearchEngine(new MiniSearch<SearchEntry>(searchOptions()), new Map());
  }

  /** Build from documents. */
  static from(docs: Iterable<IndexedDoc>): SearchEngine {
    const engine = SearchEngine.create();
    engine.addAll(docs);
    return engine;
  }

  /**
   * Load saved state. `null` if it doesn't fit (different MiniSearch version,
   * corrupted file, ids of an older shape) — the caller then rebuilds from scratch.
   */
  static restore(state: SerializedSearch | null): SearchEngine | null {
    if (state === null) return null;
    try {
      const counts = countsOf(state);
      if (counts === null) return null;
      return new SearchEngine(MiniSearch.loadJS<SearchEntry>(state, searchOptions()), counts);
    } catch {
      return null;
    }
  }

  /** Number of documents (paths), not passages. */
  get size(): number {
    return this.counts.size;
  }

  has(path: string): boolean {
    return this.counts.has(path);
  }

  addAll(docs: Iterable<IndexedDoc>): void {
    this.addDocs([...docs]);
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
      this.addDocs(docs.slice(start, start + YIELD_EVERY));
      if (start + YIELD_EVERY < docs.length) await yieldControl();
    }
  }

  /** Add or replace — both the same operation from the caller's perspective. */
  replace(doc: IndexedDoc): void {
    this.remove(doc.path);
    this.addDocs([doc]);
  }

  /** Discards every passage entry of the path — a shrunk document leaves none behind. */
  remove(path: string): void {
    const count = this.counts.get(path);
    if (count === undefined) return;
    for (let n = 0; n < count; n += 1) {
      const id = entryId(path, n);
      if (this.mini.has(id)) this.mini.discard(id);
    }
    this.counts.delete(path);
  }

  serialize(): SerializedSearch {
    return this.mini.toJSON();
  }

  /** Adds every passage entry of the documents and records how many each path holds. */
  private addDocs(docs: readonly IndexedDoc[]): void {
    const perDoc = docs.map(toEntries);
    this.mini.addAll(perDoc.flat());
    // Only after MiniSearch took them: a failed add must not leave counts it does not hold.
    docs.forEach((doc, n) => this.counts.set(doc.path, perDoc[n]?.length ?? 0));
  }

  /**
   * Hits for the query, descending by score, one per file: a file matching in
   * several passages counts with its best one. Collapsing happens before the
   * limit cut, so a long file cannot crowd others out. Never throws.
   */
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

    // `matched` is sorted by score: a path's first passage is its best one.
    for (const result of matched) {
      if (hits.length >= limit) break;
      const path = pathOf(result);
      const doc = docs.get(path);
      if (doc === undefined || taken.has(path)) continue;
      taken.add(path);
      hits.push(hitFor(doc, fullScore(result.score, best), [...result.terms, ...terms]));
    }

    if (hits.length < limit) {
      for (const doc of this.substringHits(terms, docs, keep, limit - hits.length, taken)) {
        hits.push(hitFor(doc, SUBSTRING_SCORE, terms));
      }
    }
    return hits;
  }

  /**
   * Matching passages with their file lines, descending by score, not collapsed:
   * one file may appear several times. `limit` counts passages. Same filters,
   * applied before the cut, as `search()`. An empty query has no passages.
   */
  searchPassages(query: SearchQuery, docs: DocLookup): PassageHit[] {
    const limit = Math.max(1, query.limit ?? DEFAULT_SEARCH_LIMIT);
    const keep = filterFor(query);
    const text = (query.text ?? '').trim();
    if (text.length === 0) return [];

    const matched = this.matched(text, keep, docs);
    const best = matched[0]?.score ?? 1;
    const hits: PassageHit[] = [];
    const taken = new Set<string>();

    for (const result of matched) {
      if (hits.length >= limit) break;
      const id = String(result.id);
      const doc = docs.get(pathOf(result));
      // An oversized stub matches by title only — it has no text to point at.
      if (doc === undefined || doc.oversized === true) continue;
      const passage = doc.passages[passageOf(id)];
      if (passage === undefined) continue;
      taken.add(id);
      const { startLine, endLine } = passage;
      hits.push({ path: doc.path, startLine, endLine, score: fullScore(result.score, best) });
    }

    if (hits.length < limit) {
      const terms = queryTerms(text);
      hits.push(...this.substringPassages(terms, docs, keep, limit - hits.length, taken));
    }
    return hits;
  }

  /** Query MiniSearch twice: AND first, then OR — never come back empty-handed. */
  private matched(text: string, keep: Keep, docs: DocLookup): SearchResult[] {
    const common = { prefix: true, fuzzy: FUZZY, boost: BOOST };
    const strict = this.mini
      .search(text, { ...common, combineWith: 'AND' })
      .filter((result) => keep(docs.get(pathOf(result))));
    if (strict.length > 0) return strict;
    return this.mini
      .search(text, { ...common, combineWith: 'OR' })
      .filter((result) => keep(docs.get(pathOf(result))));
  }

  /** Fallback for compound words: every term must appear in the text. */
  private substringHits(
    terms: readonly string[],
    docs: DocLookup,
    keep: Keep,
    room: number,
    taken: ReadonlySet<string>,
  ): IndexedDoc[] {
    const needles = substringNeedles(terms);
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

  /** The same compound-word fallback, passage by passage; `taken` holds entry ids. */
  private substringPassages(
    terms: readonly string[],
    docs: DocLookup,
    keep: Keep,
    room: number,
    taken: ReadonlySet<string>,
  ): PassageHit[] {
    const needles = substringNeedles(terms);
    if (needles.length === 0) return [];
    const candidates = [...docs.values()].filter((doc) => keep(doc) && doc.oversized !== true);
    candidates.sort(byUpdatedDesc);
    const found: PassageHit[] = [];
    for (const doc of candidates) {
      for (const [n, passage] of doc.passages.entries()) {
        if (found.length >= room) return found;
        if (taken.has(entryId(doc.path, n))) continue;
        const lower = passage.text.toLowerCase();
        if (!needles.every((needle) => lower.includes(needle))) continue;
        const { startLine, endLine } = passage;
        found.push({ path: doc.path, startLine, endLine, score: SUBSTRING_SCORE });
      }
    }
    return found;
  }

  /** Empty query: the most recent documents. No score, because no relevance. */
  private recent(docs: DocLookup, keep: Keep, limit: number): SearchHit[] {
    const candidates = [...docs.values()].filter((doc) => keep(doc));
    candidates.sort(byUpdatedDesc);
    return candidates.slice(0, limit).map((doc) => hitFor(doc, 0, []));
  }
}
