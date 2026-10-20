/* One editable row of the day-close card (075, D2) — text, target, scope,
 * due date, and (for a waiting-on row) the person, all inline.
 *
 * Inline, not a row-opens-editor pattern (075, sprint decision): the row's
 * own controls are always visible, mirroring the areas chips-plus-picker
 * block in `CloseProposal.tsx` rather than the dialog pattern story 018
 * deliberately left behind.
 *
 * The checkbox used to carry the row's text as its visible `label` (018);
 * now the text lives in its own `Input`, so the checkbox keeps only an
 * `aria-label` — still exactly the row's text, so every existing
 * `getByLabelText`/Playwright `getByRole('checkbox', { name: ... })` lookup
 * for a todo by its text keeps working unchanged. */

import type { Project, ProposedTodo, Scope } from '@shared/types';
import { Checkbox } from '../../atoms/Checkbox';
import { IconButton } from '../../atoms/IconButton';
import { Input } from '../../atoms/Input';
import { Select } from '../../atoms/Select';
import { DueField } from '../../components/DueField';
import { useT } from '../../i18n';
import type { TodoRowEdit } from '../../lib/close-proposal';
import type { CloseRow } from '../../lib/close-proposal-view';

export interface CloseTodoRowProps {
  row: CloseRow;
  /** For the target picker's project options and for resolving a
   * project-targeted row's own (disabled) scope. */
  projects: readonly Project[];
  onEdit: (at: number, next: TodoRowEdit) => void;
  /** Only a hand-added row (075, D3) is removable this way — a proposed or
   * waiting row's only removal mechanism stays its keep/drop checkbox. */
  onRemove?: () => void;
}

export function CloseTodoRow({ row, projects, onEdit, onRemove }: CloseTodoRowProps) {
  const t = useT();
  const { todo, keep, kind, at } = row;
  const isWaiting = kind === 'waiting';

  /* A row targeting a project takes its scope from the project's own path
   * (`projects/<scope>/<slug>`) — the sprint decision that a contradicting
   * `#work`/`#private` tag on that row would be inert noise in the project
   * file. The scope control shows that value and is disabled; only a row
   * that still targets the day (or a waiting row, which can never be
   * retargeted) leaves scope editable. */
  const targetedProject: Project | null =
    todo.project === null
      ? null
      : (projects.find((project) => project.slug === todo.project) ?? null);
  const scopeLocked = targetedProject !== null;
  const scopeValue: Scope = scopeLocked ? (targetedProject as Project).scope : todo.scope;

  const targetOf = (todo: ProposedTodo): string => {
    const own =
      todo.project === null ? null : projects.find((project) => project.slug === todo.project);
    return own === undefined || own === null
      ? t('journal.close.target.day')
      : t('journal.close.target.project', { title: own.title });
  };

  return (
    <li className="sb-todoedit-row sb-closetodo-row">
      {kind === 'added' ? null : (
        <Checkbox
          checked={keep}
          aria-label={todo.text}
          onChange={(event) => onEdit(at, { keep: event.target.checked })}
        />
      )}
      <Input
        className="sb-closetodo-text"
        aria-label={t('journal.close.textLabel')}
        value={todo.text}
        onChange={(event) => onEdit(at, { text: event.target.value })}
      />
      <span className="sb-todoedit-into">
        {isWaiting
          ? t('journal.close.waitingInto')
          : t('journal.close.into', { target: targetOf(todo) })}
      </span>
      {isWaiting ? null : (
        <Select
          className="sb-closetodo-target"
          aria-label={t('journal.close.targetLabel')}
          value={todo.project ?? ''}
          options={[
            { value: '', label: t('journal.close.target.day') },
            ...projects.map((project) => ({ value: project.slug, label: project.title })),
          ]}
          onChange={(event) =>
            onEdit(at, { project: event.target.value === '' ? null : event.target.value })
          }
        />
      )}
      <Select
        className="sb-closetodo-scope"
        aria-label={t('journal.close.scopeLabel')}
        value={scopeValue}
        disabled={scopeLocked}
        options={[
          { value: 'work', label: t('scope.work') },
          { value: 'private', label: t('scope.private') },
        ]}
        onChange={(event) => onEdit(at, { scope: event.target.value as Scope })}
      />
      {isWaiting ? (
        <Input
          className="sb-closetodo-person"
          aria-label={t('journal.close.waitingPersonLabel')}
          value={todo.waitingFor ?? ''}
          onChange={(event) =>
            onEdit(at, { waitingFor: event.target.value.length === 0 ? null : event.target.value })
          }
        />
      ) : null}
      <DueField
        value={todo.due}
        ariaLabel={t('journal.close.dueOf', { text: todo.text })}
        onChange={(due) => onEdit(at, { due })}
      />
      {onRemove ? (
        <IconButton icon="x" size="sm" label={t('journal.close.removeAdded')} onClick={onRemove} />
      ) : null}
    </li>
  );
}
