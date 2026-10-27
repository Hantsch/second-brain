/* The raw doc list of the open vault, which both condense runs and the agent's module
   condensation read their inputs from. `IndexLike` does not promise it, so it is checked. */

import type { IndexedDoc } from '@core/index/types';
import { fail } from './errors';
import type { IndexLike } from '../contracts';
import type { Services } from '../services';

/** What this needs from the index — the raw doc list only. */
const CONDENSE_INDEX_METHODS: readonly string[] = ['index'];

interface DocsView {
  index(): { docs: readonly IndexedDoc[] };
}

function knowsDocs(index: IndexLike): index is IndexLike & DocsView {
  const record = index as unknown as Record<string, unknown>;
  return CONDENSE_INDEX_METHODS.every((method) => typeof record[method] === 'function');
}

/** Every indexed doc of the open vault — the same list `deriveAreas()` reads. */
export function condenseDocs(services: Services): readonly IndexedDoc[] {
  const index = services.requireIndex();
  if (!knowsDocs(index)) throw fail('io', 'der Index liefert keine Dokumentliste');
  return index.index().docs;
}
