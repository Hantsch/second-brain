/* Der Tastaturweg des Tagebuchs.
 *
 * Zwei Entscheidungen, und beide sind Konflikte, die aufgelöst werden müssen:
 *
 * - **Pfeile und j/k wechseln den Tag** — aber nicht, während jemand schreibt. In
 *   einem Textfeld gehören sie dem Text (Zeilenwechsel, Cursor), sonst könnte man
 *   im Tagestext nicht nach oben.
 * - **Die Haltung wechselt mit Ctrl+1 bis Ctrl+3, nicht mit 1/2/3.** Die nackten
 *   Ziffern gehören der Rail (Screenwechsel, `use-shell-hotkeys.ts`), und im
 *   Schreibfeld sind sie Zeichen — genau dort braucht man den Wechsel aber. Mit
 *   Strg greift er überall: die Hülle lässt Tastendrücke mit Modifikator liegen,
 *   und ein Textfeld schreibt sie nicht. Der Hinweis dazu steht am Segment
 *   (`CoachModeSwitch`), damit niemand raten muss.
 *
 * Ein offener Dialog behält seine Tasten (Prüfung auf `.gs-scrim`).
 */

import { useEffect } from 'react';
import type { CoachMode } from '@shared/types';
import { COACH_MODE_ORDER } from '../../lib/queries/journal';

/* Im Feld tippt der Nutzer — dieselbe Regel wie in der Hülle. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export interface JournalKeysOptions {
  /** Die auswählbaren Tage, jüngster zuerst. */
  dates: readonly string[];
  /** Der gerade offene Tag. */
  current: string;
  /** Tag wählen; `focus` zieht den Tastaturfokus auf die Zeile. */
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
