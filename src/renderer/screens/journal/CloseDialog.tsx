/* The day close as a suggestion — the same approach as the inbox card:
 * target, reasoning, deselectable todos, editable due dates.
 *
 * It lives in a dialog rather than the screen because it needs the second
 * teal button: the screen's focal point is the conversation. In the dialog,
 * teal belongs to "apply" — and the way out is always there (Esc, X, cancel).
 *
 * Two guarantees:
 *
 * - **Only "apply" writes.** Before that, everything here is just text.
 *   Whatever is deselected doesn't get written — that's why exactly the
 *   edited version travels over the channel, not the original suggestion.
 * - **Every target is shown.** A todo that names a project ends up in that
 *   project's file; that's a write to a file nobody clicked on, and leaving
 *   it invisible would violate guardrail 2.
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

/** A waiting-on is noted as a todo with `@wait:` — every editor recognizes that. */
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
  /** Arose from a waiting-on — the card says so. */
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
  /** For reporting which project file a todo goes into. */
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
  /* A button that writes nothing says so beforehand — instead of implying a
     confirmation for a write that never happened. */
  const writes =
    chosen.length > 0 ||
    frontmatter.people.length > 0 ||
    frontmatter.projects.length > 0 ||
    frontmatter.tags.length > 0 ||
    frontmatter.mood !== null ||
    frontmatter.energy !== null;

  /* A heading over an empty list implies there's something there. */
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
