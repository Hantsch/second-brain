/* Suche. Ohne Index gibt es keine Treffer — aber auch keinen Fehler: der
   Renderer zeigt „nichts gefunden", und die App bleibt bedienbar. */

import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';

export function searchHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'search:query': async (query) => {
      const index = services.index();
      if (!index || !query.text.trim()) return [];
      return index.search(query);
    },
  });
}
