/* Der Tagesabschluss als Vorschlag — dieselbe Machart wie die Karte der Inbox:
 * Ziel, Begründung, abwählbare Todos, Fristen zum Ändern.
 *
 * Er steht in einem Dialog und nicht im Screen, weil er den zweiten Teal-Knopf
 * braucht: der Fokuspunkt des Screens ist das Gespräch. Im Dialog gehört das Teal
 * dem „Übernehmen" — und der Weg heraus ist immer da (Esc, X, Abbrechen).
 *
 * Zwei Zusagen:
 *
 * - **Erst „Übernehmen" schreibt.** Vorher ist alles hier nur Text. Was abgewählt
 *   ist, wird nicht geschrieben — deshalb geht genau die bearbeitete Fassung über
 *   den Kanal, nicht der ursprüngliche Vorschlag.
 * - **Jedes Ziel steht dabei.** Ein Todo, das ein Projekt nennt, landet in dessen
 *   Datei; das ist ein Schreibvorgang in eine Datei, die niemand angeklickt hat, und
 *   unsichtbar wäre er ein Verstoß gegen Guardrail 2.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { JournalCloseSuggestion } from '@shared/ipc';
import type { Project, ProposedTodo, WaitingOn } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Checkbox } from '../../atoms/Checkbox';
import { Dialog } from '../../atoms/Dialog';
import { Icon } from '../../atoms/Icon';
import { DueField } from '../../components/DueField';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';

/** Ein Warte-auf wird als Todo mit `@wait:` notiert — das kennt jeder Editor. */
function asTodo(entry: WaitingOn, scope: ProposedTodo['scope']): ProposedTodo {
  return {
    text: entry.what.trim().length === 0 ? entry.who : entry.what,
    scope,
    due: entry.due ?? null,
    waitingFor: entry.who,
    priority: 0,
    project: null,
  };
}

interface Row {
  todo: ProposedTodo;
  keep: boolean;
  /** Aus einem Warte-auf entstanden — die Karte sagt das. */
  waiting: boolean;
}

function initialRows(suggestion: JournalCloseSuggestion): Row[] {
  return [
    ...suggestion.proposal.todos.map((todo) => ({ todo, keep: true, waiting: false })),
    ...suggestion.proposal.waitingOn.map((entry) => ({
      todo: asTodo(entry, suggestion.proposal.scope),
      keep: true,
      waiting: true,
    })),
  ];
}

export interface CloseDialogProps {
  open: boolean;
  suggestion: JournalCloseSuggestion | null;
  /** Für die Auskunft, in welche Projektdatei ein Todo geht. */
  projects: readonly Project[];
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onApply: (request: {
    todos: ProposedTodo[];
    frontmatter: JournalCloseSuggestion['frontmatter'];
  }) => void;
}

export function CloseDialog({
  open,
  suggestion,
  projects,
  busy,
  error,
  onClose,
  onApply,
}: CloseDialogProps) {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fields, setFields] = useState<Record<string, boolean>>({});

  if (suggestion === null) return null;
  const current = rows ?? initialRows(suggestion);
  const keeps = (key: string): boolean => fields[key] !== false;

  const patch = (at: number, next: Partial<Row>): void => {
    setRows(current.map((row, index) => (index === at ? { ...row, ...next } : row)));
  };

  const targetOf = (todo: ProposedTodo): string => {
    const own =
      todo.project === null ? null : projects.find((entry) => entry.slug === todo.project);
    return own === undefined || own === null
      ? t('journal.close.target.day')
      : t('journal.close.target.project', { title: own.title });
  };

  const frontmatter: JournalCloseSuggestion['frontmatter'] = {
    people: keeps('people') ? suggestion.frontmatter.people : [],
    projects: keeps('projects') ? suggestion.frontmatter.projects : [],
    tags: keeps('tags') ? suggestion.frontmatter.tags : [],
    mood: keeps('mood') ? suggestion.frontmatter.mood : null,
    energy: keeps('energy') ? suggestion.frontmatter.energy : null,
  };
  const chosen = current.filter((row) => row.keep).map((row) => row.todo);
  /* Ein Knopf, der nichts schreibt, sagt es vorher — statt eine Bestätigung für
     einen Schreibvorgang zu behaupten, den es nicht gab. */
  const writes =
    chosen.length > 0 ||
    frontmatter.people.length > 0 ||
    frontmatter.projects.length > 0 ||
    frontmatter.tags.length > 0 ||
    frontmatter.mood !== null ||
    frontmatter.energy !== null;

  /* Eine Überschrift über einer leeren Liste behauptet, es gäbe dort etwas. */
  const hasFields =
    suggestion.frontmatter.people.length > 0 ||
    suggestion.frontmatter.projects.length > 0 ||
    suggestion.frontmatter.tags.length > 0 ||
    suggestion.frontmatter.mood !== null ||
    suggestion.frontmatter.energy !== null;

  const fieldRow = (key: string, label: string, value: string): ReactNode => (
    <li className="sb-todoedit-row">
      <Checkbox
        checked={keeps(key)}
        label={label}
        onChange={(event) => setFields({ ...fields, [key]: event.target.checked })}
      />
      <span className="sb-closefield-value">{value}</span>
    </li>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('journal.close.title')}
      description={t('journal.close.body')}
      size="lg"
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            icon="check"
            loading={busy}
            disabled={!writes}
            onClick={() => onApply({ todos: chosen, frontmatter })}
          >
            {t('journal.close.apply')}
          </Button>
        </>
      }
    >
      <div className="sb-close">
        <p className="sb-proposal-reason">{suggestion.proposal.reason}</p>
        {suggestion.heuristic ? (
          <p className="sb-llm-note">
            <Icon name="info" size={14} />
            <span>{t('journal.close.heuristic')}</span>
          </p>
        ) : null}

        {error === null || error === undefined ? null : (
          <ErrorState error={error} variant="secondary" subject={suggestion.path} scrollIntoView />
        )}

        {current.length === 0 ? null : (
          <fieldset className="sb-proposal-group">
            <legend className="gs-label">{t('journal.close.todos')}</legend>
            <ul className="sb-todoedit">
              {current.map((row, at) => (
                <li key={`${row.todo.text}-${at}`} className="sb-todoedit-row">
                  <Checkbox
                    checked={row.keep}
                    label={row.todo.text}
                    onChange={(event) => patch(at, { keep: event.target.checked })}
                  />
                  <span className="sb-todoedit-into">
                    {row.waiting
                      ? t('journal.close.waitingInto')
                      : t('journal.close.into', { target: targetOf(row.todo) })}
                  </span>
                  <DueField
                    value={row.todo.due}
                    ariaLabel={t('journal.close.dueOf', { text: row.todo.text })}
                    onChange={(due) => patch(at, { todo: { ...row.todo, due } })}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <fieldset className="sb-proposal-group" hidden={!hasFields}>
          <legend className="gs-label">{t('journal.close.fields')}</legend>
          <ul className="sb-todoedit">
            {suggestion.frontmatter.people.length > 0
              ? fieldRow(
                  'people',
                  t('journal.close.people'),
                  suggestion.frontmatter.people.join(', '),
                )
              : null}
            {suggestion.frontmatter.projects.length > 0
              ? fieldRow(
                  'projects',
                  t('journal.close.projects'),
                  suggestion.frontmatter.projects.join(', '),
                )
              : null}
            {suggestion.frontmatter.tags.length > 0
              ? fieldRow('tags', t('journal.close.tags'), suggestion.frontmatter.tags.join(', '))
              : null}
            {suggestion.frontmatter.mood === null
              ? null
              : fieldRow(
                  'mood',
                  t('journal.close.mood', {
                    label: t(`journal.mood.${suggestion.frontmatter.mood}`),
                  }),
                  '',
                )}
            {suggestion.frontmatter.energy === null
              ? null
              : fieldRow(
                  'energy',
                  t('journal.close.energy', {
                    label: t(`journal.energy.${suggestion.frontmatter.energy}`),
                  }),
                  '',
                )}
          </ul>
        </fieldset>

        {writes ? null : <p className="sb-panel-empty">{t('journal.close.nothing')}</p>}
      </div>
    </Dialog>
  );
}
