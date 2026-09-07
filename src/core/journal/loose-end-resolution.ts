/**
 * A day's loose ends, together with what settled them — the view a screen or a
 * digest needs, built on top of `loose-ends.ts` without adding a second scan or
 * a second definition of "settled".
 *
 * Resolution order is vault first, state file second. `resolutionCheck()` reads
 * the vault: a later day linking `[[<day>]]` and picking the subject back up, or
 * a todo carrying the subject with a deadline. Only when the vault heuristic
 * finds nothing (`null`) — or finds only the todo branch, which names a home for
 * the loose end but is not itself a resolution shown here — does the explicit
 * `answered` record get a say. That record is `.secondbrain/loose-ends.json`'s
 * id-to-answering-path map: the app's own memory of an answer whose wording did
 * not repeat the subject and that the vault heuristic could therefore never find
 * on its own (an "Erledigt." with no vault-matchable trace).
 *
 * A todo-settled announcement — `resolutionCheck` says `{ by: 'todo' }` and
 * `answered` does not override it — is left out of the result entirely. Its
 * home is the todo list, not this day: see `resolutionOf`'s doc in
 * `loose-ends.ts` for why that branch is not itself shown as a resolution.
 *
 * Pure and read-only by construction: `days`, `todos` and `answered` are plain
 * data the caller already has (the same shapes `findLooseEnds` consumes plus a
 * map), `today` and `date` are handed in — no store, no clock, no filesystem
 * access, so nothing here can write anything back to the vault.
 */

import type { Announcement, LooseEndDay, LooseEndTodo } from './loose-ends';
import { announcementsOf, resolutionCheck } from './loose-ends';

/** Where a day's loose end was settled: the day that picked it back up. */
export interface DayLooseEndResolution {
  day: string;
  path: string;
}

/**
 * One of a day's announcements, with its resolution attached — `null` while it
 * is still open. Everything `Announcement` carries except `at`, which is an
 * implementation detail of the scan (`resolutionCheck` needs it, a caller
 * showing the day does not).
 */
export interface DayLooseEnd extends Omit<Announcement, 'at'> {
  resolution: DayLooseEndResolution | null;
}

/** The date of the day a given path belongs to, if that day is in `days`. */
function dateOfPath(days: readonly LooseEndDay[], path: string): string | undefined {
  return days.find((candidate) => candidate.day.path === path)?.day.date;
}

/**
 * One day's announcements (from `announcementsOf`, scoped to `date`), oldest
 * first, each carrying how it was settled.
 *
 * `answered` only ever fills in what the vault heuristic missed: a candidate
 * `resolutionCheck` already resolves to a day is reported exactly as it names
 * it, never overridden by the state file. A candidate it resolves to `{ by:
 * 'todo' }` is dropped from the result unless `answered` names an answering day
 * for it — the state file can turn a todo-settled announcement into a shown,
 * resolved one, but nothing here can turn a shown one back into a todo-only one.
 */
export function dayLooseEnds(
  days: readonly LooseEndDay[],
  todos: readonly LooseEndTodo[],
  today: string,
  date: string,
  answered: ReadonlyMap<string, string>,
): DayLooseEnd[] {
  const source = days.find((candidate) => candidate.day.date === date);
  if (source === undefined) return [];

  const resolve = resolutionCheck(days, todos);
  const found: DayLooseEnd[] = [];

  for (const { at, ...announcement } of announcementsOf(source, today)) {
    const vault = resolve(announcement.day, announcement.quote, at);
    if (vault?.by === 'day') {
      found.push({ ...announcement, resolution: { day: vault.date, path: vault.path } });
      continue;
    }

    const answeredPath = answered.get(announcement.id);
    if (answeredPath !== undefined) {
      const answeredDay = dateOfPath(days, answeredPath);
      found.push({
        ...announcement,
        resolution: answeredDay === undefined ? null : { day: answeredDay, path: answeredPath },
      });
      continue;
    }

    if (vault?.by === 'todo') continue;
    found.push({ ...announcement, resolution: null });
  }

  return found;
}
