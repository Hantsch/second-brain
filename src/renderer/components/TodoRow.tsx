/* Ein Todo als Zeile: Checkbox, Text, Frist, Marker.

   Die Checkbox schreibt in die Datei — genau eine Zeile, mit `@done:` beim
   Abhaken. Deshalb steht sie hier gesperrt, solange der Schreibvorgang läuft:
   ein Häkchen, das noch nicht in der Datei ist, darf nicht aussehen, als wäre es
   dort.

   Die Frist ist mit einem Klick änderbar. Das Feld dafür ist dasselbe wie beim
   Einordnen (`DueField`) — Chips für heute und morgen, ein Datumsfeld für alles
   andere. */

import { useState } from 'react';
import type { DragEvent } from 'react';
import { Button } from '../atoms/Button';
import { Checkbox } from '../atoms/Checkbox';
import { Icon } from '../atoms/Icon';
import { IconButton } from '../atoms/IconButton';
import type { Todo } from '@shared/types';
import { useLanguage, useT } from '../i18n';
import { formatDate } from '../lib/format';
import { DeadlineChip } from './DeadlineChip';
import { DueField } from './DueField';
import { PriorityToggle } from './PriorityToggle';

export interface TodoRowProps {
  todo: Todo;
  /** Von der Tastatur gewählt — `x` hakt genau dieses ab. */
  active?: boolean;
  busy?: boolean;
  onToggle: () => void;
  /** Text, deadline and priority can be changed together. */
  onEdit?: (values: {
    text: string;
    due: string | null;
    priority: 1 | 2 | 3;
  }) => void | Promise<unknown>;
  reorderable?: boolean;
  dragging?: boolean;
  dropPosition?: 'before' | 'after' | null;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver?: (event: DragEvent<HTMLLIElement>) => void;
  onDrop?: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd?: () => void;
  /** Projekttitel zeigen — in der Gesamtliste ja, im Projektdetail nicht. */
  showProject?: boolean;
  onFocus?: () => void;
  now?: Date;
}

export function TodoRow({
  todo,
  active = false,
  busy = false,
  onToggle,
  onEdit,
  reorderable = false,
  dragging = false,
  dropPosition = null,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  showProject = false,
  onFocus,
  now,
}: TodoRowProps) {
  const t = useT();
  const language = useLanguage();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(todo.text);
  const [due, setDue] = useState(todo.due);
  const [priority, setPriority] = useState<1 | 2 | 3>(
    todo.priority === 1 || todo.priority === 3 ? todo.priority : 2,
  );
  const done = todo.state === 'done';
  const shownPriority: 1 | 2 | 3 = todo.priority === 1 || todo.priority === 3 ? todo.priority : 2;

  const priorityKey = (value: 1 | 2 | 3): 'low' | 'medium' | 'high' =>
    value === 1 ? 'low' : value === 3 ? 'high' : 'medium';
  const priorityIcon = (value: 1 | 2 | 3): string =>
    value === 1 ? 'chevrons-down' : value === 3 ? 'chevrons-up' : 'minus';
  const priorityLabel = (value: 1 | 2 | 3): string => t(`todo.priority.${priorityKey(value)}`);

  const beginEdit = (): void => {
    setText(todo.text);
    setDue(todo.due);
    setPriority(todo.priority === 1 || todo.priority === 3 ? todo.priority : 2);
    setEditing(true);
  };

  const cancel = (): void => {
    setText(todo.text);
    setDue(todo.due);
    setPriority(todo.priority === 1 || todo.priority === 3 ? todo.priority : 2);
    setEditing(false);
  };

  const save = (): void => {
    const next = text.replace(/\s+/g, ' ').trim();
    if (next.length === 0 || onEdit === undefined) return;
    const running = onEdit({ text: next, due, priority });
    if (running instanceof Promise) {
      void running.then(
        () => setEditing(false),
        () => undefined,
      );
    } else {
      setEditing(false);
    }
  };

  return (
    <li
      className={`sb-todorow${active ? ' sb-todorow--active' : ''}${dragging ? ' sb-todorow--dragging' : ''}${dropPosition === null ? '' : ` sb-todorow--drop-${dropPosition}`}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {reorderable ? (
        <IconButton
          className="sb-todorow-drag"
          icon="grip-vertical"
          variant="ghost"
          size="sm"
          label={t('todo.reorder', { text: todo.text })}
          draggable={!editing && !busy}
          disabled={editing || busy}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ) : null}
      <Checkbox
        className="sb-todorow-box"
        checked={done}
        disabled={busy}
        aria-label={t(done ? 'todo.untoggle' : 'todo.toggle', { text: todo.text })}
        onFocus={onFocus}
        onChange={onToggle}
      />
      <span
        className={`sb-todorow-prio sb-todorow-prio--${priorityKey(shownPriority)}`}
        role="img"
        aria-label={t('todo.priorityMark', { value: priorityLabel(shownPriority) })}
        title={t('todo.priorityMark', { value: priorityLabel(shownPriority) })}
      >
        <Icon name={priorityIcon(shownPriority)} size={15} />
      </span>
      <div className="sb-todorow-main">
        {/* Der Titel trägt den ganzen Satz: in der Kachel ist die Zeile einzeilig
            gekappt, und ein abgeschnittener Satz ohne Weg zum Ganzen wäre eine
            halbe Aussage. */}
        {editing ? (
          <div className="sb-todoedit">
            <input
              className="gs-input"
              aria-label={t('todo.edit.text')}
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  save();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancel();
                }
              }}
            />
            <div className="sb-todoedit-fields">
              <DueField
                value={due}
                ariaLabel={t('todo.dueEdit', { text: todo.text })}
                {...(now === undefined ? {} : { now })}
                onChange={setDue}
              />
              <PriorityToggle
                value={priority}
                ariaLabel={t('todo.priorityEdit', { text: todo.text })}
                disabled={busy}
                onChange={setPriority}
              />
              <Button variant="secondary" size="sm" disabled={busy} onClick={save}>
                {t('common.save')}
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={cancel}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <span
            className={`sb-todorow-text${done ? ' sb-todorow-text--done' : ''}`}
            title={todo.text}
          >
            {todo.text}
          </span>
        )}
        <span className="sb-todorow-meta">
          <DeadlineChip date={todo.due} dueInDays={todo.dueInDays} now={now} />
          {todo.waitingFor === null ? null : (
            <span className="sb-todorow-wait">
              {t('todo.waitingFor', { who: todo.waitingFor })}
            </span>
          )}
          {todo.neededBy === null ? null : (
            <span className="sb-mono">
              {t('todo.neededBy', { date: formatDate(todo.neededBy, language) })}
            </span>
          )}
          {showProject && todo.projectTitle !== null ? (
            <span className="sb-todorow-project">{todo.projectTitle}</span>
          ) : null}
          {done && todo.doneAt !== null ? (
            <span className="sb-mono">
              {t('todo.doneAt', { date: formatDate(todo.doneAt, language) })}
            </span>
          ) : null}
        </span>
      </div>
      {onEdit && !editing ? (
        <IconButton
          icon="pencil"
          variant="ghost"
          size="sm"
          label={t('todo.edit.action', { text: todo.text })}
          onClick={beginEdit}
        />
      ) : null}
    </li>
  );
}
