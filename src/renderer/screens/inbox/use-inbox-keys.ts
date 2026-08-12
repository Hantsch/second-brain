/* Der Tastaturweg der Inbox: j/k bewegen, Enter springt in den Vorschlag, e in
   den Text, Ctrl+Enter legt ab, Esc führt zurück in die Liste.

   Der Horcher hängt am Fenster, nicht an der Liste: wer über die Rail oder die
   Ziffer 3 hierher kommt, hat den Fokus noch nicht in der Inbox — j müsste dann
   erst einen Klick abwarten. Ein offener Dialog behält seine Tasten (Prüfung auf
   `.gs-scrim`).

   Ohne Abhängigkeitsliste: der Horcher muss die aktuelle Auswahl kennen, und An-
   und Abmelden kostet nichts. */

import { useEffect } from 'react';

/* Bewegungstasten greifen nicht in Eingabefeldern — dort tippt der Nutzer.
   Dieselbe Regel wie in der Hülle (`use-shell-hotkeys`). */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export interface InboxKeysOptions {
  /** Zahl der Dumps in der Liste. */
  count: number;
  /** Stelle der aktuellen Auswahl. */
  index: number;
  /** Auswahl setzen; `focus` zieht den Tastaturfokus auf die Zeile. */
  select: (next: number, focus?: boolean) => void;
  /** Ctrl+Enter: den Vorschlag ausführen. */
  file: () => void;
  /** Enter: in den Vorschlag springen. */
  focusPanel: () => void;
  /** e: in den Text springen. */
  focusText: () => void;
}

export function useInboxKeys({
  count,
  index,
  select,
  file,
  focusPanel,
  focusText,
}: InboxKeysOptions): void {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (document.querySelector('.gs-scrim') !== null) return;
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        file();
        return;
      }
      if (event.key === 'Escape') {
        select(index, true);
        return;
      }
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        select(Math.min(index + 1, count - 1), true);
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        select(Math.max(index - 1, 0), true);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        focusPanel();
      } else if (event.key === 'e') {
        event.preventDefault();
        focusText();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
}
