/* Ein Todo als Zeile: Checkbox, Text, Frist, Marker.

   Die Checkbox schreibt in die Datei — genau eine Zeile, mit `@done:` beim
   Abhaken. Deshalb steht sie hier gesperrt, solange der Schreibvorgang läuft:
   ein Häkchen, das noch nicht in der Datei ist, darf nicht aussehen, als wäre es
   dort.

   Die Frist ist mit einem Klick änderbar. Das Feld dafür ist dasselbe wie beim
   Einordnen (`DueField`) — Chips für heute und morgen, ein Datumsfeld für alles
   andere. */

import { useState } from 'react';
import { Checkbox } from '../atoms/Checkbox';
import { IconButton } from '../atoms/IconButton';
import type { Todo } from '@shared/types';
import { useLanguage, useT } from '../i18n';
import { formatDate } from '../lib/format';
import { DeadlineChip } from './DeadlineChip';
import { DueField } from './DueField';

export interface TodoRowProps {
  todo: Todo;
  /** Von der Tastatur gewählt — `x` hakt genau dieses ab. */
  active?: boolean;
  busy?: boolean;
  onToggle: () => void;
  /** Frist ändern. Ohne Handler ist die Frist nur Anzeige. */
  onDue?: (day: string | null) => void;
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
  onDue,
  showProject = false,
  onFocus,
  now,
}: TodoRowProps) {
  const t = useT();
  const language = useLanguage();
  const [editing, setEditing] = useState(false);
  const done = todo.state === 'done';

  return (
    <li className={`sb-todorow${active ? ' sb-todorow--active' : ''}`}>
      <Checkbox
        className="sb-todorow-box"
        checked={done}
        disabled={busy}
        aria-label={t(done ? 'todo.untoggle' : 'todo.toggle', { text: todo.text })}
        onFocus={onFocus}
        onChange={onToggle}
      />
      <div className="sb-todorow-main">
        {/* Der Titel trägt den ganzen Satz: in der Kachel ist die Zeile einzeilig
            gekappt, und ein abgeschnittener Satz ohne Weg zum Ganzen wäre eine
            halbe Aussage. */}
        <span
          className={`sb-todorow-text${done ? ' sb-todorow-text--done' : ''}`}
          title={todo.text}
        >
          {todo.text}
        </span>
        <span className="sb-todorow-meta">
          {todo.priority > 0 ? (
            <span
              className="sb-todorow-prio"
              title={t('todo.priorityMark', { value: todo.priority })}
            >
              {'!'.repeat(todo.priority)}
            </span>
          ) : null}
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
        {editing && onDue ? (
          <DueField
            value={todo.due}
            ariaLabel={t('todo.dueEdit', { text: todo.text })}
            {...(now === undefined ? {} : { now })}
            onChange={(day) => {
              setEditing(false);
              onDue(day);
            }}
          />
        ) : null}
      </div>
      {onDue && !editing ? (
        <IconButton
          icon="clock"
          variant="ghost"
          size="sm"
          label={t('todo.dueEdit', { text: todo.text })}
          onClick={() => setEditing(true)}
        />
      ) : null}
    </li>
  );
}
