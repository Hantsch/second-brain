/* The one work queue for the running session (071, D3).
 *
 * `WorkRegistry` (`core/work/registry.ts`) is plain TypeScript and knows
 * nothing about Electron or events — this is the thin wiring that gives the
 * process one instance of it and threads its `onChange` into
 * `services.sendEvent('event:work-tasks', tasks)`, the same shape
 * `gardener-run-state.ts` uses for `event:gardener-progress`.
 *
 * Deliberately session-only, not vault-scoped: unlike the gardener's run
 * state, this queue does not need to reset when a *different* vault opens —
 * a condense or ingest task started against the vault that's about to close
 * is exactly what D4's `closeVault`/`will-quit` cancels via `cancelAll`, but
 * the registry instance itself lives for the app's lifetime, the same as
 * `Services` does. A lazy singleton, so no vault-opening code path has to
 * remember to construct it first.
 */

import { WorkRegistry } from '@core/work/registry';
import type { Services } from './services';

let instance: WorkRegistry | null = null;

/** The process-wide work queue, created on first use and reused after that. */
export function getWorkQueue(services: Services): WorkRegistry {
  if (instance === null) {
    instance = new WorkRegistry({
      onChange: (tasks) => services.sendEvent('event:work-tasks', tasks),
    });
  }
  return instance;
}

/** Test-only: drop the singleton so the next `getWorkQueue` builds a fresh one. */
export function resetWorkQueue(): void {
  instance = null;
}

/** Whether any task is mid-run; a queued one has computed nothing yet, so it is not counted. */
export function hasRunningTask(services: Services): boolean {
  return getWorkQueue(services)
    .list()
    .some((task) => task.state === 'running');
}
