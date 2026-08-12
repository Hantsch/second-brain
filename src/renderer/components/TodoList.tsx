/* Eine Liste von Todos, optional mit einem Feld zum Anlegen.

   Der Leerzustand erklärt die Inline-Marker: der Nutzer tippt sie auch in
   Obsidian, und eine Liste, die nur „keine Todos" sagt, verschweigt genau das.

   Angelegt wird mit Enter. Die Frist kommt über dieselben Chips wie überall
   sonst (heute, morgen, Datum) — sie ist freiwillig. */

import { useEffect, useRef, useState } from 'react';
import { Button } from '../atoms/Button';
import type { Todo } from '@shared/types';
import { useT } from '../i18n';
import { DueField } from './DueField';
import { TodoRow } from './TodoRow';

export interface TodoListProps {
  todos: readonly Todo[];
  /** Was steht da, wenn nichts da ist. Bereits übersetzt. */
  emptyText: string;
  activeId?: string | null;
  busyId?: string | null;
  showProject?: boolean;
  onToggle: (todo: Todo) => void;
  onDue?: (todo: Todo, day: string | null) => void;
  onFocusTodo?: (todo: Todo) => void;
  /**
   * Neues Todo anlegen. Ohne Handler gibt es kein Feld.
   *
   * Gibt der Aufrufer ein Versprechen zurück (`mutateAsync`), wird das Feld erst
   * geleert, wenn das Todo wirklich in der Datei steht — ein Feld, das sich beim
   * Fehlschlag leert, hätte den Text verschluckt.
   */
  onCreate?: (text: string, due: string | null) => void | Promise<unknown>;
  createBusy?: boolean;
  /** Das Feld beim Rendern öffnen — der Weg der Taste `t`. */
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

  /* Offen ist offen — egal ob der Klick von hier kam oder die Taste `t` von
     außen. Zwei Quellen, ein abgeleiteter Zustand statt eines Effekts. */
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
    /* Der Fehler steht als Karte beim Aufrufer; hier bleibt nur der Text stehen. */
    void running.then(clear, () => undefined);
  };

  return (
    <div className="sb-todolist">
      {todos.length === 0 ? (
        /* Ein leerer Text heißt „hier steht nur das Feld" — kein leerer Kasten. */
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
