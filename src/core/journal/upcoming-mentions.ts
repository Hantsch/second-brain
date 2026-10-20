/**
 * Upcoming mentions (070): the forward-looking half of the loose-end rule — a
 * day's own text names a coming day ("morgen bin ich beim Notar"), and that day
 * has not arrived yet.
 *
 * One scan, two windows. Everything about what counts as an announcement —
 * the user's own prose, the sentence split, `findDates` resolved against the day
 * the sentence stands in, `isForward`, the subject anchored at the reference —
 * lives in `announcementsOf` and is shared verbatim; only the date window is
 * different, and it arrives as a parameter (`AnnouncementWindow`). A second
 * scanner would be a second truth that drifts.
 *
 * The two windows are disjoint by construction: loose ends keep `refDate <
 * today`, this one takes `refDate >= today`. So the same sentence is an upcoming
 * mention up to and including the day it points at, and a loose end from the day
 * after — never both, and never neither. Since the id is `looseEndId(day,
 * quote)` on both sides, that handover is literally the same item continuing,
 * which is what lets a snooze survive it.
 *
 * Derived, never stored, and no clock: `today` and the horizon come from the
 * caller, same input gives the same output (CLAUDE.md: "the index is derived").
 */

import type { UpcomingMention } from '@shared/types';
import { daysBetween } from '@core/index/dates';
import { announcementsOf, settledCheck } from './loose-ends';
import type { AnnouncementWindow, LooseEndDay, LooseEndTodo } from './loose-ends';

/**
 * The forward window: days up to and including today are read (a sentence
 * written today has to count immediately — that is the whole point of 070; a day
 * file dated in the future is not read at all), and a reference counts from
 * today up to the horizon.
 *
 * The lower bound is inclusive on purpose. On the day itself the mention is
 * still upcoming, not yet a loose end: nothing has passed unanswered while the
 * day is still running.
 */
function forwardWindow(horizonDays: number): AnnouncementWindow {
  return {
    scans: (day, today) => day <= today,
    accepts: (refDate, today) => {
      const daysOut = daysBetween(today, refDate);
      return daysOut !== null && daysOut >= 0 && daysOut <= horizonDays;
    },
  };
}

/**
 * Every announcement whose day is still to come, nearest day first.
 *
 * `horizonDays` bounds it the way the reminders do (`deadlineHorizonDays`): a
 * mention two years out is not a reminder, it is an entry in a diary.
 *
 * The subtraction of step 4 is `settledCheck`, unchanged: an announcement a
 * dated todo already carries, or that a later day has picked back up, is not
 * nagged on a second surface either.
 *
 * Sorted by the day pointed at, so the nearest mention reads first — unlike
 * `findLooseEnds`, where the announcing day is what the reader is looking for.
 * The tie-breakers are that same announcing day and its line, so the order is
 * total and does not depend on how `days` happens to be ordered. The
 * deduplication follows `findLooseEnds` exactly: an id can only collide inside
 * one day, and if a day is handed over twice the first one listed wins.
 */
export function findUpcomingMentions(
  days: readonly LooseEndDay[],
  todos: readonly LooseEndTodo[],
  today: string,
  horizonDays: number,
): UpcomingMention[] {
  const settled = settledCheck(days, todos);
  const window = forwardWindow(horizonDays);
  const found = new Map<string, UpcomingMention>();

  for (const source of days) {
    for (const { at, ...announcement } of announcementsOf(source, today, window)) {
      if (settled(announcement.day, announcement.quote, at)) continue;
      if (found.has(announcement.id)) continue;
      found.set(announcement.id, { ...announcement, origin: 'heuristic' });
    }
  }

  return [...found.values()].sort(
    (a, b) => a.refDate.localeCompare(b.refDate) || a.day.localeCompare(b.day) || a.line - b.line,
  );
}
