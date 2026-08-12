/* Quick capture: one field, one status line. Nothing else.

   Ctrl+Enter saves, Esc asks for confirmation as long as there's text in the
   field. The text survives everything: it lives as a draft in `localStorage`
   until it's written. Even when no vault is open — then the window says
   what's missing instead of losing the thought.

   After saving, the confirmation stays visible until it's been read: the path
   the thought was filed under, and the way back. Only then does the window
   close — and only if the "close window after filing" setting says so
   (`capture.closeAfterCapture`). A confirmation nobody gets to see isn't one.

   Esc belongs to this screen, not the shell: only here is it known whether
   there's still something in the field. The shell therefore doesn't listen
   for it (`src/main/quick-capture.ts`) — closing happens via `capture:window`. */

import { useEffect, useRef, useState } from 'react';
import type { DumpItem } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import { IconButton } from '../../atoms/IconButton';
import { Kbd } from '../../atoms/Kbd';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { bridge } from '../../lib/bridge';
import { decodeIpcError } from '../../lib/ipc-error';
import { useCaptureSettings } from '../../lib/queries/capture';

/** Where the draft lives until it's written. */
const DRAFT_KEY = 'sb.quickCapture.draft';

/** How long the confirmation stays visible before the window closes. */
export const CONFIRM_MS = 800;

function readDraft(): string {
  try {
    return window.localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    /* Without storage the draft is ephemeral — the field still works either way. */
    return '';
  }
}

function writeDraft(text: string): void {
  try {
    if (text.length === 0) window.localStorage.removeItem(DRAFT_KEY);
    else window.localStorage.setItem(DRAFT_KEY, text);
  } catch {
    return;
  }
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function QuickCapture() {
  const t = useT();
  const [text, setText] = useState(readDraft);
  const [status, setStatus] = useState<Status>('idle');
  const [saved, setSaved] = useState<DumpItem | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settings = useCaptureSettings();

  /* The hotkey reopens the window — then focus needs to go back into the field. */
  useEffect(() => {
    const unsubscribe = bridge().on('event:capture-focus', (payload) => {
      /* The window is hidden, not destroyed: without this reset, the next time
         it opens it would still show the previous thought's confirmation. */
      setSaved(null);
      setStatus('idle');
      if (payload.text) setText(payload.text);
      field.current?.focus();
    });
    field.current?.focus();
    return unsubscribe;
  }, []);

  /* A timer that still fires after the window has disappeared would close a
     freshly opened window right back down. */
  useEffect(
    () => () => {
      if (closing.current !== null) clearTimeout(closing.current);
    },
    [],
  );

  const close = (): void => void api.capture.window(false).catch(() => undefined);

  /** Cancel the scheduled auto-close — the user is still here. */
  const stayOpen = (): void => {
    if (closing.current === null) return;
    clearTimeout(closing.current);
    closing.current = null;
  };

  const change = (next: string): void => {
    stayOpen();
    setText(next);
    writeDraft(next);
    if (status !== 'idle') {
      setStatus('idle');
      setSaved(null);
    }
  };

  const save = async (): Promise<void> => {
    if (text.trim().length === 0 || status === 'saving') return;
    setStatus('saving');
    setErrorCode(null);
    try {
      const dump = await api.capture.dump({ text, origin: 'quick-capture' });
      setText('');
      writeDraft('');
      setSaved(dump);
      setStatus('saved');
      /* This is where the setting is actually read. Whoever turns it off keeps
         the window open and can immediately add the next thought. */
      if (settings?.closeAfterCapture !== false) {
        closing.current = setTimeout(() => {
          closing.current = null;
          close();
        }, CONFIRM_MS);
      }
    } catch (caught) {
      setErrorCode(decodeIpcError(caught).code);
      setStatus('error');
    }
  };

  /** Undo: the dump moves to the trash, the text goes back into the field. */
  const undo = (): void => {
    if (saved === null) return;
    const dump = saved;
    stayOpen();
    setStatus('idle');
    setSaved(null);
    setText(dump.text);
    writeDraft(dump.text);
    field.current?.focus();
    void api.capture.discard(dump.path).catch(() => undefined);
  };

  const escape = (): void => {
    if (text.trim().length === 0) {
      close();
      return;
    }
    setAsking(true);
  };

  const drop = (): void => {
    change('');
    setAsking(false);
    close();
  };

  /* On the window, not the field: Esc must also work when focus is on the
     close button or in the confirmation prompt. The confirmation prompt itself
     has its own escape route via Esc — otherwise it would be a dialog with no
     way out.
     No dependency array, because the listener needs to know the current text
     and whether the confirmation is open; subscribing and unsubscribing costs
     nothing. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (asking) setAsking(false);
      else escape();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  /** Back into the app: bring the main window forward first, then close this one. */
  const toMain = (): void => {
    void api.window
      .show()
      .catch(() => undefined)
      .finally(close);
  };

  const noVault = status === 'error' && errorCode === 'no-vault';

  return (
    <div className="sb-quick">
      <div className="sb-quick-head sb-drag">
        <span className="gs-overline">{t('quickCapture.title')}</span>
        <span className="sb-quick-close sb-no-drag">
          <IconButton icon="x" size="sm" label={t('common.close')} onClick={escape} />
        </span>
      </div>
      <div className="sb-quick-body">
        <textarea
          ref={field}
          className="sb-dumpfield sb-quick-field"
          aria-label={t('quickCapture.placeholder')}
          placeholder={t('quickCapture.placeholder')}
          value={text}
          onChange={(event) => change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void save();
            }
          }}
        />
      </div>

      {asking ? (
        <div className="sb-quick-ask" role="alertdialog" aria-label={t('quickCapture.ask')}>
          <span>{t('quickCapture.ask')}</span>
          <Button size="sm" variant="secondary" onClick={() => setAsking(false)}>
            {t('quickCapture.keep')}
          </Button>
          <Button size="sm" variant="danger" onClick={drop}>
            {t('quickCapture.drop')}
          </Button>
        </div>
      ) : null}

      {noVault ? (
        <p className="sb-quick-novault" role="status">
          <span>{t('quickCapture.noVault')}</span>
          <button type="button" className="sb-textlink" onClick={toMain}>
            {t('quickCapture.toMain')}
          </button>
        </p>
      ) : null}

      {saved !== null ? (
        <p className="sb-quick-saved" role="status">
          <Icon name="circle-check-big" size={14} />
          <span>{t('quickCapture.savedTo')}</span>
          <span className="sb-mono sb-quick-path">{saved.path}</span>
          <button type="button" className="sb-textlink" onClick={undo}>
            {t('quickCapture.undo')}
          </button>
        </p>
      ) : null}

      <div className="sb-quick-foot">
        <Kbd keys={['Ctrl', 'Enter']} />
        <span>{t('quickCapture.hint')}</span>
        <span className="sb-quick-status" role="status">
          {status === 'error' && !noVault && errorCode !== null
            ? t(`error.code.${errorCode}`)
            : null}
        </span>
      </div>
    </div>
  );
}
