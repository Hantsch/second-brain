/* Erfassen — ein Feld, eine Frage, ein Knopf.

   Der Screen ist der Existenzgrund der App: unter zwei Sekunden von „Gedanke" zu
   „gespeichert". Also liegt der Fokus beim Öffnen im Feld, Ctrl+Enter legt ab,
   und danach ist das Feld leer, fokussiert und bereit für den nächsten Gedanken —
   mehrere Dumps hintereinander gehen ohne einen Mausklick.

   Kein Formular: Scope und Tags sind zwei ruhige Angebote in der Fußzeile, keine
   Pflichtfelder. Wer sie nicht anfasst, verliert nichts — eingeordnet wird
   später, als Vorschlag, den man bestätigt. */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DumpItem, Scope } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import { Kbd } from '../../atoms/Kbd';
import { ErrorState } from '../../components/ErrorState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { useCaptureMutations, useCaptureSettings, useProposal } from '../../lib/queries/capture';
import { useTaskRouted } from '../../lib/queries/llm';

/** Der Scope bleibt offen, solange niemand ihn setzt. */
const SCOPES: readonly (Scope | 'open')[] = ['open', 'work', 'private'];

/** Tags werden mit Komma oder Leerzeichen getrennt. */
function parseTags(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[,\s]+/)
        .map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  ];
}

function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

export function CaptureScreen() {
  const t = useT();
  const navigate = useNavigate();
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [scope, setScope] = useState<Scope | 'open'>('open');
  const [tags, setTags] = useState('');
  const [saved, setSaved] = useState<DumpItem | null>(null);
  const mutations = useCaptureMutations();
  const settings = useCaptureSettings();
  const modelRouted = useTaskRouted('classify-dump');
  /* Dieselbe Abfrage wie in der Inbox (`useProposal`), auf denselben Cache —
     kein zweiter Modellaufruf, nur ein zweiter Zuschauer. Ohne Vorgang (kein
     gespeicherter Dump, oder die Einstellung steht aus) bleibt sie aus: sonst
     stieße „Vorschlag erstellen" ausgerechnet dort an, wo es niemand wollte. */
  const proposal = useProposal(
    saved !== null && settings?.autoClassify === true ? saved.path : null,
  );

  useEffect(() => {
    field.current?.focus();
  }, []);

  const save = (): void => {
    const content = text.trim();
    if (content.length === 0 || mutations.dump.isPending) return;
    mutations.dump.mutate(
      {
        text: content,
        origin: 'window',
        tags: parseTags(tags),
        scope: scope === 'open' ? null : scope,
      },
      {
        onSuccess: (dump) => {
          setText('');
          setSaved(dump);
          /* Der Fokus bleibt, wo er war — der nächste Gedanke braucht keine Maus. */
          field.current?.focus();
        },
      },
    );
  };

  /* Rückgängig heißt hier: die Datei wandert in den Papierkorb und der Gedanke
     steht wieder im Feld — nicht „irgendwo gespeichert, aber weg". */
  const undoSave = (): void => {
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
    <div className="sb-screen">
      <ScreenHeader
        overline={t('screen.capture.overline')}
        title={t('screen.capture.title')}
        action={
          <Button
            variant="secondary"
            icon="external-link"
            onClick={() => void api.capture.window(true).catch(() => undefined)}
          >
            {t('capture.window')}
          </Button>
        }
      />

      <Card padded={false} className="sb-capture">
        <label className="sb-capture-ask" htmlFor="sb-capture-field">
          {t('capture.ask')}
        </label>
        <textarea
          id="sb-capture-field"
          ref={field}
          className="sb-dumpfield"
          placeholder={t('capture.placeholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (saved !== null) setSaved(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              save();
              return;
            }
            /* Esc verließ das Feld vorher nicht — der Fokus blieb stehen, ohne
               einen Weg zurück außer der Maus. Der Entwurf bleibt stehen, nur
               der Fokus wandert zum aktiven Rail-Eintrag. */
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.blur();
              document.querySelector<HTMLElement>('.sb-rail-item[aria-current="page"]')?.focus();
            }
          }}
        />
        <div className="sb-capture-foot">
          <span className="sb-mono sb-capture-count">
            {t('capture.count', { chars: text.length, words: countWords(text) })}
          </span>

          <span className="sb-capture-choice">
            <label className="gs-label" htmlFor="sb-capture-scope">
              {t('capture.scope')}
            </label>
            <span className="gs-inputwrap">
              <select
                id="sb-capture-scope"
                className="gs-input gs-select sb-capture-scope"
                value={scope}
                onChange={(event) => setScope(event.target.value as Scope | 'open')}
              >
                {SCOPES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry === 'open' ? t('capture.scopeOpen') : t(`scope.${entry}`)}
                  </option>
                ))}
              </select>
              <span className="gs-select-chevron">
                <Icon name="chevron-down" size={15} />
              </span>
            </span>
          </span>

          <span className="sb-capture-choice">
            <label className="gs-label" htmlFor="sb-capture-tags">
              {t('capture.tags')}
            </label>
            <input
              id="sb-capture-tags"
              type="text"
              className="gs-input sb-capture-tagfield"
              placeholder={t('capture.tagsPlaceholder')}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </span>

          <span className="sb-capture-save">
            <Button
              icon="zap"
              loading={mutations.dump.isPending}
              disabled={text.trim().length === 0}
              onClick={save}
            >
              {t('capture.save')}
            </Button>
            <span className="sb-capture-hint">
              <Kbd keys={['Ctrl', 'Enter']} />
            </span>
          </span>
        </div>
        <p className="sb-capture-keys">
          <Kbd>Esc</Kbd>
          <span>{t('capture.hintEscape')}</span>
          <Kbd keys={['Ctrl', 'K']} />
          <span>{t('capture.hintPalette')}</span>
        </p>
      </Card>

      {mutations.dump.error ? (
        <ErrorState error={mutations.dump.error} onRetry={save} scrollIntoView />
      ) : null}

      {saved !== null ? (
        <div className="sb-savedbox" role="status">
          <p className="sb-capture-saved">
            <Icon name="circle-check-big" size={16} />
            <span>{t('capture.saved')}</span>
            <span className="sb-mono">{saved.path}</span>
            <button type="button" className="sb-textlink" onClick={undoSave}>
              {t('capture.undo')}
            </button>
            <button type="button" className="sb-textlink" onClick={() => void navigate('/inbox')}>
              {t('capture.toInbox')}
            </button>
          </p>
          {/* Gebunden an den Vorgang, nicht an die Einstellung: „wird erstellt"
              stand vorher unverändert da, ob der Vorschlag längst im Cache lag
              oder noch lief. Bei einem Fehlschlag sagt das der bestehende
              Toast (`toast.classifyFailed`) — hier kommt nichts doppelt. */}
          {settings?.autoClassify === true && proposal.error === null ? (
            <p className="sb-capture-strip">
              <Icon name="sparkles" size={14} />
              <span>
                {proposal.isPending
                  ? t('capture.classifying')
                  : modelRouted === true
                    ? t('capture.classified')
                    : t('inbox.proposal.heuristic')}
              </span>
              {proposal.isPending ? null : (
                <button
                  type="button"
                  className="sb-textlink"
                  onClick={() => void navigate('/inbox')}
                >
                  {t('capture.toProposal')}
                </button>
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
