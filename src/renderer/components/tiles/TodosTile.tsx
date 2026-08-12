/* Todos, nach Fälligkeit gruppiert und direkt in der Kachel abhakbar.

   Arbeit und Privat sind zwei Kacheln, nicht eine mit Umschalter: die Trennung
   ist eine Anforderung, und ein Umschalter hätte immer eine der beiden Seiten
   versteckt. Dieselbe Datei, weil sie sich nur im Bereich unterscheiden — eine
   Kopie, die sich später auseinanderentwickelt, wäre der schlechtere Weg.

   Abgehakt wird über `todos:toggle`: das schreibt genau eine Zeile in der Datei
   und setzt `@done:`. Solange der Schreibvorgang läuft, ist die Checkbox
   gesperrt — ein Häkchen, das noch nicht in der Datei steht, darf nicht so
   aussehen, als wäre es dort.

   Gezeigt werden höchstens `LIMIT` Zeilen, dringendste Gruppe zuerst; der Rest
   steht als Zahl im Fuß. Eine Kachel, die alle Todos zeigt, wird höher als das
   Fenster — dann liegt jede Kachel darunter unter dem Rand, und das Dashboard
   beantwortet seine Frage erst nach dem Rollen. */

import type { Scope, Todo } from '@shared/types';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { useDashboardData } from '../../lib/queries/dashboard';
import { useTodoMutations } from '../../lib/queries/todos';
import { TileFrame } from '../TileFrame';
import { TodoRow } from '../TodoRow';

/** Die Gruppen, in denen ein Todo landet — in dieser Reihenfolge. */
const GROUPS = ['overdue', 'today', 'week', 'later', 'none'] as const;

/** So viele Zeilen zeigt die Kachel, über alle Gruppen zusammen. */
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
  /* Das Budget wandert von der dringendsten Gruppe nach unten: abgeschnitten
     wird am Ende der Liste, nicht in der Mitte einer Gruppe. */
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
