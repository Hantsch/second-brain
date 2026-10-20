/**
 * Server-side re-validation of the todos a confirmed day close carries.
 *
 * The card is editable (075): text, due date, priority, scope and target may
 * all differ from what the close-out proposed. What arrives at the write path
 * is therefore user input, not our own suggestion — it gets checked here, in
 * one pure place, before a single byte is written.
 *
 * Three decisions worth reading up on:
 *
 * - **A todo is dropped, never rejected.** An empty text or an impossible due
 *   date is not worth failing a whole day close over; the offending value
 *   disappears, the rest of the close stands.
 * - **An unknown project falls back to the day.** A slug that no project
 *   answers to becomes `project: null`, so the corrected todo lands in the
 *   daily entry instead of getting lost between two files.
 * - **Scope becomes a tag only when it deviates.** The file decides a todo's
 *   scope (docs/VAULT-FORMAT.md); a `#work`/`#private` tag is only written
 *   when the day file alone would answer differently — and never for a todo
 *   going into a project file, where the path already fixes the scope and a
 *   contradicting tag would be inert noise.
 *
 * Caveat on that last point: if the day's frontmatter pins `scope:` by hand,
 * it outranks a tag on the line (`scopeHint`'s order), so the tag records the
 * intent for a reader but does not change what the index derives. The app
 * itself never writes that field into a daily entry.
 */

import type { ProposedTodo, Scope } from '@shared/types';
import { asDate } from '@core/index/text';

export interface CloseTodoOptions {
  /** Slugs of the projects that actually exist — anything else is unknown. */
  projectSlugs: ReadonlySet<string>;
  /** What the day file alone says about scope (`scopeFor` in `core/index/todos`). */
  dayScope: Scope;
}

/** Only the two literal values are a scope; anything else is a stale client. */
function asScope(value: unknown): Scope | null {
  if (value === 'work' || value === 'private') return value;
  return null;
}

/** Same bounds as `todoLine`'s own guard: never more than `!!!`, never negative. */
function clampPriority(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(3, Math.max(0, Math.trunc(value)));
}

/** A name, or nothing — `@wait:` without one is a marker no reader parses. */
function asName(value: string | null): string | null {
  if (value === null) return null;
  const name = value.trim();
  return name.length === 0 ? null : name;
}

/**
 * The todos of a day close as they may be written: trimmed, bounded, with a
 * resolvable target and — where it deviates — its scope on the line.
 *
 * Pure: no vault, no index, no clock. The caller supplies the two facts that
 * come from outside (which projects exist, what the day file says).
 */
export function normalizeCloseTodos(
  todos: readonly ProposedTodo[],
  options: CloseTodoOptions,
): ProposedTodo[] {
  const normalized: ProposedTodo[] = [];

  for (const todo of todos) {
    const text = todo.text.trim();
    /* Nothing to write, so nothing to say: a row that is empty after trimming
       is silently left out instead of failing the close. */
    if (text.length === 0) continue;

    const scope = asScope(todo.scope) ?? options.dayScope;
    const project =
      todo.project !== null && options.projectSlugs.has(todo.project) ? todo.project : null;
    const deviates = project === null && scope !== options.dayScope;

    normalized.push({
      text: deviates ? `${text} #${scope}` : text,
      scope,
      due: asDate(todo.due),
      waitingFor: asName(todo.waitingFor),
      priority: clampPriority(todo.priority),
      project,
    });
  }

  return normalized;
}
