/* Alle Todos, getrennt nach Bereich und dann nach Fälligkeit.

   Arbeit und Privat stehen als zwei Module nebeneinander, nicht als ein Stapel
   mit Etiketten: die Trennung ist der Zweck dieser Ansicht. Innerhalb eines
   Bereichs entscheidet die Frist — überfällig zuerst, „ohne Frist" zuletzt,
   aber sichtbar.

   Angelegt wird hier ohne Projekt: das Todo landet im heutigen Tageseintrag.
   Wer es an ein Projekt hängen will, macht das im Projektdetail — dort ist die
   Zuordnung eindeutig, statt geraten. */

import { useState } from 'react';
import type { Todo } from '@shared/types';
import { Checkbox } from '../../atoms/Checkbox';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { Skeleton } from '../../components/Skeleton';
import { TodoList } from '../../components/TodoList';
import { useT } from '../../i18n';
import { useAllTodos, useTodoMutations } from '../../lib/queries/todos';
import { groupTodos } from './grouping';
import { useTodoKeys } from './use-project-keys';

export interface AllTodosProps {
  /** Fokuspunkt der leeren Ansicht: hier wird ein Projekt angelegt. */
  onNewProject: () => void;
  now?: Date;
}

export function AllTodos({ onNewProject, now }: AllTodosProps) {
  const t = useT();
  const todos = useAllTodos();
  const mutations = useTodoMutations();
  const [showDone, setShowDone] = useState(false);
  const [focused, setFocused] = useState<Todo | null>(null);
  const [composeScope, setComposeScope] = useState<'work' | 'private' | null>(null);

  useTodoKeys({
    compose: () => setComposeScope('work'),
    toggle: () => {
      if (focused === null) return;
      mutations.toggle.mutate(focused.id);
    },
  });

  if (todos.error) {
    return <ErrorState error={todos.error} onRetry={() => void todos.refetch()} />;
  }
  if (todos.isPending || todos.data === undefined) {
    return <Skeleton lines={8} height={34} />;
  }
  if (todos.data.length === 0) {
    return (
      <EmptyState
        icon="circle-check-big"
        title={t('todos.empty.title')}
        body={t('todos.empty.body')}
        action={{ label: t('projects.new.title'), icon: 'folder-plus', onClick: onNewProject }}
      />
    );
  }

  const groups = groupTodos(todos.data, showDone);
  const busyId = mutations.toggle.isPending ? (mutations.toggle.variables ?? null) : null;

  return (
    <div className="sb-alltodos">
      <div className="sb-alltodos-head">
        <Checkbox
          label={t('todos.showDone')}
          checked={showDone}
          onChange={(event) => setShowDone(event.target.checked)}
        />
      </div>

      {mutations.toggle.error === null && mutations.create.error === null ? null : (
        <ErrorState
          error={mutations.toggle.error ?? mutations.create.error}
          variant="secondary"
          scrollIntoView
        />
      )}

      <div className="sb-grid-2">
        {groups.map((group) => (
          <Panel
            key={group.scope}
            title={t(`scope.${group.scope}`)}
            meta={t('todos.openOf', { open: group.openCount, total: group.total })}
          >
            {group.groups.length === 0 ? (
              <p className="sb-panel-empty">{t('todos.scopeEmpty')}</p>
            ) : (
              group.groups.map((bucket) => (
                <div key={bucket.bucket} className="sb-todogroup">
                  <p className={`sb-todogroup-title sb-todogroup-title--${bucket.bucket}`}>
                    {t(`todos.group.${bucket.bucket}`)}
                    <span className="sb-mono">{bucket.todos.length}</span>
                  </p>
                  <TodoList
                    todos={bucket.todos}
                    emptyText={t('todos.scopeEmpty')}
                    activeId={focused?.id ?? null}
                    busyId={busyId}
                    showProject
                    onFocusTodo={setFocused}
                    onToggle={(todo) => mutations.toggle.mutate(todo.id)}
                    onDue={(todo, day) => mutations.update.mutate({ id: todo.id, due: day })}
                    {...(now === undefined ? {} : { now })}
                  />
                </div>
              ))
            )}
            <TodoList
              todos={[]}
              emptyText=""
              createBusy={mutations.create.isPending}
              composerOpen={composeScope === group.scope}
              onComposerChange={(open) => setComposeScope(open ? group.scope : null)}
              onToggle={() => undefined}
              onCreate={(text, due) =>
                mutations.create.mutateAsync({ text, scope: group.scope, project: null, due })
              }
              {...(now === undefined ? {} : { now })}
            />
          </Panel>
        ))}
      </div>
    </div>
  );
}
