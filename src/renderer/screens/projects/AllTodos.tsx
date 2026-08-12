/* All todos, split by scope and then by due date.

   Work and private stand side by side as two modules, not as one stack with
   labels: the separation is the point of this view. Within a scope, the
   deadline decides — overdue first, "no deadline" last, but visible.

   Todos created here have no project: the todo lands in today's journal
   entry. Anyone who wants to attach it to a project does so in the project
   detail — there the assignment is unambiguous instead of guessed. */

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
  /** Focus point of the empty view: this is where a project gets created. */
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
