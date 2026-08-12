/* Group todos: first by scope, then by due date.

   The user wants to see work and private separated — that's not a sort
   order, it's a separation. Within a scope, the deadline decides: overdue,
   today, this week, later, no deadline. "No deadline" doesn't disappear;
   concealed tasks are the reason this app exists. */

import type { Scope, Todo } from '@shared/types';

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';

export const DUE_BUCKETS: readonly DueBucket[] = ['overdue', 'today', 'week', 'later', 'none'];

/** Up to this point counts as "this week". */
const WEEK_DAYS = 7;

export function bucketOf(todo: Todo): DueBucket {
  if (todo.dueInDays === null) return 'none';
  if (todo.dueInDays < 0) return 'overdue';
  if (todo.dueInDays === 0) return 'today';
  return todo.dueInDays <= WEEK_DAYS ? 'week' : 'later';
}

/** Within a group: deadline first, then priority, then text. */
export function byDue(a: Todo, b: Todo): number {
  if (a.dueInDays !== b.dueInDays) {
    if (a.dueInDays === null) return 1;
    if (b.dueInDays === null) return -1;
    return a.dueInDays - b.dueInDays;
  }
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.text.localeCompare(b.text);
}

export interface DueGroup {
  bucket: DueBucket;
  todos: Todo[];
}

/** Only the groups that contain something — empty headings say nothing. */
export function groupByDue(todos: readonly Todo[]): DueGroup[] {
  const groups = new Map<DueBucket, Todo[]>();
  for (const todo of todos) {
    const bucket = bucketOf(todo);
    groups.set(bucket, [...(groups.get(bucket) ?? []), todo]);
  }
  return DUE_BUCKETS.filter((bucket) => (groups.get(bucket) ?? []).length > 0).map((bucket) => ({
    bucket,
    todos: [...(groups.get(bucket) ?? [])].sort(byDue),
  }));
}

export interface ScopeGroup {
  scope: Scope;
  groups: DueGroup[];
  openCount: number;
  total: number;
}

/**
 * Both scopes, always both — even the empty one. A missing column would look
 * as if the scope didn't exist.
 */
export function groupTodos(todos: readonly Todo[], showDone: boolean): ScopeGroup[] {
  const scopes: readonly Scope[] = ['work', 'private'];
  return scopes.map((scope) => {
    const mine = todos.filter((todo) => todo.scope === scope);
    const shown = showDone ? mine : mine.filter((todo) => todo.state === 'open');
    return {
      scope,
      groups: groupByDue(shown),
      openCount: mine.filter((todo) => todo.state === 'open').length,
      total: mine.length,
    };
  });
}
