/* Index channels. Without an open vault the metrics are null — the renderer
   then shows an honest empty state, not an error. The rebuild reports its
   progress via `event:index-progress`. */

import { emptyStats } from '@core/index';
import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';

export function indexHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'index:stats': async () => {
      const index = services.index();
      if (!index) return emptyStats();
      return index.stats();
    },

    'index:rebuild': async () => {
      const index = services.requireIndex();
      services.reportIndexProgress(0, 0, true);
      try {
        const stats = await index.rebuild((done, total) =>
          services.reportIndexProgress(done, total, true),
        );
        return stats;
      } finally {
        services.reportIndexProgress(0, 0, false);
        await services.refreshIndexState();
      }
    },
  });
}
