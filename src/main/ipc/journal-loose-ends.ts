/* Loose ends on a journal day (020, D5; 069, D3): the wire shape `journal:get`
 * returns, combining what's still open (`openLooseEnds`) with what's since
 * been resolved (`dayLooseEnds`, 069/D2). Its own module because
 * `src/main/ipc/journal.ts` is already at the ~300-line soft limit
 * (CLAUDE.md) — the state/gardener plumbing that used to live there now
 * lives here, alongside the composition D3 adds, rather than piling more
 * logic onto that file.
 *
 * Read-only throughout: every function here reads the index, the vault-state
 * files (`.secondbrain/gardener.json`, `.secondbrain/loose-ends.json`) and the
 * plain data `@core/journal` derives from them — nothing writes to the vault,
 * so `journal:get` cannot touch the announcing day's hash (069, AC2).
 */

import { findingId, looseEndInput } from '@core/gardener';
import { announcementsOf, dayLooseEnds, findLooseEnds } from '@core/journal';
import type { LooseEndDay, LooseEndTodo } from '@core/journal';
import type { JournalDayLooseEnd, JournalInterviewLooseEnd } from '@shared/ipc';
import { gardenerIndex, gardenerStateFor, gardenerToday } from './gardener-deps';
import { looseEndState } from '../loose-end-state';
import type { Services } from '../services';

/** The day/todo stock every loose-end read starts from — one derivation, shared
    by `openLooseEnds` and the resolution composition below. */
async function looseEndContext(
  services: Services,
): Promise<{ days: LooseEndDay[]; todos: LooseEndTodo[]; today: string }> {
  const { days, todos } = looseEndInput({ index: gardenerIndex(services) });
  return { days, todos, today: gardenerToday() };
}

/**
 * The loose ends the interview's one extra question (020, D8) may draw from:
 * `findLooseEnds` re-derived over the index, oldest first (its own sort),
 * minus whatever's already dealt with on another surface — answered (D5,
 * `main/loose-end-state.ts`), or "looks fine"/snoozed on the maintenance
 * screen (017, `main/gardener-state.ts`). Mirrors `reminders.ts`'s
 * `excludeAnsweredLooseEnds` and `gardener-deps.ts`'s `rejected` composition:
 * both filter the very same two states for the very same reason, so this is
 * the third and last copy of that particular check, not a fourth invention.
 *
 * `id` is rewritten to `findingId('loose-end', looseEnd.id)` before it ever
 * reaches `planInterview` — the id under which the maintenance screen and the
 * reminders list already track this same loose end, and the one
 * `journal:answerLooseEnd` must record it under so answering here makes it
 * disappear from those surfaces too, not just from this one dialog.
 */
export async function openLooseEnds(services: Services): Promise<JournalInterviewLooseEnd[]> {
  const { days, todos, today } = await looseEndContext(services);
  const found = findLooseEnds(days, todos, today);
  if (found.length === 0) return [];

  const answered = (await looseEndState(services.requireVaultRoot())).answeredIds();
  const gardener = await gardenerStateFor(services);
  const dismissed = gardener.dismissed();

  const open: JournalInterviewLooseEnd[] = [];
  for (const looseEnd of found) {
    const id = findingId('loose-end', looseEnd.id);
    if (answered.has(id) || dismissed.has(id)) continue;
    const snoozedUntil = gardener.snoozedUntil(id);
    if (snoozedUntil !== null && snoozedUntil > today) continue;
    open.push({ id, day: looseEnd.day, quote: looseEnd.quote });
  }
  return open;
}

/**
 * The `answered` map `dayLooseEnds` (069/D2) wants: raw announcement id to
 * answering path, for exactly this day's announcements. `.secondbrain/loose-ends.json`
 * keys its records by the *wrapped* id (`findingId('loose-end', ...)`, the id
 * `journal:answerLooseEnd` is called with) — not invertible, so this recomputes
 * the wrapped id per announcement and looks it up, the same step `openLooseEnds`
 * takes above.
 */
async function answeredFor(
  services: Services,
  source: LooseEndDay | undefined,
  today: string,
): Promise<Map<string, string>> {
  const answered = new Map<string, string>();
  if (source === undefined) return answered;

  const state = await looseEndState(services.requireVaultRoot());
  const byWrappedId = new Map(state.answered().map((entry) => [entry.id, entry.path]));
  for (const announcement of announcementsOf(source, today)) {
    const path = byWrappedId.get(findingId('loose-end', announcement.id));
    if (path !== undefined) answered.set(announcement.id, path);
  }
  return answered;
}

/**
 * `journal:get`'s loose ends for one day (069, D3): the union of `openLooseEnds`
 * (unchanged, AC3) and `dayLooseEnds`'s resolved entries, on the wire shape.
 *
 * A candidate is either open or resolved, never both — `findLooseEnds`'s own
 * settledCheck already excludes from `openLooseEnds` anything `resolutionCheck`
 * (the same vault heuristic `dayLooseEnds` runs) would resolve, and an
 * answered-map resolution only ever applies to a candidate the state file
 * itself marks answered, which `openLooseEnds` also excludes. The two lists
 * are therefore disjoint by construction, not by a dedupe step here.
 */
export async function journalDayLooseEnds(
  services: Services,
  date: string,
): Promise<JournalDayLooseEnd[]> {
  const [open, { days, todos, today }] = await Promise.all([
    openLooseEnds(services),
    looseEndContext(services),
  ]);
  const openHere: JournalDayLooseEnd[] = open
    .filter((looseEnd) => looseEnd.day === date)
    .map((looseEnd) => ({ ...looseEnd, resolution: null }));

  const source = days.find((candidate) => candidate.day.date === date);
  const answered = await answeredFor(services, source, today);
  const resolved: JournalDayLooseEnd[] = dayLooseEnds(days, todos, today, date, answered)
    .filter((end) => end.resolution !== null)
    .map((end) => ({
      id: findingId('loose-end', end.id),
      day: end.day,
      quote: end.quote,
      resolution: end.resolution,
    }));

  return [...openHere, ...resolved];
}
