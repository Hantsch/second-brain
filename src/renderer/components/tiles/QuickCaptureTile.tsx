/* Erfassen, ohne den Screen zu wechseln. Ein Feld, Ctrl+Enter, fertig.

   Nach dem Ablegen steht der Pfad da und daneben „Rückgängig" — der Weg zurück
   holt die Datei aus dem Papierkorb und den Text ins Feld. Keine Aktion ohne
   Rücknahme, auch nicht die kleine auf dem Dashboard. */

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DumpItem } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import { Kbd } from '../../atoms/Kbd';
import { useT } from '../../i18n';
import { useCaptureMutations } from '../../lib/queries/capture';
import { TileFrame } from '../TileFrame';

export function QuickCaptureTile() {
  const t = useT();
  const navigate = useNavigate();
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState<DumpItem | null>(null);
  const mutations = useCaptureMutations();

  const save = (): void => {
    const content = text.trim();
    if (content.length === 0 || mutations.dump.isPending) return;
    mutations.dump.mutate(
      /* `window`: dasselbe Hauptfenster wie der Erfassen-Screen — das
         Schnell-Erfassen-Fenster ist ein eigener Ursprung. */
      { text: content, origin: 'window', tags: [], scope: null },
      {
        onSuccess: (dump) => {
          setText('');
          setSaved(dump);
          field.current?.focus();
        },
      },
    );
  };

  const undo = (): void => {
    if (saved === null) return;
    const dump = saved;
    mutations.discard.mutate(dump.path, {
      onSuccess: () => {
        setText(dump.text);
        setSaved(null);
        field.current?.focus();
      },
    });
  };

  return (
    <TileFrame
      id="quick-capture"
      title={t('module.quick-capture.name')}
      error={mutations.dump.error}
      onRetry={save}
    >
      <div className="sb-tilecapture">
        <label className="gs-label" htmlFor="sb-tile-capture">
          {t('tile.capture.label')}
        </label>
        <textarea
          id="sb-tile-capture"
          ref={field}
          className="sb-tilecapture-field"
          placeholder={t('tile.capture.placeholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (saved !== null) setSaved(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              save();
            }
          }}
        />
        <div className="sb-tilecapture-foot">
          <Button
            size="sm"
            icon="zap"
            loading={mutations.dump.isPending}
            disabled={text.trim().length === 0}
            onClick={save}
          >
            {t('capture.save')}
          </Button>
          <span className="sb-tilecapture-hint">
            <Kbd keys={['Ctrl', 'Enter']} />
            <span>{t('tile.capture.hint')}</span>
          </span>
        </div>
        {saved === null ? null : (
          <p className="sb-tilecapture-saved" role="status">
            <Icon name="circle-check-big" size={14} />
            <span>{t('capture.saved')}</span>
            <button type="button" className="sb-textlink" onClick={undo}>
              {t('capture.undo')}
            </button>
            <button type="button" className="sb-textlink" onClick={() => void navigate('/inbox')}>
              {t('capture.toInbox')}
            </button>
          </p>
        )}
      </div>
    </TileFrame>
  );
}
