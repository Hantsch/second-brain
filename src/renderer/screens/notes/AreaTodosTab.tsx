/* The todos tab of an area section (story 038, D5) — the todos block that
   used to sit directly inside `AreaSection`'s body, unchanged: header with
   the open count, the mutation error state, a skeleton, or `TodoList`. */

import type { Area, Todo } from '@shared/types';
import type { UseQueryResult } from '@tanstack/react-query';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { TodoList } from '../../components/TodoList';
import { useT } from '../../i18n';
import type { TodoMutations } from '../../lib/queries/todos';

export interface AreaTodosTabProps {
  area: Area;
  todos: UseQueryResult<Todo[]>;
  todoMutations: TodoMutations;
  /** The first of toggle/update/create's errors, or null — same precedence
      `AreaSection` used to compute inline. */
  failed: unknown;
}

export function AreaTodosTab({ area, todos, todoMutations, failed }: AreaTodosTabProps) {
  const t = useT();

  return (
    <div className="sb-areatodos">
      <div className="sb-areatodos-head">
        <h3 className="sb-areatodos-title">{t('project.todos.title')}</h3>
        {area.openTodoCount === 0 ? null : (
          <span className="sb-panel-meta">{area.openTodoCount}</span>
        )}
      </div>
      {failed === null ? null : (
        <ErrorState error={failed} variant="secondary" subject={area.title} scrollIntoView />
      )}
      {todos.isPending ? (
        <Skeleton lines={2} height={30} />
      ) : (
        <TodoList
          todos={todos.data ?? []}
          emptyText={t('project.todos.empty')}
          busyId={
            todoMutations.toggle.isPending
              ? (todoMutations.toggle.variables ?? null)
              : todoMutations.update.isPending
                ? (todoMutations.update.variables?.id ?? null)
                : null
          }
          createBusy={todoMutations.create.isPending}
          onToggle={(todo) => todoMutations.toggle.mutate(todo.id)}
          onEdit={(todo, values) => todoMutations.update.mutateAsync({ id: todo.id, ...values })}
          onCreate={(text, due, priority) =>
            todoMutations.create.mutateAsync({
              text,
              scope: area.scope,
              area: area.slug,
              due,
              priority,
            })
          }
        />
      )}
    </div>
  );
}
