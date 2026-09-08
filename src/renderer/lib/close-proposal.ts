/* Session-scoped store for the open day-close proposal (018).
 *
 * The close run's result and the user's edits (which todos are kept, edited
 * due dates, which frontmatter fields are kept) move out of component state
 * into a module-level store keyed by date — the same idiom `journal-filter.ts`
 * uses (`useSyncExternalStore`, survives a component unmount/remount within
 * the running session, resets on app restart, never touches the vault).
 *
 * A new `set` for a date replaces the whole entry, edits included — running
 * close again is a fresh proposal, not a merge with what was ticked before. */

import { useSyncExternalStore } from 'react';
import type { FilingAction, JournalCloseSuggestion, ProposedTodo } from '@shared/types';

/**
 * One row's corrections (075). Every field is optional and `undefined` means
 * "untouched — the proposed value still applies"; `null` on `due`, `project`
 * or `waitingFor` is a real, chosen value ("no due date", "into the day",
 * "nobody"), which is why they are resolved with an explicit `!== undefined`
 * and never with `??`.
 */
export interface TodoRowEdit {
  keep?: boolean;
  text?: string;
  due?: string | null;
  /** Project slug the row goes into; `null` is the day file itself. */
  project?: string | null;
  scope?: ProposedTodo['scope'];
  waitingFor?: string | null;
}

/** Edit state. `todoEdits` is keyed by the row's index in
 * `suggestion.proposal.todos` plus the waiting-on entries appended after them —
 * the same order `close-proposal-view.ts#rowsOf` builds its rows in. */
export interface CloseProposalEdits {
  todoEdits: Record<number, TodoRowEdit>;
  /** Todos the model missed, added by hand (075, D3). Always kept — an added
   * row is removed from this list, not unchecked. */
  added: ProposedTodo[];
  /** Keep/drop per frontmatter field. Since 075 only `mood` and `energy` still
   * use it: the list fields below carry their own corrected item list. */
  keepField: Record<string, boolean>;
  /**
   * The items to write, once touched — `null` as long as the user has neither
   * removed a proposed chip nor added one, in which case
   * `suggestion.frontmatter.<field>` still applies as-is. These get their own
   * field rather than a `keepField` entry: the row is chips plus (for areas
   * and projects) an add-picker, not a single all-or-nothing checkbox, because
   * a proposal here is rarely all-or-nothing (036, D3 for areas; 075, D4 for
   * the rest).
   */
  areas: string[] | null;
  people: string[] | null;
  projects: string[] | null;
  tags: string[] | null;
  /**
   * A corrected mood/energy, or `null` while the proposed value still applies.
   * Dropping the value altogether is *not* expressed here but by unticking
   * `keepField.mood` / `keepField.energy`, which stays the card's keep/drop
   * control (075, D4 — picking a value there re-ticks the box).
   */
  mood: number | null;
  energy: number | null;
}

/** The edit state a fresh proposal starts from: nothing corrected anywhere. */
export function noEdits(): CloseProposalEdits {
  return {
    todoEdits: {},
    added: [],
    keepField: {},
    areas: null,
    people: null,
    projects: null,
    tags: null,
    mood: null,
    energy: null,
  };
}

export interface CloseProposalEntry {
  suggestion: JournalCloseSuggestion;
  edits: CloseProposalEdits;
}

const entries = new Map<string, CloseProposalEntry>();
const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) notify();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

/**
 * A suggestion for a day whose file exists but has no (or blank) text —
 * `journal:close` returns `null` for exactly that case, since there is
 * nothing to run extraction on. Without this, the "close the day" trigger
 * would silently do nothing once the manual header switch is gone (049,
 * D1/D2), a dead end. `emptySuggestion` fills the same panel `set` would
 * with a real find: every list empty, no frontmatter change, `heuristic:
 * false` (nothing was even attempted), and `reason` stating that honestly —
 * `CloseProposal.tsx` renders it exactly like a real result, "apply" still
 * closes the day via `journal:applyClose` with an empty payload. */
export function emptySuggestion(
  date: string,
  path: string,
  reason: string,
): JournalCloseSuggestion {
  const primary: FilingAction = { target: 'journal', path, section: null, content: '' };
  return {
    date,
    path,
    proposal: {
      dumpPath: path,
      title: date,
      scope: 'private',
      tags: [],
      primary,
      extras: [],
      alternatives: [],
      confidence: 0,
      reason,
      todos: [],
      waitingOn: [],
      entities: [],
      heuristic: false,
      createdAt: new Date().toISOString(),
    },
    frontmatter: { people: [], projects: [], areas: [], mood: null, energy: null, tags: [] },
    heuristic: false,
  };
}

/** Replaces the entry for `date` with a fresh suggestion and empty edits. */
export function set(date: string, suggestion: JournalCloseSuggestion): void {
  entries.set(date, { suggestion, edits: noEdits() });
  emit();
}

/** Merges `partial` into the edit state of an existing entry for `date`.
 * Does nothing if there is no entry — there is nothing to edit yet. */
export function patch(date: string, partial: Partial<CloseProposalEdits>): void {
  const current = entries.get(date);
  if (current === undefined) return;
  entries.set(date, { suggestion: current.suggestion, edits: { ...current.edits, ...partial } });
  emit();
}

/** Empties the entry for `date` — a discard, nothing written. */
export function clear(date: string): void {
  if (!entries.has(date)) return;
  entries.delete(date);
  emit();
}

/** Reads the current entry for `date`, live. `undefined` if none exists. */
export function useCloseProposal(date: string): CloseProposalEntry | undefined {
  const getSnapshot = (): CloseProposalEntry | undefined => entries.get(date);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
