/* Keyboard handling for the projects screen. Two hooks, because two areas
   act: the list (j/k, arrows, Enter, n) and the detail (t, x).

   Both ignore keystrokes from input fields — otherwise "x" while typing a
   todo would check off a different one. Digits stay with the rail (the shell
   catches them), so nothing here touches modifier keys. */

import { useEffect } from 'react';

/**
 * If focus is in a field, the key belongs to the field. Checkboxes and
 * radio buttons aren't fields in this sense: there `x` **must** take effect,
 * because that's exactly the focused row.
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
  /** How many rows the list has. */
  count: number;
  /** Position of the current selection. */
  index: number;
  /** Move the selection; `focus` additionally sets focus on the row. */
  select: (next: number, focus?: boolean) => void;
  /** Enter: open the selection (file in editor). */
  open: () => void;
  /** n: new project. */
  create: () => void;
  /** Off while a dialog is open. */
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
  /** t: open the field for a new todo. */
  compose: () => void;
  /** x: check off the todo that has focus. */
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
