/* Story 073, D7: where "view result" on a finished task leads.
 *
 * The route is fully determined by the `WorkTask` the tasks screen already
 * holds locally — no `tasks:result` round-trip is needed just to decide where
 * to go. The destination screen re-derives the actual proposal itself once we
 * land there (`useTaskForSubject`, D5): `CondensedUnitPanel` and
 * `JournalScreen` both already show the open proposal automatically whenever
 * the underlying task is done.
 *
 * Mirrors `src/renderer/screens/garden/targets.ts`'s shape and its
 * `encodeURIComponent` discipline: a pure function, one route string per
 * recognized case, `null` for everything else.
 */

import type { WorkTask } from '@shared/types';

/** `condense:run`'s subject ref is `${unit}:${slug}` (`src/main/ipc/condense.ts`). */
function condenseRoute(ref: string): string | null {
  const [unit, ...rest] = ref.split(':');
  // `rest.join(':')` rather than `rest[0]`, in case a slug itself ever contained a colon.
  const slug = rest.join(':');
  if (slug.length === 0) return null;
  if (unit === 'area') return `/notes?a=${encodeURIComponent(slug)}&tab=condensed`;
  if (unit === 'project') return `/projects?p=${encodeURIComponent(slug)}&tab=knowledge`;
  if (unit === 'module') return `/knowledge?m=${encodeURIComponent(slug)}&tab=condensed`;
  return null;
}

/** `journal:close`'s subject ref is the bare ISO date (`src/main/ipc/journal.ts`). */
function closeDayRoute(ref: string): string {
  return `/journal?d=${encodeURIComponent(ref)}`;
}

/** The address a finished task's "view result" action navigates to, or
    `null` if this task has no result to view (not done, or a kind 074 still
    owns — gardener/ingest). */
export function taskResultRoute(task: WorkTask): string | null {
  if (!task.hasResult) return null;
  const ref = task.subject.ref;
  if (ref === null) return null;
  if (task.kind === 'condense') return condenseRoute(ref);
  if (task.kind === 'close-day') return closeDayRoute(ref);
  return null; // gardener/ingest: no result route yet (074's concern, not this story's)
}
