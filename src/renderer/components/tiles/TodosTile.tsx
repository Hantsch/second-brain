/* Todos, grouped by due date and checkable directly in the tile.

   Work and private are two tiles, not one with a toggle: the separation is
   a requirement, and a toggle would always hide one of the two sides. Same
   file, because they differ only in scope — a copy that later drifts apart
   would be the worse path.

   Checking off happens via `todos:toggle`: that writes exactly one line in
   the file and sets `@done:`. While the write is in progress, the checkbox
   is locked — a checkmark that isn't in the file yet must not look as if it
   were.

   At most `LIMIT` lines are shown, most urgent group first; the rest shows
   as a number in the footer. A tile that shows all todos would grow taller
   than the window — then every tile below it would sit past the edge, and
   the dashboard would only answer its question after scrolling. */

import type { Scope, Todo } from '@shared/types';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { useDashboardData } from '../../lib/queries/dashboard';
import { useTodoMutations } from '../../lib/queries/todos';
import { TileFrame } from '../TileFrame';
import { TodoRow } from '../TodoRow';

/** The groups a todo can land in — in this order. */
const GROUPS = ['overdue', 'today', 'week', 'later', 'none'] as const;

/** How many lines the tile shows, across all groups combined. */
const LIMIT = 4;

type GroupId = (typeof GROUPS)[number];

function groupOf(todo: Todo): GroupId {
  if (todo.dueInDays === null) return 'none';
  if (todo.dueInDays < 0) return 'overdue';
  if (todo.dueInDays === 0) return 'today';
  return todo.dueInDays <= 7 ? 'week' : 'later';
}

export interface TodosTileProps {
  scope: Scope;
}

export function TodosTile({ scope }: TodosTileProps) {
  const t = useT();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useDashboardData();
  const mutations = useTodoMutations();

  const todos = (scope === 'work' ? data?.todos.work : data?.todos.private) ?? [];
  /* The budget moves from the most urgent group downward: cutting off
     happens at the end of the list, not in the middle of a group. */
  const grouped: { group: GroupId; rows: Todo[] }[] = [];
  let budget = LIMIT;
  for (const group of GROUPS) {
    const rows = todos.filter((todo) => groupOf(todo) === group).slice(0, budget);
    if (rows.length === 0) continue;
    budget -= rows.length;
    grouped.push({ group, rows });
  }
  const rest = todos.length - (LIMIT - budget);

  return (
    <TileFrame
      id={scope === 'work' ? 'todos-work' : 'todos-private'}
      title={t(scope === 'work' ? 'module.todos-work.name' : 'module.todos-private.name')}
      count={todos.length > 0 ? todos.length : null}
      pending={isPending}
      error={error ?? mutations.toggle.error}
      onRetry={() => void refetch()}
      isEmpty={todos.length === 0}
      empty={{
        body: t(scope === 'work' ? 'tile.todos.emptyWork' : 'tile.todos.emptyPrivate'),
        action: {
          label: t('tile.todos.open'),
          onClick: () => void navigate('/projects?tab=todos'),
        },
      }}
      foot={
        <>
          {rest > 0 ? (
            <span className="sb-tile-rest sb-mono">{t('tile.more', { count: rest })}</span>
          ) : null}
          <button
            type="button"
            className="sb-textlink"
            onClick={() => void navigate('/projects?tab=todos')}
          >
            {t('tile.todos.open')}
          </button>
        </>
      }
    >
      <div className="sb-tiletodos">
        {grouped.map((entry) => (
          <div key={entry.group} className="sb-tiletodos-group">
            <span className="gs-overline">{t(`tile.todos.group.${entry.group}`)}</span>
            <ul className="sb-todolist">
              {entry.rows.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  showProject
                  busy={mutations.toggle.isPending && mutations.toggle.variables === todo.id}
                  onToggle={() => mutations.toggle.mutate(todo.id)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </TileFrame>
  );
}
