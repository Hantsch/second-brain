/* What the day-close card shows, and what accepting it writes (075, D1).
 *
 * Pure on purpose: AC9 ("accept writes exactly what the card shows") is only
 * checkable if the rows the card renders and the payload the accept button
 * sends come out of the same derivation. Both live here, next to each other,
 * as functions of `(suggestion, edits)` — never spread through the card's JSX,
 * where a divergence between the two would be invisible until something wrong
 * ended up in the vault.
 *
 * No React, no IPC, no i18n: labels and pickers are the card's business. */

import type {
  JournalCloseSuggestion,
  JournalFrontmatterFields,
  ProposedTodo,
  WaitingOn,
} from '@shared/types';
import type { CloseProposalEdits, TodoRowEdit } from './close-proposal';

export interface CloseRow {
  todo: ProposedTodo;
  keep: boolean;
  /**
   * Where the row came from, and what `at` indexes: `todo` and `waiting` rows
   * are the suggestion's own, corrected through `edits.todoEdits[at]`;
   * `added` rows are `edits.added[at]` themselves.
   */
  kind: 'todo' | 'waiting' | 'added';
  at: number;
}

export interface ClosePayload {
  todos: ProposedTodo[];
  frontmatter: JournalFrontmatterFields;
  /** False when accepting would write nothing at all — a button that writes
   * nothing says so beforehand, instead of implying a confirmation for a
   * write that never happened. */
  writes: boolean;
}

/** A waiting-on is noted as a todo with `@wait:` — every editor recognizes that. */
export function asTodo(entry: WaitingOn, scope: ProposedTodo['scope']): ProposedTodo {
  return {
    text: entry.what.trim().length === 0 ? entry.who : entry.what,
    scope,
    due: entry.due ?? null,
    waitingFor: entry.who,
    priority: 0,
    project: null,
  };
}

/** Applies one row's corrections. An absent field is untouched; `null` on
 * `due`, `project` or `waitingFor` is a chosen value, so none of this may
 * collapse into `??`. */
function corrected(base: ProposedTodo, edit: TodoRowEdit | undefined): ProposedTodo {
  if (edit === undefined) return base;
  return {
    text: edit.text === undefined ? base.text : edit.text,
    scope: edit.scope === undefined ? base.scope : edit.scope,
    due: edit.due === undefined ? base.due : edit.due,
    waitingFor: edit.waitingFor === undefined ? base.waitingFor : edit.waitingFor,
    priority: base.priority,
    project: edit.project === undefined ? base.project : edit.project,
  };
}

/**
 * The card's rows, in render order: the proposed todos, then the waiting-on
 * entries, then what the user added by hand. The first two share one index
 * space — the keys of `edits.todoEdits` — because they are the same list to
 * the user and were proposed together.
 */
export function rowsOf(suggestion: JournalCloseSuggestion, edits: CloseProposalEdits): CloseRow[] {
  const proposed = suggestion.proposal.todos;
  const waiting = suggestion.proposal.waitingOn.map((entry) =>
    asTodo(entry, suggestion.proposal.scope),
  );
  const own = [...proposed, ...waiting]
    .map((todo, at): CloseRow => {
      const edit = edits.todoEdits[at];
      return {
        todo: corrected(todo, edit),
        keep: edit?.keep !== false,
        kind: at >= proposed.length ? 'waiting' : 'todo',
        at,
      };
    })
    /* A proposed/waiting row the user cleared on purpose disappears from the
     * card itself, not only from what accepting writes (075, D3 sprint
     * decision) — `edit.text === undefined` still means "untouched", so a row
     * the model itself proposed with blank text (if that ever happens) stays
     * on the card. An `'added'` row never reaches this filter: it starts
     * blank by construction (see `CloseProposal.tsx`'s add trigger) and is
     * only ever taken off the card through its own remove control. */
    .filter((row) => {
      const edit = edits.todoEdits[row.at];
      return edit?.text === undefined || edit.text.trim().length > 0;
    });
  const added = edits.added.map((todo, at): CloseRow => ({ todo, keep: true, kind: 'added', at }));
  return [...own, ...added];
}

/** The item list to write for a chip field: a corrected list wins outright,
 * otherwise the proposal's own list stands or falls with its keep box. */
function itemsOf(proposed: string[], corrections: string[] | null, keep: boolean): string[] {
  if (corrections !== null) return corrections;
  return keep ? proposed : [];
}

/**
 * Exactly what accepting writes. Fed by the same `rowsOf` the card renders,
 * so a row the user cannot see cannot be written, and a correction the user
 * made cannot be dropped on the way out.
 *
 * A row whose text is blank after trimming is dropped rather than reported:
 * the sprint decided an emptied text is a deletion, not an error. Trimming
 * itself is left to `normalizeCloseTodos` in main (075, D5) — the payload
 * carries the text the card shows.
 */
export function payloadOf(
  suggestion: JournalCloseSuggestion,
  edits: CloseProposalEdits,
): ClosePayload {
  const keeps = (key: string): boolean => edits.keepField[key] !== false;
  const fields = suggestion.frontmatter;
  const frontmatter: JournalFrontmatterFields = {
    people: itemsOf(fields.people, edits.people, keeps('people')),
    projects: itemsOf(fields.projects, edits.projects, keeps('projects')),
    areas: itemsOf(fields.areas, edits.areas, true),
    tags: itemsOf(fields.tags, edits.tags, keeps('tags')),
    mood: keeps('mood') ? (edits.mood ?? fields.mood) : null,
    energy: keeps('energy') ? (edits.energy ?? fields.energy) : null,
  };
  const todos = rowsOf(suggestion, edits)
    .filter((row) => row.keep && row.todo.text.trim().length > 0)
    .map((row) => row.todo);
  const writes =
    todos.length > 0 ||
    frontmatter.people.length > 0 ||
    frontmatter.projects.length > 0 ||
    frontmatter.areas.length > 0 ||
    frontmatter.tags.length > 0 ||
    frontmatter.mood !== null ||
    frontmatter.energy !== null;
  return { todos, frontmatter, writes };
}
