/** The query's filters as one predicate — shared by `search()` and `searchPassages()`. */

import type { DocType, SearchQuery } from '@shared/types';
import type { IndexedDoc } from './types';

export type Keep = (doc: IndexedDoc | undefined) => boolean;

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
export function filterFor(query: SearchQuery): Keep {
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
