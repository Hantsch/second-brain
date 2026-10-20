/* The work queue's three verbs (072, D2): stop what is running, take what is
   waiting out of the lane, run what failed again. Reading stays where 071 left
   it — `work:list` in `ipc/work.ts` — because these three only mutate the one
   registry `work-queue.ts` holds; that registry emits `event:work-tasks` itself
   on every transition, so nothing here has to send an event of its own.

   Thin on purpose: the ordering that makes cancelling safe (free the lane in a
   `finally`, let a task go terminal exactly once) lives in
   `core/work/registry.ts` and is not re-stated — let alone re-implemented — on
   this side of the boundary. */

import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import { getTaskResults } from '../task-results';
import { getWorkQueue } from '../work-queue';
import type { Services } from '../services';

/* 072, D5: `runTasksFixture` (`ipc/tasks-e2e-fixture.ts`) is deliberately
   *not* wired in here. `registerAllHandlers` runs during `bootstrap()`,
   before `index.ts`'s `start()` ever opens a vault — and `openVault` always
   calls `closeVault` first (even for the very first vault of the session),
   which cancels and clears the whole work queue (`Services.closeVault`).
   Anything enqueued at this layer would be wiped before a window ever shows
   it. The fixture is invoked from `index.ts`, right after `restoreVault`,
   the same hook point `startGardenerAutorun` already uses for its own
   on-open behaviour. */

export function tasksHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'tasks:cancel': ({ id }) => getWorkQueue(services).cancel(id, 'user'),

    /* Remove *is* cancel: `WorkRegistry.cancel` already covers the queued case
       — it marks the task terminal before it can ever be started, so the pump
       that a finishing task triggers skips it. Removing it from the lane by
       hand instead would reopen exactly that race. */
    'tasks:remove': ({ id }) => getWorkQueue(services).cancel(id, 'user'),

    'tasks:retry': ({ id }) => getWorkQueue(services).retry(id),

    /* The payload a finished task left behind (073, D3) — held next door in
       `task-results.ts`, not on the task record, so `work:list` never carries a
       whole proposal. `null` is the honest answer for an unknown id, a task
       that produced nothing, and one whose result has already been accepted or
       rejected alike: in all three there is nothing left to decide about. */
    'tasks:result': ({ id }) => getTaskResults().get(id),
  });
}
