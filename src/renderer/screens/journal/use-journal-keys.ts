/* The journal's keyboard path.
 *
 * Two decisions, and both are conflicts that need resolving:
 *
 * - **Arrows and j/k switch the day** — but not while someone is typing. In a
 *   text field they belong to the text (line breaks, cursor), otherwise you
 *   couldn't move up within the day's text.
 * - **The stance switches with Ctrl+1 through Ctrl+3, not with 1/2/3.** The
 *   bare digits belong to the rail (screen switching, `use-shell-hotkeys.ts`),
 *   and in the writing field they're characters — but that's exactly where the
 *   switch is needed. With Ctrl it works everywhere: the shell leaves keypresses
 *   with a modifier alone, and a text field doesn't type them. The hint for it
 *   sits on the segment (`CoachModeSwitch`), so no one has to guess.
 *
 * An open dialog keeps its keys (checked via `.gs-scrim`), and so does the
 * month calendar's grid (`.sb-monthcal-grid`, 010/D3 — see `inCalendarGrid`).
 */

import { useEffect } from 'react';
import type { CoachMode } from '@shared/types';
import { COACH_MODE_ORDER } from '../../lib/queries/journal';

/* The user is typing in the field — same rule as in the shell, with one
   exception this screen needs since 013/D5: a checkbox (the "only open days"
   filter above the list) holds focus after a click but has no use for an
   arrow key, so it must not swallow the day switch. Radios and selects keep
   their arrows — there they mean something. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement && target.type === 'checkbox') return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/* Since 010/D3 the month calendar's grid carries its own `keydown` handler
   (`MonthCalendar.tsx`: arrows move within the month, PageUp/PageDown page it).
   Both handlers see the same keypress — this one runs on `window`, so the
   grid's event bubbles up to it afterwards — and exactly one of them may act.
   The subtree named here is precisely the one the grid's handler is attached
   to, which is what makes the split airtight in both directions: no arrow key
   is handled twice, and none is dropped. Everything outside it keeps the day
   switch it always had — the day list, the writing field, and the calendar's
   own toolbar buttons above the grid, which have no grid to move in. */
function inCalendarGrid(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.sb-monthcal-grid') !== null;
}

export interface JournalKeysOptions {
  /** The selectable days, most recent first. */
  dates: readonly string[];
  /** The day that's currently open. */
  current: string;
  /** Select a day; `focus` moves keyboard focus to the row. */
  select: (date: string, focus?: boolean) => void;
  onMode: (mode: CoachMode) => void;
}

export function useJournalKeys({ dates, current, select, onMode }: JournalKeysOptions): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (document.querySelector('.gs-scrim') !== null) return;

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const at = COACH_MODE_ORDER.findIndex((_mode, index) => event.key === String(index + 1));
        const mode = at < 0 ? undefined : COACH_MODE_ORDER[at];
        if (mode !== undefined) {
          event.preventDefault();
          onMode(mode);
        }
        return;
      }
      /* Deliberately after the Ctrl block above: the stance switch stays
         global, the day switch does not. */
      if (event.altKey || isTyping(event.target) || inCalendarGrid(event.target)) return;

      const at = dates.indexOf(current);
      const step = event.key === 'j' || event.key === 'ArrowDown' ? 1 : -1;
      if (!['j', 'k', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
      if (at < 0 || dates.length === 0) return;
      const next = dates[Math.min(dates.length - 1, Math.max(0, at + step))];
      if (next === undefined) return;
      event.preventDefault();
      select(next, true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dates, current, select, onMode]);
}
