/* The hotkey for quick capture is pressed, not typed.

   Two rules follow from the nature of the thing: a global combination needs
   at least one modifier (otherwise it would swallow an ordinary key in
   every other app), and `Esc` cancels without changing anything.

   Only the main process knows whether the combination is free. It
   re-registers it as soon as the setting is written, and reports via
   `event:toast` if it was already taken — that's why there is no check of
   its own here. */

import { useEffect, useState } from 'react';
import { Button } from '../../atoms/Button';
import { Kbd } from '../../atoms/Kbd';
import { useT } from '../../i18n';

export interface HotkeyRecorderProps {
  /** Current combination in Electron notation, e.g. `Control+Shift+Space`. */
  value: string;
  onCommit: (accelerator: string) => void;
}

const NAMED_KEYS: Record<string, string> = {
  Space: 'Space',
  Enter: 'Return',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
};

/** Physical key → name that Electron's `globalShortcut` understands. */
function mainKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED_KEYS[code] ?? null;
}

export function acceleratorFrom(event: KeyboardEvent): string | null {
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push('Control');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (event.metaKey) modifiers.push('Super');
  const key = mainKey(event.code);
  if (!key || modifiers.length === 0) return null;
  return [...modifiers, key].join('+');
}

export function HotkeyRecorder({ value, onCommit }: HotkeyRecorderProps) {
  const t = useT();
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      if (event.key === 'Escape') {
        setRecording(false);
        return;
      }
      const accelerator = acceleratorFrom(event);
      if (!accelerator) return;
      setRecording(false);
      if (accelerator !== value) onCommit(accelerator);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording, value, onCommit]);

  return (
    <div className="sb-hotkey">
      {recording ? (
        <span className="sb-hotkey-recording">{t('settings.behavior.hotkey.recording')}</span>
      ) : (
        <Kbd keys={value ? value.split('+') : [t('settings.behavior.hotkey.none')]} />
      )}
      <Button
        variant="secondary"
        size="sm"
        icon="command"
        aria-pressed={recording}
        onClick={() => setRecording((active) => !active)}
      >
        {recording ? t('common.cancel') : t('settings.behavior.hotkey.record')}
      </Button>
    </div>
  );
}
