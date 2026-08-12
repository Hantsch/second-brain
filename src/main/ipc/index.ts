/* Index-Kanäle. Ohne offenen Vault sind die Kennzahlen null — der Renderer
   zeigt dann einen ehrlichen Leerzustand, keinen Fehler. Der Neuaufbau meldet
   seinen Fortschritt über `event:index-progress`. */

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
