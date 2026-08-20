/* The month grid: a compact date picker for the journal's day list (010,
 * D1). It lives next to `DayList` in the same narrow side column — a
 * calendar answers "which day, out of a whole month" faster than scrolling a
 * list, especially once gaps make the list long.
 *
 * Two decisions carry the grid:
 *
 * - **A written day is history whatever its date.** A future day only turns
 *   unselectable once it has no file — a backfilled entry (or a clock that
 *   drifted) stays a normal, clickable day. `monthCells` (now in
 *   `lib/month-calendar.ts`) is the one place that decides this, so the
 *   component itself never re-derives it.
 * - **Today and selected read differently on purpose.** Reusing one visual
 *   treatment for both would hide the difference between "where the app
 *   thinks we are" and "what you're currently looking at" — a day can be
 *   both, or either, or neither.
 *
 * D4 (010) adds a third marker, `.sb-monthcal-unfinished`, straight from
 * `cell.unfinished` (itself `isDayOpen` under the hood) — a past day with a
 * file whose `closed` is still `null`. Unrelated to `disabled`, which is
 * about future days without a file.
 *
 * D3 (010) added the grid's keyboard surface — a roving tabindex plus a
 * `keydown` handler on the `<table>` itself. That it sits on the table and not
 * on `window` is the whole point: `use-journal-keys.ts` owns `j`/`k` and the
 * arrows for the rest of the journal screen and stands down for exactly this
 * subtree (`.sb-monthcal-grid`), so every keypress has one handler and no
 * arrow key is either handled twice or dropped.
 *
 * The pure date/grid math (D1/D3) moved to `lib/month-calendar.ts` in D4 once
 * this file grew past the ~300-line soft cap — this file keeps only the
 * component, its keyboard wiring, and weekday-label formatting.
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { JournalDay, UiLanguage } from '@shared/types';
import { Button } from '../atoms/Button';
import { useLanguage, useT } from '../i18n';
import { locale } from '../lib/format';
import type { Cell } from '../lib/month-calendar';
import {
  GRID_ROWS,
  WEEKDAY_COUNT,
  lastDayOf,
  monthCells,
  monthOf,
  nextOpenable,
  shiftMonth,
} from '../lib/month-calendar';
import { dateOf } from './DayList';

/** Arrow keys inside the grid, in calendar days: a day sideways, a week
    vertically — the two directions the grid's own layout offers. */
const ARROW_STEP: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -WEEKDAY_COUNT,
  ArrowDown: WEEKDAY_COUNT,
};
/** 1 Jan 2024 was a Monday — used only to read locale weekday abbreviations
    off a known date, never to compute an actual calendar day. */
const REFERENCE_MONDAY = new Date(2024, 0, 1);

function weekdayLabels(language: UiLanguage): string[] {
  const formatter = new Intl.DateTimeFormat(locale(language), { weekday: 'short' });
  return Array.from({ length: WEEKDAY_COUNT }, (_, i) =>
    formatter.format(
      new Date(
        REFERENCE_MONDAY.getFullYear(),
        REFERENCE_MONDAY.getMonth(),
        REFERENCE_MONDAY.getDate() + i,
      ),
    ),
  );
}

export interface MonthCalendarProps {
  days: readonly JournalDay[];
  today: string;
  selected: string;
  onSelect: (date: string) => void;
  month: string;
  onMonth: (month: string) => void;
  /** Owned by the screen (010, D2 persists it in sessionStorage) — this
      component only renders the state it's given. */
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function MonthCalendar({
  days,
  today,
  selected,
  onSelect,
  month,
  onMonth,
  collapsed,
  onToggleCollapse,
}: MonthCalendarProps) {
  const t = useT();
  const language = useLanguage();
  const loc = locale(language);
  const caption = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(
    dateOf(`${month}-01`),
  );
  const weekdays = weekdayLabels(language);
  const cells = monthCells(month, days, today, selected);

  const jumpToday = (): void => {
    onMonth(monthOf(today));
    onSelect(today);
  };

  /* 010, D3 — the grid's single tab stop. `focusDate` is the day the keyboard
     (or a click) last named; everything else is derived, so the stop can never
     point at a cell this month doesn't render. */
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const grid = useRef<HTMLTableElement>(null);
  const inMonth = cells.filter((cell) => !cell.padding);
  const cellAt = (dateIso: string | null): Cell | undefined =>
    inMonth.find((cell) => cell.date === dateIso);
  /* An explicitly named day wins even when it can't be opened — Home/End have
     to reach the month's edge, and a month lying wholly ahead must stay
     reachable at all, or there would be no way to page back out of it by
     keyboard. Otherwise: the selection, today, the first openable day, the
     1st. */
  const roving = (
    cellAt(focusDate) ??
    cellAt(selected) ??
    cellAt(today) ??
    inMonth.find((cell) => !cell.disabled) ??
    inMonth[0]
  )?.date;

  /* The DOM focus follows the roving cell, but only once a keypress or a click
     has named a day: a plain re-render — a month paged with the chevrons, a
     day arriving through the watcher — must never pull the focus out of
     wherever it currently is and into the grid. */
  useEffect(() => {
    if (focusDate === null) return;
    grid.current?.querySelector<HTMLElement>(`.sb-monthcal-day[data-date="${focusDate}"]`)?.focus();
  }, [focusDate]);

  const goTo = (dateIso: string, select: boolean): void => {
    if (select) onSelect(dateIso);
    setFocusDate(dateIso);
    if (monthOf(dateIso) !== month) onMonth(monthOf(dateIso));
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTableElement>): void => {
    /* Same guard as `use-journal-keys.ts`: an open dialog keeps its keys, so a
       focus that somehow lands behind the scrim must not move the grid. */
    if (document.querySelector('.gs-scrim') !== null) return;
    /* Anything with a modifier stays global: Ctrl+1..3 switches the coaching
       stance from here too (`use-journal-keys.ts`), and this handler must not
       swallow it. */
    if (roving === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = ARROW_STEP[event.key];
    if (step !== undefined) {
      /* Arrows move *and* select — the same mental model as the day list, and
         the reason the grid needs the keys at all. */
      event.preventDefault();
      const next = nextOpenable(roving, step, days, today);
      if (next !== null) goTo(next, true);
      return;
    }
    /* Paging and the month's edges move the focus and nothing else: browsing a
       month is not choosing a day, which is why the shown month deliberately
       isn't in the URL. Enter and Space are left to the day button itself — a
       focused button already opens on both, and a second path here would be a
       second answer to "what does opening a day do". */
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      const paged = shiftMonth(month, event.key === 'PageUp' ? -1 : 1);
      const dayNum = Math.min(Number(roving.slice(8, 10)), Number(lastDayOf(paged).slice(8, 10)));
      goTo(`${paged}-${String(dayNum).padStart(2, '0')}`, false);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      goTo(event.key === 'Home' ? `${month}-01` : lastDayOf(month), false);
    }
  };

  return (
    <div className="sb-monthcal" role="group" aria-label={t('journal.calendar.title')}>
      <div className="sb-monthcal-toolbar">
        <Button
          variant="ghost"
          size="sm"
          icon="chevron-left"
          aria-label={t('journal.calendar.prevMonth')}
          onClick={() => onMonth(shiftMonth(month, -1))}
        />
        <Button variant="ghost" size="sm" onClick={jumpToday}>
          {t('journal.calendar.today')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon="chevron-right"
          aria-label={t('journal.calendar.nextMonth')}
          onClick={() => onMonth(shiftMonth(month, 1))}
        />
        <Button
          variant="ghost"
          size="sm"
          className="sb-monthcal-toggle"
          icon={collapsed ? 'chevron-down' : 'chevron-up'}
          aria-label={t(collapsed ? 'journal.calendar.expand' : 'journal.calendar.collapse')}
          aria-expanded={!collapsed}
          aria-controls="sb-monthcal-grid"
          onClick={onToggleCollapse}
        />
      </div>

      <table className="sb-monthcal-grid" id="sb-monthcal-grid" ref={grid} onKeyDown={onKeyDown}>
        <caption>{caption}</caption>
        {collapsed ? null : (
          <thead>
            <tr>
              {weekdays.map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
        )}
        {collapsed ? null : (
          <tbody>
            {Array.from({ length: GRID_ROWS }, (_, row) => (
              <tr key={cells[row * WEEKDAY_COUNT]?.date ?? row}>
                {cells.slice(row * WEEKDAY_COUNT, (row + 1) * WEEKDAY_COUNT).map((cell) =>
                  cell.padding ? (
                    <td key={cell.date} className="sb-monthcal-pad" />
                  ) : (
                    <td key={cell.date}>
                      <button
                        type="button"
                        data-date={cell.date}
                        tabIndex={cell.date === roving ? 0 : -1}
                        className={[
                          'sb-monthcal-day',
                          cell.isToday ? 'sb-monthcal-day--today' : '',
                          cell.isSelected ? 'sb-monthcal-day--selected' : '',
                          cell.disabled ? 'sb-monthcal-day--disabled' : '',
                        ]
                          .join(' ')
                          .trim()}
                        aria-current={cell.isSelected ? 'true' : undefined}
                        aria-disabled={cell.disabled ? 'true' : undefined}
                        aria-label={
                          cell.disabled
                            ? `${cell.date} — ${t('journal.calendar.future')}`
                            : t('journal.calendar.open', { date: cell.date })
                        }
                        /* Also the Enter/Space path: a focused button opens on
                           both by itself, so keyboard and mouse share one
                           route into `onSelect` — and the click takes the
                           roving tab stop with it. */
                        onClick={cell.disabled ? undefined : () => goTo(cell.date, true)}
                      >
                        <span className="sb-monthcal-daynum sb-mono">
                          {Number(cell.date.slice(8, 10))}
                        </span>
                        <span className="sb-monthcal-markers">
                          {cell.day?.mood ? (
                            <span
                              className="sb-moodmark"
                              data-level={cell.day.mood}
                              title={t(`journal.mood.${cell.day.mood}`)}
                              aria-hidden="true"
                            />
                          ) : cell.day !== null ? (
                            <span
                              className="sb-monthcal-entrymark"
                              title={t('journal.calendar.hasEntry')}
                              aria-hidden="true"
                            />
                          ) : null}
                          {/* 010, D4 — a day that is over, has a file, and
                              still has `closed: null`. Never true for today
                              (`isDayOpen` excludes it) or for a padding/
                              gap cell. A distinct shape (square, not a dot),
                              not just a color, per the "no color-only status"
                              rule. */}
                          {cell.unfinished ? (
                            <span
                              className="sb-monthcal-unfinished"
                              title={t('journal.calendar.unfinished')}
                              aria-hidden="true"
                            />
                          ) : null}
                        </span>
                      </button>
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        )}
      </table>

      {/* The visible half of the grid's keys — the month steps have their own
          buttons above, the arrows inside the grid have nothing but this line.
          Gone while collapsed: there is no grid to move in then. */}
      {collapsed ? null : <p className="sb-monthcal-keys">{t('journal.calendar.keys')}</p>}
    </div>
  );
}
