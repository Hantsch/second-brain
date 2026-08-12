/* Todos gruppieren: erst nach Bereich, dann nach Fälligkeit.

   Der Nutzer will Arbeit und Privat getrennt sehen — das ist keine Sortierung,
   sondern eine Trennung. Innerhalb eines Bereichs entscheidet die Frist:
   überfällig, heute, diese Woche, später, ohne Frist. Ohne Frist verschwindet
   nicht; verschwiegene Aufgaben sind der Grund, warum es diese App gibt. */

import type { Scope, Todo } from '@shared/types';

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';

export const DUE_BUCKETS: readonly DueBucket[] = ['overdue', 'today', 'week', 'later', 'none'];

/** Bis hierher zählt „diese Woche". */
const WEEK_DAYS = 7;

export function bucketOf(todo: Todo): DueBucket {
  if (todo.dueInDays === null) return 'none';
  if (todo.dueInDays < 0) return 'overdue';
  if (todo.dueInDays === 0) return 'today';
  return todo.dueInDays <= WEEK_DAYS ? 'week' : 'later';
}

/** Innerhalb einer Gruppe: Frist zuerst, dann Priorität, dann Text. */
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

/** Nur die Gruppen, die etwas enthalten — leere Überschriften sagen nichts. */
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
 * Beide Bereiche, immer beide — auch der leere. Eine fehlende Spalte sähe aus,
 * als gäbe es den Bereich nicht.
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
