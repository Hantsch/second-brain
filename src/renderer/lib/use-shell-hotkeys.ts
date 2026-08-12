/* Keyboard first: digit keys switch screens, Ctrl+K opens the palette.
   None of this applies in input fields — the user is typing there. */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { screenByHotkey } from './screens';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export interface ShellHotkeyHandlers {
  onPalette: () => void;
  onEscape: () => void;
}

export function useShellHotkeys({ onPalette, onEscape }: ShellHotkeyHandlers): void {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onPalette();
        return;
      }
      if (event.key === 'Escape') {
        onEscape();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      const screen = screenByHotkey(event.key);
      if (screen) {
        event.preventDefault();
        void navigate(screen.path);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, onEscape, onPalette]);
}
