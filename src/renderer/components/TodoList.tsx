/* A list of todos, optionally with a field for creating one.

   The empty state explains the inline markers: the user also types them in
   Obsidian, and a list that just says "no todos" conceals exactly that.

   Creation happens with Enter. The deadline comes via the same chips as
   everywhere else (today, tomorrow, date) — it's optional. */

import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Button } from '../atoms/Button';
import type { Todo } from '@shared/types';
import { useT } from '../i18n';
import { DragAutoScroller } from '../lib/drag-auto-scroll';
import { DueField } from './DueField';
import { PriorityToggle } from './PriorityToggle';
import { TodoRow } from './TodoRow';

export interface TodoListProps {
  todos: readonly Todo[];
  /** What's shown when there's nothing there. Already translated. */
  emptyText: string;
  activeId?: string | null;
  busyId?: string | null;
  showProject?: boolean;
  onToggle: (todo: Todo) => void;
  onEdit?: (
    todo: Todo,
    values: { text: string; due: string | null; priority: 1 | 2 | 3 },
  ) => void | Promise<unknown>;
  /** Available for project lists, whose file order is meaningful. */
  onReorder?: (ids: string[]) => void;
  onFocusTodo?: (todo: Todo) => void;
  /**
   * Create a new todo. Without a handler, there is no field.
   *
   * If the caller returns a promise (`mutateAsync`), the field is only cleared
   * once the todo actually stands in the file — a field that clears on
   * failure would have swallowed the text.
   */
  onCreate?: (text: string, due: string | null, priority: 1 | 2 | 3) => void | Promise<unknown>;
  createBusy?: boolean;
  /** Open the field on render — the path taken by the `t` key. */
  composerOpen?: boolean;
  onComposerChange?: (open: boolean) => void;
  now?: Date;
}

type DropPosition = 'before' | 'after';

function positionAt(event: DragEvent<HTMLLIElement>): DropPosition {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientY > bounds.top + bounds.height / 2 ? 'after' : 'before';
}

export function TodoList({
  todos,
  emptyText,
  activeId = null,
  busyId = null,
  showProject = false,
  onToggle,
  onEdit,
  onReorder,
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
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: DropPosition;
  } | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const autoScroll = useRef<DragAutoScroller | null>(null);
  if (autoScroll.current === null) autoScroll.current = new DragAutoScroller();

  /* Open is open — regardless of whether the click came from here or the `t`
     key from outside. Two sources, one derived state instead of an effect. */
  const open = local || composerOpen;

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  useEffect(() => () => autoScroll.current?.stop(), []);

  const close = (): void => {
    setLocal(false);
    setText('');
    setDue(null);
    setPriority(2);
    onComposerChange?.(false);
  };

  const submit = (): void => {
    const next = text.replace(/\s+/g, ' ').trim();
    if (next.length === 0 || onCreate === undefined) return;
    const running = onCreate(next, due, priority);
    const clear = (): void => {
      setText('');
      setDue(null);
      setPriority(2);
    };
    if (!(running instanceof Promise)) {
      clear();
      return;
    }
    /* The error is displayed as a card by the caller; here only the text stays. */
    void running.then(clear, () => undefined);
  };

  const composer =
    onCreate === undefined ? null : open ? (
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
          <PriorityToggle
            value={priority}
            ariaLabel={t('todo.new.priority')}
            disabled={createBusy}
            onChange={setPriority}
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
    );

  return (
    <div className="sb-todolist">
      {composer}

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
              {...(onEdit === undefined ? {} : { onEdit: (values) => onEdit(todo, values) })}
              reorderable={onReorder !== undefined}
              dragging={dragging === todo.id}
              dropPosition={dropTarget?.id === todo.id ? dropTarget.position : null}
              onDragStart={(event) => {
                setDragging(todo.id);
                setDropTarget(null);
                autoScroll.current?.start(event.currentTarget);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', todo.id);
              }}
              onDragOver={(event) => {
                autoScroll.current?.update(event.clientY);
                if (dragging === null || dragging === todo.id) {
                  setDropTarget(null);
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const position = positionAt(event);
                setDropTarget((current) =>
                  current?.id === todo.id && current.position === position
                    ? current
                    : { id: todo.id, position },
                );
              }}
              onDrop={(event) => {
                event.preventDefault();
                autoScroll.current?.stop();
                const source = dragging ?? event.dataTransfer.getData('text/plain');
                const from = todos.findIndex((entry) => entry.id === source);
                const target = todos.findIndex((entry) => entry.id === todo.id);
                if (from < 0 || target < 0 || from === target || onReorder === undefined) {
                  setDropTarget(null);
                  return;
                }
                const next = todos.map((entry) => entry.id);
                const [moved] = next.splice(from, 1);
                if (moved === undefined) return;
                const targetAfterRemoval = next.indexOf(todo.id);
                const position = positionAt(event);
                next.splice(targetAfterRemoval + (position === 'after' ? 1 : 0), 0, moved);
                setDragging(null);
                setDropTarget(null);
                if (next.some((id, index) => id !== todos[index]?.id)) onReorder(next);
              }}
              onDragEnd={() => {
                autoScroll.current?.stop();
                setDragging(null);
                setDropTarget(null);
              }}
              {...(onFocusTodo === undefined ? {} : { onFocus: () => onFocusTodo(todo) })}
              {...(now === undefined ? {} : { now })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
