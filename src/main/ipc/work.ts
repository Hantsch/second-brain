/* The work queue's one channel (071, D3): a late-joining screen's way to catch
   up on what `event:work-tasks` already told everyone else. No mutation lives
   here yet — enqueueing and cancelling stay behind the features that own the
   tasks (condense, day close, the gardener, ingest); this channel only reads
   the registry `work-queue.ts` holds. */

import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import { getWorkQueue } from '../work-queue';
import type { Services } from '../services';

export function workHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'work:list': () => getWorkQueue(services).list(),
  });
}
