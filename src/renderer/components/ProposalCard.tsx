/* Der Ablage-Vorschlag als Arbeitsfläche: Ziel, Begründung, Zuversicht — und
   darunter genau der Text, der geschrieben wird, zum Ändern.

   Die KI schlägt vor, der Mensch bestätigt (Guardrail 2). Deshalb ist hier
   nichts versteckt: das Ziel steht in Worten, die Begründung als Satz, die
   Zuversicht als Zahl, und wenn kein Modell beteiligt war, sagt die Karte das
   und zeigt den Weg zur Einstellung.

   Der Bearbeitungsstand liegt beim Screen (`useProposalEdit` in
   `proposal-edit.ts`), damit Ctrl+Enter von außen dieselbe Fassung ablegt, die
   hier zu sehen ist.

   Lautet das Ziel „Bleibt in der Inbox", wird nichts geschrieben — dann trägt
   die Karte auch kein Textfeld.

   Das Teal liegt immer auf der Aktion, die `Ctrl+Enter` ausführt. Vorher zeigte
   der Knopf auf „Anderes Ziel" und die Taste auf „Liegen lassen": wer dem Auge
   folgte, tat etwas anderes als wer der Tastatur folgte. */

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
 * Wohin ein Todo geht, wenn es ein eigenes Projekt nennt — sonst `null`.
 *
 * Der Hauptprozess legt ein Todo, das ein Projekt nennt, in dessen Datei und
 * nicht beim Hauptziel ab. Das ist ein Schreibvorgang in eine Datei, die der
 * Nutzer nicht gewählt hat; unsichtbar wäre er ein Verstoß gegen Guardrail 2.
 * Also steht er hier.
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
  /** Liegt für das Einordnen ein Modell? `undefined` = noch unbekannt. */
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
  /* „Bleibt in der Inbox" schreibt keine Datei. Dann ist „Ablegen" nicht der
     Fokuspunkt der Karte — die Aktion, die der Vorschlag verlangt, ist „anderes
     Ziel wählen". Der Knopf bleibt trotzdem da, aber sekundär und mit dem Namen
     dessen, was er tut. */
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
          /* Kein Feld, das einen Schreibvorgang verspricht, den es nicht gibt. */
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

      {/* Am unteren Rand der Spalte verankert: die Aktionen einer Karte, die
          länger als das Fenster ist, dürfen nicht unter dem Rand liegen. */}
      <div className="sb-proposal-actions">
        {stays ? (
          /* „Liegen lassen" schreibt `status: kept` über `capture:keep` — dem
             einzigen Weg, der einen Rückweg kennt. `onFile` (`capture:apply`)
             würde dasselbe Feld ohne Marke schreiben: ein Knopf ohne Rückgängig. */
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
