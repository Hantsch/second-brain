/* The month grid's pure date/grid math — split out of `MonthCalendar.tsx`
 * (010, D4) once that file grew past the ~300-line soft cap with D1's cell
 * grid and D3's keyboard helpers already in it. Nothing here touches React;
 * the component imports these and adds rendering and keyboard wiring on top.
 *
 * Two decisions carry the grid (unchanged from D1/D3, just relocated):
 *
 * - **A written day is history whatever its date.** A future day only turns
 *   unselectable once it has no file — a backfilled entry (or a clock that
 *   drifted) stays a normal, clickable day. `monthCells` below is the one
 *   place that decides this, so the component itself never re-derives it.
 * - **Today and selected read differently on purpose.** Reusing one visual
 *   treatment for both would hide the difference between "where the app
 *   thinks we are" and "what you're currently looking at" — a day can be
 *   both, or either, or neither.
 *
 * D4 adds a third, independent flag: `unfinished`, straight from
 * `isDayOpen` — a past day with a file whose `closed` is still `null`. It has
 * nothing to do with `disabled` (a future day without a file): one is about
 * days that are over and left open, the other about days that haven't
 * happened yet.
 *
 * 070, D4 adds a fourth, equally independent flag: `upcoming` — a day a
 * future mention names (`findUpcomingMentions`, surfaced as a
 * `source: 'upcoming-mention'` reminder). Unlike `unfinished` it can land on
 * a day with no file at all: that is exactly the case the story is about, a
 * day nothing has been written on yet already carrying a badge because
 * something elsewhere points at it.
 */

import type { JournalDay } from '@shared/types';
import { dateOf, todayIso } from '../components/DayList';
import { isDayOpen } from './journal-open';

export const WEEKDAY_COUNT = 7;
export const GRID_ROWS = 6;

/** One cell of the six-by-seven grid. */
export interface Cell {
  /** Calendar date, always a real day even for padding cells (the day
      before/after the shown month) — needed to size out-of-month cells
      consistently and, in principle, to key them. */
  date: string;
  /** Belongs to the previous or next month, shown only to fill the grid. */
  padding: boolean;
  /** The matching entry, or `null` if the day has no file. */
  day: JournalDay | null;
  isToday: boolean;
  isSelected: boolean;
  /** In the future and without a file — the one unselectable state. A future
      day that already has a file (`day !== null`) is never disabled. */
  disabled: boolean;
  /** Past, has a file, `closed` is still `null` — straight from `isDayOpen`.
      Never true for today (it isn't open by definition) or for a day
      without a file. */
  unfinished: boolean;
  /** A future mention names this day (070, D4) — true whether or not the day
      has a file yet, and independent of `disabled`/`unfinished`. */
  upcoming: boolean;
}

/** The year-month key of a date, e.g. `'2026-08'` — the unit `shiftMonth`
    and `monthCells` operate on. */
export function monthOf(dateIso: string): string {
  return dateIso.slice(0, 7);
}

/** The month `delta` steps away, wrapping the year in both directions. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split('-').map(Number);
  const zeroBased = (monthNum ?? 1) - 1 + delta;
  const nextYear = (year ?? 1970) + Math.floor(zeroBased / 12);
  const nextMonth = ((zeroBased % 12) + 12) % 12;
  return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}`;
}

/** One step of `delta` calendar days — through `Date`, never by adding to the
    string: month lengths and leap years live in the calendar, not in the text. */
function addDays(dateIso: string, delta: number): string {
  const day = dateOf(dateIso);
  return todayIso(new Date(day.getFullYear(), day.getMonth(), day.getDate() + delta));
}

/** The last day of `month` — the 1st of the next one, a step back. */
export function lastDayOf(month: string): string {
  return addDays(`${shiftMonth(month, 1)}-01`, -1);
}

/** The one rule for "this day cannot be opened": it lies ahead and has no
    file. `monthCells` (for the cell's own state) and the keyboard's grid math
    both go through here, so there is one answer to it and not two. */
function unopenable(dateIso: string, written: boolean, today: string): boolean {
  return !written && dateIso > today;
}

/**
 * Stepping `delta` days at a time from `from`, the first day that can actually
 * be opened — a run of blank future days is stepped over, not landed on.
 *
 * The scan is bounded by one grid's worth of candidates: beyond the last
 * written day the future is open-ended and there is nothing ahead to reach, so
 * the answer is `null` and the focus stays where it is rather than walking off
 * into empty years.
 */
export function nextOpenable(
  from: string,
  delta: number,
  days: readonly JournalDay[],
  today: string,
): string | null {
  const written = new Set(days.map((day) => day.date));
  let candidate = from;
  for (let i = 0; i < GRID_ROWS * WEEKDAY_COUNT; i++) {
    candidate = addDays(candidate, delta);
    if (!unopenable(candidate, written.has(candidate), today)) return candidate;
  }
  return null;
}

/**
 * The 42 cells of one month's grid (six Monday-first weeks, padded with the
 * neighbouring months). `days` only needs to contain days that could plausibly
 * fall in this month and its padding — passing the whole vault is fine, the
 * lookup is by exact date.
 *
 * `upcoming` is the set of ISO dates a future mention names (070, D4) — the
 * caller builds it from `useReminders()`, filtered on
 * `source === 'upcoming-mention'`; this function only looks each cell's date
 * up in it.
 */
export function monthCells(
  month: string,
  days: readonly JournalDay[],
  today: string,
  selected: string,
  upcoming: ReadonlySet<string> = new Set(),
): Cell[] {
  const first = dateOf(`${month}-01`);
  const firstWeekday = (first.getDay() + 6) % 7; // Monday-first offset
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() - firstWeekday);
  const byDate = new Map(days.map((day) => [day.date, day]));

  const cells: Cell[] = [];
  for (let i = 0; i < GRID_ROWS * WEEKDAY_COUNT; i++) {
    const cellDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = todayIso(cellDate);
    const padding =
      cellDate.getMonth() !== first.getMonth() || cellDate.getFullYear() !== first.getFullYear();
    const day = byDate.get(iso) ?? null;
    const disabled = !padding && unopenable(iso, day !== null, today);
    cells.push({
      date: iso,
      padding,
      day,
      isToday: iso === today,
      isSelected: iso === selected,
      disabled,
      unfinished: !padding && isDayOpen(day, today),
      upcoming: !padding && upcoming.has(iso),
    });
  }
  return cells;
}
