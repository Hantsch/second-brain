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
 * An open dialog keeps its keys (checked via `.gs-scrim`).
 */

import { useEffect } from 'react';
import type { CoachMode } from '@shared/types';
import { COACH_MODE_ORDER } from '../../lib/queries/journal';

/* The user is typing in the field — same rule as in the shell. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
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
      if (event.altKey || isTyping(event.target)) return;

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
