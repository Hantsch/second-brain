/* The update channels: remembered state, the manual check and the staged
   download/install actions. Refusals come back as i18n keys inside the result. */

import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';

export function updateHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'update:state': () => services.updates().getState(),
    'update:check': () => services.updates().check({ manual: true }),
    'update:download': () => services.updates().startDownload(),
    'update:cancelDownload': () => services.updates().cancelDownload(),
    'update:installAndRestart': () => services.updates().installAndRestart(),
    'update:dismiss': () => services.updates().dismiss(),
  });
}
