/* The update-check channels: remembered state and the manual check. */

import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';

export function updateHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'update:state': () => services.updates().getState(),
    'update:check': () => services.updates().check({ manual: true }),
  });
}
