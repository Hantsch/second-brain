/* The next step — the one line that carries re-entry into the work.

   That's why it's shown large and editable with a single click: Enter
   saves, Esc cancels. Leaving the field only closes it if nothing was
   typed — typed text never just disappears here.

   If the step is missing, the surface says so and offers to fetch a
   suggestion. The suggestion is **never** entered silently; it arrives as a
   card alongside and needs confirmation (guardrail 2).

   **The state the draft is based on is frozen when the field opens.** If
   someone changes the next step externally in the meantime, that travels
   through the watcher into `value` — and without a notice, saving would
   silently overwrite it. What's checked is the value, not the file's hash: a
   checked-off todo in the same project changes the hash but not this line,
   and a conflict that has nothing to do with this input would just be in
   the way. */

import { useEffect, useRef, useState } from 'react';
import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';

export interface NextStepEditorProps {
  value: string | null;
  /** The write is in progress. */
  busy?: boolean;
  /** The latest state has arrived in the file. */
  saved?: boolean;
  onSave: (next: string) => void;
  /** Fetch a suggestion. Without a handler, there is no button. */
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
  /** The value the draft is based on — frozen when the field opens. */
  const [base, setBase] = useState<string | null>(null);
  /** External version whose notice the user has dismissed. */
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
        {/* The overline stays put and becomes the field's label: an input
            field whose caption disappears on focus is a field people, when
            in doubt, don't type into. */}
        <label className="gs-overline" htmlFor="sb-nextstep-field">
          {t('project.nextStep.title')}
        </label>
        {/* The external change arrives via the watcher, not only at save
            time: whoever knows about it won't overwrite it out of
            ignorance. */}
        {changedOutside ? (
          <div className="sb-nextstep-external" role="alert">
            <p className="sb-nextstep-external-text">
              {current.length === 0
                ? t('project.nextStep.externalEmpty')
                : t('project.nextStep.external', { value: current })}
            </p>
            {/* Both paths give focus back to the field: the bar disappears,
                and a focus that falls into nothing there would turn Enter
                into a key with no effect. */}
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
            /* Only close if there's nothing new in the field. */
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
