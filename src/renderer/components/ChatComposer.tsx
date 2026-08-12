/* Der Composer: das Feld, in dem eine Frage entsteht.

   Enter stellt die Frage, Shift+Enter macht einen Umbruch — und genau das steht
   als Hinweis darunter, damit niemand es ausprobieren muss. Ctrl+Enter geht
   ebenfalls, weil es in der ganzen App abschickt.

   Die zwei Filter (Modul, Bereich) sind dezente Chips, keine Formularfelder: sie
   sind ein Angebot, nicht eine Pflicht. Der eine Teal-Fokuspunkt des Screens ist
   „Frage stellen"; während der Antwort wird daraus „Abbrechen" — ein Stream, den
   man nicht anhalten kann, ist eine Geiselnahme.

   Dasselbe Feld trägt das Coaching-Gespräch des Tagebuchs. Deshalb sind die Filter
   und die Beschriftungen **auswählbar**: ohne `onScope` bzw. `onModule` gibt es den
   Chip-Satz nicht — ein Schalter, der dort nichts filtert, wäre eine Behauptung.
   `extra` nimmt auf, was in dieser Fußzeile sonst noch hingehört (im Tagebuch die
   Haltung des Coachs, direkt neben dem Knopf, der abschickt). */

import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import type { KnowledgeModule, Scope } from '@shared/types';
import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import { Kbd } from '../atoms/Kbd';
import { useT } from '../i18n';

/** Bereiche als Chips: alles, Arbeit, Privat. */
const SCOPES: readonly (Scope | 'all')[] = ['all', 'work', 'private'];

interface ChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

function Chip({ active, label, onClick }: ChipProps) {
  return (
    <button
      type="button"
      className={`sb-chip ${active ? 'sb-chip--active' : ''}`.trim()}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Beschriftungen. Fehlt eine, gilt die des Fragen-Screens. */
export interface ComposerTexts {
  label?: string;
  placeholder?: string;
  /** Was `Enter` tut — steht im Tastaturhinweis. */
  hintSend?: string;
  send?: string;
  cancel?: string;
}

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Laufende Antwort abbrechen. */
  onCancel: () => void;
  /** Läuft gerade eine Antwort? */
  busy: boolean;
  modules?: readonly KnowledgeModule[];
  /** Modul-Slug, auf den eingeschränkt wird. */
  module?: string | null;
  /** Fehlt der Rückruf, gibt es die Modul-Chips nicht. */
  onModule?: (module: string | null) => void;
  scope?: Scope | null;
  /** Fehlt der Rückruf, gibt es die Bereich-Chips nicht. */
  onScope?: (scope: Scope | null) => void;
  texts?: ComposerTexts;
  /** Weitere Bedienelemente in der Fußzeile, vor dem Knopf. */
  extra?: ReactNode;
  /** Kennung des Feldes — nur nötig, wenn zwei Composer im selben Baum stehen. */
  fieldId?: string;
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  busy,
  modules = [],
  module = null,
  onModule,
  scope = null,
  onScope,
  texts = {},
  extra,
  fieldId = 'sb-ask-field',
  fieldRef,
}: ChatComposerProps) {
  const t = useT();

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
      return;
    }
    /* Esc verließ das Feld vorher gar nicht — der Fokus blieb in der
       Textarea stehen, ohne einen Weg zurück außer der Maus. Blur reicht:
       der Entwurf bleibt stehen, nur der Fokus wandert zum aktiven
       Rail-Eintrag, von dem aus die Ziffern-Tasten wieder greifen. */
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      const field = event.currentTarget;
      field.blur();
      document.querySelector<HTMLElement>('.sb-rail-item[aria-current="page"]')?.focus();
    }
  };

  return (
    <div className="sb-composer">
      {/* Der Tastaturhinweis steht oben neben der Beschriftung: unten würde er in
          einem flachen Fenster eine ganze Zeile vom Verlauf wegnehmen. */}
      <div className="sb-composer-head">
        <label className="sb-composer-label" htmlFor={fieldId}>
          {texts.label ?? t('ask.field.label')}
        </label>
        <p className="sb-composer-hint">
          <Kbd>Enter</Kbd>
          <span>{texts.hintSend ?? t('ask.field.hintSend')}</span>
          <Kbd>Shift+Enter</Kbd>
          <span>{t('ask.field.hintBreak')}</span>
          <Kbd>Esc</Kbd>
          <span>{t('ask.field.hintEscape')}</span>
        </p>
      </div>
      <textarea
        id={fieldId}
        ref={fieldRef}
        className="sb-composer-field"
        rows={2}
        placeholder={texts.placeholder ?? t('ask.field.placeholder')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />

      <div className="sb-composer-foot">
        {onScope === undefined ? null : (
          <div className="sb-chips" role="group" aria-label={t('ask.filter.scope')}>
            <span className="sb-chips-label">
              <Icon name="funnel" size={13} />
              {t('ask.filter.scope')}
            </span>
            {SCOPES.map((entry) => (
              <Chip
                key={entry}
                active={entry === 'all' ? scope === null : scope === entry}
                label={entry === 'all' ? t('ask.filter.all') : t(`scope.${entry}`)}
                onClick={() => onScope(entry === 'all' ? null : entry)}
              />
            ))}
          </div>
        )}

        {modules.length === 0 || onModule === undefined ? null : (
          <div className="sb-chips" role="group" aria-label={t('ask.filter.module')}>
            <span className="sb-chips-label">
              <Icon name="layers" size={13} />
              {t('ask.filter.module')}
            </span>
            <Chip
              active={module === null}
              label={t('ask.filter.all')}
              onClick={() => onModule(null)}
            />
            {modules.map((entry) => (
              <Chip
                key={entry.slug}
                active={module === entry.slug}
                label={entry.title}
                onClick={() => onModule(module === entry.slug ? null : entry.slug)}
              />
            ))}
          </div>
        )}

        {extra}

        <div className="sb-composer-action">
          {busy ? (
            <Button variant="secondary" icon="square" onClick={onCancel}>
              {texts.cancel ?? t('ask.action.cancel')}
            </Button>
          ) : (
            <Button icon="send-horizontal" disabled={value.trim().length === 0} onClick={onSubmit}>
              {texts.send ?? t('ask.action.send')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
