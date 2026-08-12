/* Schnell erfassen: ein Feld, eine Statuszeile. Nichts sonst.

   Ctrl+Enter speichert, Esc fragt nach, solange Text im Feld steht. Der Text
   übersteht alles: er liegt als Entwurf in `localStorage`, bis er geschrieben
   ist. Auch wenn kein Vault offen ist — dann sagt das Fenster, was fehlt, statt
   den Gedanken zu verlieren.

   Nach dem Speichern bleibt die Bestätigung stehen, bis man sie gelesen hat: der
   Pfad, unter dem der Gedanke liegt, und der Rückweg. Erst danach schließt das
   Fenster — und nur, wenn die Einstellung „Fenster nach dem Ablegen schließen"
   das sagt (`capture.closeAfterCapture`). Eine Bestätigung, die niemand zu sehen
   bekommt, ist keine.

   Esc gehört diesem Screen, nicht dem Rahmen: nur hier ist bekannt, ob noch
   etwas im Feld steht. Der Rahmen hört deshalb nicht mit
   (`src/main/quick-capture.ts`) — geschlossen wird über `capture:window`. */

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

/** Wo der Entwurf liegt, bis er geschrieben ist. */
const DRAFT_KEY = 'sb.quickCapture.draft';

/** So lange steht die Bestätigung, bevor sich das Fenster schließt. */
export const CONFIRM_MS = 800;

function readDraft(): string {
  try {
    return window.localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    /* Ohne Speicher ist der Entwurf flüchtig — das Feld funktioniert trotzdem. */
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

  /* Der Hotkey öffnet das Fenster erneut — dann muss der Fokus zurück ins Feld. */
  useEffect(() => {
    const unsubscribe = bridge().on('event:capture-focus', (payload) => {
      /* Das Fenster wird versteckt, nicht zerstört: ohne dieses Zurücksetzen
         stünde beim nächsten Öffnen die Bestätigung des vorigen Gedanken da. */
      setSaved(null);
      setStatus('idle');
      if (payload.text) setText(payload.text);
      field.current?.focus();
    });
    field.current?.focus();
    return unsubscribe;
  }, []);

  /* Ein Timer, der nach dem Verschwinden des Fensters noch feuert, würde ein
     frisch geöffnetes Fenster wieder zuklappen. */
  useEffect(
    () => () => {
      if (closing.current !== null) clearTimeout(closing.current);
    },
    [],
  );

  const close = (): void => void api.capture.window(false).catch(() => undefined);

  /** Den geplanten Selbstschluss abbestellen — der Nutzer ist noch da. */
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
      /* Die Einstellung wird hier wirklich gelesen. Wer sie abschaltet, behält
         das Fenster und kann den nächsten Gedanken hinterherschieben. */
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

  /** Rückgängig: der Dump wandert in den Papierkorb, der Text zurück ins Feld. */
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

  /* Am Fenster, nicht am Feld: Esc muss auch wirken, wenn der Fokus auf dem
     Schließen-Knopf oder in der Rückfrage steht. Die Rückfrage selbst hat mit Esc
     ihren eigenen Fluchtweg — sonst wäre sie ein Dialog ohne Ausgang.
     Ohne Abhängigkeitsliste, weil der Horcher den aktuellen Text und die offene
     Rückfrage kennen muss; An- und Abmelden kostet nichts. */
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

  /** Zurück in die App: erst das Hauptfenster nach vorn, dann dieses schließen. */
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
