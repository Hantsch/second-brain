/* The composer: the field where a question takes shape.

   Enter asks the question, Shift+Enter makes a line break — and exactly
   that is stated as a hint below, so nobody has to try it out. Ctrl+Enter
   also works, because it submits everywhere in the app.

   `submitKey` swaps the two: where the field is a writing field rather than
   a question field (the journal), Enter has to break the line like it does in
   every editor, and Shift+Enter submits. The hint follows the setting, so
   what is shown is what happens.

   The two filters (module, scope) are subtle chips, not form fields: they
   are an offer, not a requirement. This screen's one teal focus point is
   "ask question"; during the answer it becomes "cancel" — a stream you
   can't stop is a hostage situation.

   The project is not a third chip set but a single chip: it comes from
   where the question was asked (`lib/ask-scope.ts`), and one chip per project
   would drown the composer. What it has to do is state the restriction and
   let it go again in one click.

   The same field also carries the journal's coaching conversation. That's
   why the filters and labels are **selectable**: without `onScope`,
   `onModule` or `onProject` the chip set doesn't exist — a toggle that
   filters nothing there would be a false claim. `extra` accommodates
   whatever else belongs in this footer (in the journal, the coach's stance,
   right next to the submit button). */

import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import type { KnowledgeModule, Project, Scope } from '@shared/types';
import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import { IconButton } from '../atoms/IconButton';
import { Kbd } from '../atoms/Kbd';
import { useT } from '../i18n';

/** Scopes as chips: all, work, private. */
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

/** Labels. If one is missing, the ask screen's default applies. */
export interface ComposerTexts {
  label?: string;
  placeholder?: string;
  /** What `Enter` does — shown in the keyboard hint. */
  hintSend?: string;
  send?: string;
  cancel?: string;
}

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Cancel a running answer. */
  onCancel: () => void;
  /** Is an answer currently running? */
  busy: boolean;
  modules?: readonly KnowledgeModule[];
  /** Module slug to restrict to. */
  module?: string | null;
  /** If the callback is missing, the module chips don't exist. */
  onModule?: (module: string | null) => void;
  scope?: Scope | null;
  /** If the callback is missing, the scope chips don't exist. */
  onScope?: (scope: Scope | null) => void;
  /** Only there to name the project chip: slug in, title out. */
  projects?: readonly Project[];
  /** Project slug to restrict to. `null` renders no chip at all. */
  project?: string | null;
  /** If the callback is missing, the project chip doesn't exist. */
  onProject?: (project: string | null) => void;
  texts?: ComposerTexts;
  /** Which key submits. `'shift-enter'` frees plain Enter for a line break. */
  submitKey?: 'enter' | 'shift-enter';
  /** Additional controls in this footer, before the button. */
  extra?: ReactNode;
  /** What `Esc` in the field does. Without it the field is only left (see below);
      an overlay passes its own close here. */
  onEscape?: () => void;
  /** Field identifier — only needed when two composers sit in the same tree. */
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
  projects = [],
  project = null,
  onProject,
  texts = {},
  submitKey = 'enter',
  extra,
  onEscape,
  fieldId = 'sb-ask-field',
  fieldRef,
}: ChatComposerProps) {
  const t = useT();
  /* The title if the list happens to know it, otherwise the slug — asking must
     not wait on a query just to put a name on a chip. */
  const projectName = projects.find((entry) => entry.slug === project)?.title ?? project;

  const onShift = submitKey === 'shift-enter';

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.altKey) {
      /* Ctrl/Cmd+Enter submits regardless of the setting; otherwise it is
         whichever of Enter / Shift+Enter `submitKey` named. Any other Enter
         falls through to the textarea and breaks the line. */
      if (event.ctrlKey || event.metaKey || event.shiftKey === onShift) {
        event.preventDefault();
        onSubmit();
      }
      return;
    }
    /* Esc used to not leave the field at all — focus stayed in the
       textarea, with no way back except the mouse. Blur is enough: the
       draft stays as it is, only focus moves to the active rail entry,
       from where the digit keys work again. Whoever passes `onEscape` has
       a better answer than the rail (an overlay closes itself); the draft
       is left untouched either way. */
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (onEscape !== undefined) {
        onEscape();
        return;
      }
      const field = event.currentTarget;
      field.blur();
      document.querySelector<HTMLElement>('.sb-rail-item[aria-current="page"]')?.focus();
    }
  };

  return (
    <div className="sb-composer">
      {/* The keyboard hint sits at the top next to the label: at the
          bottom it would take a whole line away from the history in a
          short window. */}
      <div className="sb-composer-head">
        <label className="sb-composer-label" htmlFor={fieldId}>
          {texts.label ?? t('ask.field.label')}
        </label>
        <p className="sb-composer-hint">
          <Kbd>{onShift ? 'Shift+Enter' : 'Enter'}</Kbd>
          <span>{texts.hintSend ?? t('ask.field.hintSend')}</span>
          <Kbd>{onShift ? 'Enter' : 'Shift+Enter'}</Kbd>
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

        {project === null || onProject === undefined ? null : (
          <div className="sb-chips" role="group" aria-label={t('ask.filter.project')}>
            <span className="sb-chips-label">
              <Icon name="folder" size={13} />
              {t('ask.filter.project')}
            </span>
            {/* A statement, not a surface — the chip itself does nothing.
                Removing the filter is the button next to it, a real one with a
                name: an x on its own says nothing out loud. */}
            <span className="sb-chip sb-chip--active sb-chip--static">{projectName}</span>
            <IconButton
              icon="x"
              size="sm"
              label={t('ask.filter.clear')}
              onClick={() => onProject(null)}
            />
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
