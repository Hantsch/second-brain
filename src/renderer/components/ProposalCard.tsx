/* The filing proposal as a workspace: target, reasoning, confidence — and
   below that exactly the text that gets written, ready to edit.

   The AI proposes, the human confirms (guardrail 2). That's why nothing
   here is hidden: the target is spelled out in words, the reasoning as a
   sentence, the confidence as a number, and if no model was involved, the
   card says so and shows the path to the setting.

   The edit state lives with the screen (`useProposalEdit` in
   `proposal-edit.ts`), so Ctrl+Enter from outside files exactly the version
   visible here.

   If the target reads "Stays in the inbox", nothing gets written — then the
   card carries no text field either.

   The teal always sits on the action that `Ctrl+Enter` triggers. Before,
   the button pointed at "Other target" while the key pointed at "Leave it":
   whoever followed the eye did something different from whoever followed
   the keyboard. */

import { useId } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { FilingAction, FilingProposal, ProposedTodo } from '@shared/types';
import { Button } from '../atoms/Button';
import { Card } from '../atoms/Card';
import { Checkbox } from '../atoms/Checkbox';
import { Icon } from '../atoms/Icon';
import { Kbd } from '../atoms/Kbd';
import { useT } from '../i18n';
import { DueField } from './DueField';
import { LlmMissing } from './LlmMissing';
import type { ProposalEdit } from './proposal-edit';
import { targetLabel } from './TargetPicker';
import type { TargetNames } from './TargetPicker';

/**
 * Where a todo goes if it names its own project — otherwise `null`.
 *
 * The main process files a todo that names a project into that project's
 * file, not at the main target. That's a write to a file the user didn't
 * choose; left invisible, it would violate guardrail 2. So it's shown here.
 */
function todoElsewhere(
  todo: ProposedTodo,
  primary: FilingAction,
  names: TargetNames,
): string | null {
  if (todo.project === null) return null;
  const own = names.projects.find((project) => project.slug === todo.project);
  if (own === undefined || own.path === primary.path) return null;
  return own.title;
}

export interface ProposalCardProps {
  proposal: FilingProposal;
  edit: ProposalEdit;
  onEdit: Dispatch<SetStateAction<ProposalEdit | null>>;
  names: TargetNames;
  /** Is a model routed for filing? `undefined` = still unknown. */
  modelRouted: boolean | undefined;
  busy: boolean;
  onFile: () => void;
  onPickTarget: () => void;
  onKeep: () => void;
  onDiscard: () => void;
  textRef?: RefObject<HTMLTextAreaElement | null>;
}

export function ProposalCard({
  proposal,
  edit,
  onEdit,
  names,
  modelRouted,
  busy,
  onFile,
  onPickTarget,
  onKeep,
  onDiscard,
  textRef,
}: ProposalCardProps) {
  const t = useT();
  const textId = useId();
  const percent = Math.round(proposal.confidence * 100);
  const changed = edit.action.path !== proposal.primary.path;
  /* "Stays in the inbox" writes no file. In that case "File" isn't the
     card's focus point — the action the proposal calls for is "pick a
     different target". The button stays regardless, but secondary and
     named after what it actually does. */
  const stays = edit.action.target === 'inbox';

  const patch = (next: Partial<ProposalEdit>): void =>
    onEdit((current) => (current === null ? current : { ...current, ...next }));

  return (
    <Card padded={false} className="sb-proposal">
      <div className="sb-proposal-head">
        <span className="gs-overline">{t('inbox.proposal.overline')}</span>
        <h3 className="sb-proposal-target">{targetLabel(edit.action, names)}</h3>
        <p className="sb-proposal-reason">
          {changed ? t('inbox.proposal.changed') : proposal.reason}
        </p>
        {edit.action.section !== null && edit.action.section.length > 0 ? (
          <p className="sb-proposal-section">
            {t('inbox.proposal.section')}{' '}
            <span className="sb-mono sb-proposal-heading">{edit.action.section}</span>
          </p>
        ) : null}
        <p className="sb-proposal-confidence">
          <span className="sb-mono sb-proposal-value">
            {t('inbox.proposal.confidence', { percent })}
          </span>
          <span className="sb-meter" aria-hidden="true">
            <span className="sb-meter-fill" style={{ width: `${percent}%` }} />
          </span>
        </p>
      </div>

      {modelRouted === false ? (
        <div className="sb-proposal-note">
          <LlmMissing task="classify-dump" tone="note" />
        </div>
      ) : proposal.heuristic ? (
        <div className="sb-proposal-note">
          <p className="sb-llm-note">
            <Icon name="info" size={14} />
            <span>{t('inbox.proposal.heuristic')}</span>
          </p>
        </div>
      ) : null}

      <div className="sb-proposal-body">
        {stays ? (
          /* No field that promises a write that doesn't happen. */
          <p className="sb-proposal-nothing">{t('inbox.proposal.nothing')}</p>
        ) : (
          <>
            <label className="gs-label" htmlFor={textId}>
              {t('inbox.proposal.exact')}
            </label>
            <textarea
              id={textId}
              ref={textRef}
              className="gs-input sb-proposal-text"
              rows={6}
              value={edit.content}
              onChange={(event) => patch({ content: event.target.value })}
            />
          </>
        )}

        {edit.todos.length > 0 ? (
          <fieldset className="sb-proposal-group">
            <legend className="gs-label">{t('inbox.proposal.todos')}</legend>
            <ul className="sb-todoedit">
              {edit.todos.map((row, position) => {
                const elsewhere = todoElsewhere(row.todo, edit.action, names);
                return (
                  <li key={`${row.todo.text}-${position}`} className="sb-todoedit-row">
                    <Checkbox
                      checked={row.keep}
                      label={row.todo.text}
                      onChange={(event) =>
                        patch({
                          todos: edit.todos.map((other, index) =>
                            index === position ? { ...other, keep: event.target.checked } : other,
                          ),
                        })
                      }
                    />
                    {elsewhere !== null ? (
                      <span className="sb-todoedit-into">
                        {t('inbox.proposal.todoInto', { target: elsewhere })}
                      </span>
                    ) : null}
                    <DueField
                      value={row.todo.due}
                      ariaLabel={t('inbox.proposal.dueOf', { text: row.todo.text })}
                      onChange={(due) =>
                        patch({
                          todos: edit.todos.map((other, index) =>
                            index === position ? { ...other, todo: { ...other.todo, due } } : other,
                          ),
                        })
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : null}

        {edit.waiting.length > 0 ? (
          <fieldset className="sb-proposal-group">
            <legend className="gs-label">{t('inbox.proposal.waiting')}</legend>
            <ul className="sb-todoedit">
              {edit.waiting.map((row, position) => (
                <li key={`${row.entry.who}-${position}`} className="sb-todoedit-row">
                  <Checkbox
                    checked={row.keep}
                    label={`${row.entry.who}: ${row.entry.what}`}
                    onChange={(event) =>
                      patch({
                        waiting: edit.waiting.map((other, index) =>
                          index === position ? { ...other, keep: event.target.checked } : other,
                        ),
                      })
                    }
                  />
                  <span className="sb-mono sb-todoedit-due">
                    {row.entry.due ?? row.entry.since}
                  </span>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null}
      </div>

      {/* Anchored at the bottom edge of the column: the actions of a card
          that's taller than the window must not end up below the edge. */}
      <div className="sb-proposal-actions">
        {stays ? (
          /* "Leave it" writes `status: kept` via `capture:keep` — the only
             path that has an undo. `onFile` (`capture:apply`) would write
             the same field without a marker: a button with no undo. */
          <>
            <Button icon="clock" loading={busy} onClick={onKeep}>
              {t('inbox.action.leave')}
            </Button>
            <Button variant="secondary" icon="folder-open" onClick={onPickTarget}>
              {t('inbox.action.other')}
            </Button>
          </>
        ) : (
          <>
            <Button icon="check" loading={busy} onClick={onFile}>
              {t('inbox.action.file')}
            </Button>
            <Button variant="secondary" icon="folder-open" onClick={onPickTarget}>
              {t('inbox.action.other')}
            </Button>
          </>
        )}
        <Button variant="ghost" icon="trash-2" onClick={onDiscard}>
          {t('inbox.action.discard')}
        </Button>
        <span className="sb-capture-hint sb-proposal-hint">
          <Kbd keys={['Ctrl', 'Enter']} />
          <span>{stays ? t('inbox.action.leaveHint') : t('inbox.action.fileHint')}</span>
        </span>
      </div>
    </Card>
  );
}
