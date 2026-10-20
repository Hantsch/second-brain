/* Full result view query (059, D5): wraps `search:query` with the scope and
   type-group filters and the paging the results screen needs — separate from
   whatever the command palette's own six-hit lookup does with the same
   channel (`qk.search.query`), since the two ask for different, differently
   filtered result sets and must not share a cache entry. */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { DocType, Scope, SearchHit } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';

export interface SearchResultsQuery {
  text: string;
  scope?: Scope;
  types?: readonly DocType[];
  limit: number;
}

/**
 * Runs the filtered, paged search. Disabled for a blank query — the same
 * "nothing typed yet" state the command palette already treats as "ask
 * nothing of the index" (its own `MIN_QUERY`); here the honest empty state is
 * `SearchScreen`'s job, not this hook's, so it stays out of the enabled
 * predicate entirely.
 *
 * `placeholderData: keepPreviousData` keeps the current rows on screen while
 * "show more" fetches a larger `limit` — without it the list would flash to
 * the loading state on every page grow, even though every previously shown
 * hit is still going to be in the new answer.
 */
export function useSearchResults({
  text,
  scope,
  types,
  limit,
}: SearchResultsQuery): UseQueryResult<SearchHit[]> {
  const trimmed = text.trim();
  const typesArray = types === undefined ? undefined : [...types];
  return useQuery({
    queryKey: qk.search.results(trimmed, scope, typesArray, limit),
    queryFn: () => api.search.query(trimmed, { scope, types: typesArray, limit }),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
  });
}
