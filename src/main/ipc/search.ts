/* Suche. Ohne Index gibt es keine Treffer — aber auch keinen Fehler: der
   Renderer zeigt „nichts gefunden", und die App bleibt bedienbar. */

import { resolveLink } from '@core/index/resolve-link';
import type { IndexedDoc } from '@core/index/types';
import type { IndexLike } from '../contracts';
import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';

/** What `search:resolveLinks` needs from the index — the raw doc list only,
    the same structural check `condense.ts`'s `knowsDocs` uses for the same
    reason: `resolveLink()` reads across all doc types, not the narrower
    lists the shell's `IndexLike` otherwise exposes. */
const RESOLVE_INDEX_METHODS: readonly string[] = ['index'];

interface DocsView {
  index(): { docs: readonly IndexedDoc[] };
}

function knowsDocs(index: IndexLike): index is IndexLike & DocsView {
  const record = index as unknown as Record<string, unknown>;
  return RESOLVE_INDEX_METHODS.every((method) => typeof record[method] === 'function');
}

export function searchHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'search:query': async (query) => {
      const index = services.index();
      if (!index || !query.text.trim()) return [];
      return index.search(query);
    },
    'search:resolveLinks': async ({ from, targets }) => {
      const index = services.index();
      const docs = index !== null && knowsDocs(index) ? index.index().docs : null;
      const result: Record<string, string | null> = {};
      for (const target of targets) {
        result[target] = docs === null ? null : resolveLink(target, from, docs);
      }
      return result;
    },
  });
}
