/* A list of todos, optionally with a field for creating one.

   The empty state explains the inline markers: the user also types them in
   Obsidian, and a list that just says "no todos" conceals exactly that.

   Creation happens with Enter. The deadline comes via the same chips as
   everywhere else (today, tomorrow, date) — it's optional. */

import { useEffect, useRef, useState } from 'react';
import { Button } from '../atoms/Button';
import type { Todo } from '@shared/types';
import { useT } from '../i18n';
import { DueField } from './DueField';
import { TodoRow } from './TodoRow';

export interface TodoListProps {
  todos: readonly Todo[];
  /** What's shown when there's nothing there. Already translated. */
  emptyText: string;
  activeId?: string | null;
  busyId?: string | null;
  showProject?: boolean;
  onToggle: (todo: Todo) => void;
  onDue?: (todo: Todo, day: string | null) => void;
  onFocusTodo?: (todo: Todo) => void;
  /**
   * Create a new todo. Without a handler, there is no field.
   *
   * If the caller returns a promise (`mutateAsync`), the field is only cleared
   * once the todo actually stands in the file — a field that clears on
   * failure would have swallowed the text.
   */
  onCreate?: (text: string, due: string | null) => void | Promise<unknown>;
  createBusy?: boolean;
  /** Open the field on render — the path taken by the `t` key. */
  composerOpen?: boolean;
  onComposerChange?: (open: boolean) => void;
  now?: Date;
}

export function TodoList({
  todos,
  emptyText,
  activeId = null,
  busyId = null,
  showProject = false,
  onToggle,
  onDue,
  onFocusTodo,
  onCreate,
  createBusy = false,
  composerOpen = false,
  onComposerChange,
  now,
}: TodoListProps) {
  const t = useT();
  const [local, setLocal] = useState(false);
  const [text, setText] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  /* Open is open — regardless of whether the click came from here or the `t`
     key from outside. Two sources, one derived state instead of an effect. */
  const open = local || composerOpen;

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  const close = (): void => {
    setLocal(false);
    setText('');
    setDue(null);
    onComposerChange?.(false);
  };

  const submit = (): void => {
    const next = text.replace(/\s+/g, ' ').trim();
    if (next.length === 0 || onCreate === undefined) return;
    const running = onCreate(next, due);
    const clear = (): void => {
      setText('');
      setDue(null);
    };
    if (!(running instanceof Promise)) {
      clear();
      return;
    }
    /* The error is displayed as a card by the caller; here only the text stays. */
    void running.then(clear, () => undefined);
  };

  return (
    <div className="sb-todolist">
      {todos.length === 0 ? (
        /* An empty text means "only the field belongs here" — not an empty box. */
        emptyText.length === 0 ? null : (
          <p className="sb-panel-empty">{emptyText}</p>
        )
      ) : (
        <ul className="sb-todos">
          {todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              active={todo.id === activeId}
              busy={todo.id === busyId}
              showProject={showProject}
              onToggle={() => onToggle(todo)}
              {...(onDue === undefined ? {} : { onDue: (day) => onDue(todo, day) })}
              {...(onFocusTodo === undefined ? {} : { onFocus: () => onFocusTodo(todo) })}
              {...(now === undefined ? {} : { now })}
            />
          ))}
        </ul>
      )}

      {onCreate === undefined ? null : open ? (
        <div className="sb-todocompose">
          <input
            ref={field}
            className="gs-input"
            aria-label={t('todo.new.field')}
            placeholder={t('todo.new.placeholder')}
            value={text}
            disabled={createBusy}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
            }}
          />
          <div className="sb-todocompose-foot">
            <DueField
              value={due}
              ariaLabel={t('todo.new.due')}
              {...(now === undefined ? {} : { now })}
              onChange={setDue}
            />
            <span className="sb-todocompose-hint">{t('todo.new.hint')}</span>
            <Button variant="secondary" size="sm" loading={createBusy} onClick={submit}>
              {t('todo.new.submit')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          icon="plus"
          onClick={() => {
            setLocal(true);
            onComposerChange?.(true);
          }}
        >
          {t('todo.new.action')}
        </Button>
      )}
    </div>
  );
}
