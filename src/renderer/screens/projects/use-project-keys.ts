/* Tastatur des Projekt-Screens. Zwei Hooks, weil zwei Bereiche handeln:
   die Liste (j/k, Pfeile, Enter, n) und das Detail (t, x).

   Beide ignorieren Tastendrücke aus Eingabefeldern — sonst hakt „x" beim
   Schreiben eines Todos ein anderes ab. Ziffern bleiben der Rail (die Hülle
   fängt sie), deshalb wird hier nichts mit Modifikatoren angefasst. */

import { useEffect } from 'react';

/**
 * Steht der Fokus in einem Feld, gehört die Taste dem Feld. Kästchen und
 * Auswahlknöpfe sind keine Felder in diesem Sinne: dort **muss** `x` greifen,
 * weil genau das die fokussierte Zeile ist.
 */
function inField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return type !== 'checkbox' && type !== 'radio';
  }
  return tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function plain(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey;
}

export interface ListKeysOptions {
  /** Wie viele Zeilen die Liste hat. */
  count: number;
  /** Stelle der aktuellen Auswahl. */
  index: number;
  /** Auswahl bewegen; `focus` setzt zusätzlich den Fokus auf die Zeile. */
  select: (next: number, focus?: boolean) => void;
  /** Enter: die Auswahl öffnen (Datei im Editor). */
  open: () => void;
  /** n: neues Projekt. */
  create: () => void;
  /** Aus, solange ein Dialog offen ist. */
  enabled?: boolean;
}

export function useListKeys({
  count,
  index,
  select,
  open,
  create,
  enabled = true,
}: ListKeysOptions): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (!plain(event) || inField(event.target)) return;
      if (event.key === 'j' || event.key === 'ArrowDown') {
        if (count === 0) return;
        event.preventDefault();
        select(Math.min(count - 1, index + 1), true);
        return;
      }
      if (event.key === 'k' || event.key === 'ArrowUp') {
        if (count === 0) return;
        event.preventDefault();
        select(Math.max(0, index - 1), true);
        return;
      }
      if (event.key === 'Enter') {
        if (count === 0) return;
        event.preventDefault();
        open();
        return;
      }
      if (event.key === 'n') {
        event.preventDefault();
        create();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, index, select, open, create, enabled]);
}

export interface TodoKeysOptions {
  /** t: das Feld für ein neues Todo öffnen. */
  compose: () => void;
  /** x: das Todo abhaken, auf dem der Fokus liegt. */
  toggle: () => void;
  enabled?: boolean;
}

export function useTodoKeys({ compose, toggle, enabled = true }: TodoKeysOptions): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (!plain(event) || inField(event.target)) return;
      if (event.key === 't') {
        event.preventDefault();
        compose();
        return;
      }
      if (event.key === 'x') {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compose, toggle, enabled]);
}
