/* The one result store for the running session (073, D3).
 *
 * `TaskResultStore` (`core/tasks/results.ts`) is plain TypeScript and knows
 * nothing about Electron — this is the thin wiring that gives the process one
 * instance of it, deliberately shaped exactly like `work-queue.ts`'s lazy
 * singleton: the results belong to the tasks that produced them, so the two
 * have the same lifetime and the same way of being reached.
 *
 * Unlike the registry, this store *is* emptied when a vault closes
 * (`Services.closeVault`): a proposal is vault content, and Guardrail 6 says
 * vault content does not outlive the vault it came from. The instance itself
 * survives — only what it holds is dropped.
 */

import { TaskResultStore } from '@core/tasks/results';

let instance: TaskResultStore | null = null;

/** The process-wide task result store, created on first use and reused after. */
export function getTaskResults(): TaskResultStore {
  if (instance === null) instance = new TaskResultStore();
  return instance;
}

/** Test-only: drop the singleton so the next `getTaskResults` builds a fresh one. */
export function resetTaskResults(): void {
  instance = null;
}
