/* The "not finished" rule for journal days — pure logic, no React.
 *
 * A day only counts as unfinished once it is over: today itself is never
 * open, no matter what `closed` says or whether it even has a file yet, and
 * neither is a day still in the future (defensive — the vault shouldn't
 * produce these, but a clock skew or backfill must not surface as "open").
 * A day without a file — the gap/placeholder rows `DayList.tsx` builds via
 * `dayRows`, where `day` is `null` for "today" before its first save — is
 * likewise never open: there is nothing unfinished about an entry that was
 * never started. */

import type { JournalDay } from '@shared/types';

/** Whether this day is unfinished: has a file, `closed` is still `null`, and
    its date lies strictly before `today`. */
export function isDayOpen(day: JournalDay | null, today: string): boolean {
  if (day === null) return false;
  return day.closed === null && day.date < today;
}

/** Just the open days, in whatever order they arrived — callers already hand
    this a newest-first list, so nothing here re-sorts it. */
export function openDays(days: readonly JournalDay[], today: string): JournalDay[] {
  return days.filter((day) => isDayOpen(day, today));
}

/** How many days are still open. */
export function countOpenDays(days: readonly JournalDay[], today: string): number {
  return openDays(days, today).length;
}
