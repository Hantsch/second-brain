/* Der nächste Schritt — die eine Zeile, die den Wiedereinstieg trägt.

   Deshalb steht er groß da und ist mit einem Klick editierbar: Enter speichert,
   Esc bricht ab. Beim Verlassen des Feldes wird nur geschlossen, wenn nichts
   getippt wurde — getippter Text verschwindet hier nicht.

   Fehlt der Schritt, sagt die Fläche das und bietet an, einen Vorschlag zu
   holen. Der Vorschlag wird **nie** still eingetragen; er kommt als Karte
   daneben und braucht eine Bestätigung (Guardrail 2).

   **Der Stand, auf dem der Entwurf beruht, wird beim Öffnen eingefroren.**
   Ändert jemand den nächsten Schritt währenddessen von außen, wandert das über
   den Watcher in `value` — und ohne Hinweis überschriebe das Speichern es
   stillschweigend. Geprüft wird der Wert, nicht der Hash der Datei: ein
   abgehaktes Todo im selben Projekt ändert den Hash, aber nicht diese Zeile, und
   ein Konflikt, der nichts mit der Eingabe zu tun hat, wäre nur im Weg. */

import { useEffect, useRef, useState } from 'react';
import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';

export interface NextStepEditorProps {
  value: string | null;
  /** Der Schreibvorgang läuft. */
  busy?: boolean;
  /** Der letzte Stand ist in der Datei angekommen. */
  saved?: boolean;
  onSave: (next: string) => void;
  /** Vorschlag holen. Ohne Handler gibt es den Knopf nicht. */
  onSuggest?: () => void;
  suggestBusy?: boolean;
}

export function NextStepEditor({
  value,
  busy = false,
  saved = false,
  onSave,
  onSuggest,
  suggestBusy = false,
}: NextStepEditorProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  /** Der Wert, auf dem der Entwurf beruht — eingefroren beim Öffnen. */
  const [base, setBase] = useState<string | null>(null);
  /** Fremde Fassung, deren Meldung der Nutzer weggeklickt hat. */
  const [accepted, setAccepted] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  const current = value ?? '';
  const changedOutside = base !== null && current !== base && accepted !== current;

  const start = (): void => {
    setDraft(current);
    setBase(current);
    setAccepted(null);
    setEditing(true);
  };

  const stop = (): void => {
    setEditing(false);
    setBase(null);
    setAccepted(null);
  };

  const commit = (): void => {
    const next = draft.replace(/\s+/g, ' ').trim();
    stop();
    if (next.length === 0 || next === current) return;
    onSave(next);
  };

  if (editing) {
    return (
      <div className="sb-nextstep sb-nextstep--editing">
        {/* Die Overline bleibt stehen und wird zur Beschriftung des Feldes: ein
            Eingabefeld, dessen Aufschrift beim Fokussieren verschwindet, ist ein
            Feld, in das man im Zweifel nicht tippt. */}
        <label className="gs-overline" htmlFor="sb-nextstep-field">
          {t('project.nextStep.title')}
        </label>
        {/* Die fremde Änderung kommt über den Watcher an, nicht erst beim
            Speichern: wer sie kennt, überschreibt sie nicht aus Unwissenheit. */}
        {changedOutside ? (
          <div className="sb-nextstep-external" role="alert">
            <p className="sb-nextstep-external-text">
              {current.length === 0
                ? t('project.nextStep.externalEmpty')
                : t('project.nextStep.external', { value: current })}
            </p>
            {/* Beide Wege geben den Fokus zurück ins Feld: die Leiste
                verschwindet, und ein Fokus, der dabei ins Nichts fällt, macht
                aus Enter eine Taste ohne Wirkung. */}
            <div className="sb-nextstep-external-actions">
              <Button
                variant="secondary"
                size="sm"
                icon="refresh-cw"
                onClick={() => {
                  setDraft(current);
                  setBase(current);
                  setAccepted(null);
                  field.current?.focus();
                }}
              >
                {t('project.nextStep.take')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="pencil"
                onClick={() => {
                  setAccepted(current);
                  field.current?.focus();
                }}
              >
                {t('project.nextStep.keep')}
              </Button>
            </div>
          </div>
        ) : null}
        <input
          id="sb-nextstep-field"
          ref={field}
          className="gs-input sb-nextstep-input"
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              stop();
            }
          }}
          onBlur={() => {
            /* Nur schließen, wenn nichts Neues im Feld steht. */
            if (draft.replace(/\s+/g, ' ').trim() === current) stop();
          }}
        />
        <span className="sb-nextstep-hint">{t('project.nextStep.hint')}</span>
      </div>
    );
  }

  return (
    <div className="sb-nextstep">
      <span className="gs-overline">{t('project.nextStep.title')}</span>
      {value === null || value.length === 0 ? (
        <div className="sb-nextstep-missing">
          <button
            type="button"
            className="sb-nextstep-line sb-nextstep-line--empty"
            onClick={start}
          >
            {t('project.nextStep.empty')}
          </button>
          {onSuggest ? (
            <Button
              variant="secondary"
              size="sm"
              icon="sparkles"
              loading={suggestBusy}
              onClick={onSuggest}
            >
              {t('project.suggest.action')}
            </Button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="sb-nextstep-line"
          aria-label={t('project.nextStep.edit')}
          onClick={start}
        >
          <span>{value}</span>
          <Icon name="pencil" size={14} className="sb-nextstep-pen" />
        </button>
      )}
      <span className="sb-nextstep-saved" role="status">
        {saved ? t('project.nextStep.saved') : ''}
      </span>
    </div>
  );
}
