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
import type { JournalCloseSuggestion } from '@shared/ipc';

/** Edit state, keyed by the todo's index in `suggestion.proposal.todos` plus
 * the waiting-on entries appended after them — the same order `CloseDialog`
 * builds its rows in. */
export interface CloseProposalEdits {
  keepTodo: Record<number, boolean>;
  dueTodo: Record<number, string | null>;
  keepField: Record<string, boolean>;
  /**
   * The area slugs to write, once touched — `null` as long as the user has
   * neither removed a proposed chip nor added one from the picker, in which
   * case `suggestion.frontmatter.areas` still applies as-is. Areas get their
   * own field here rather than a `keepField` entry: the row is chips plus an
   * add-picker (036, D3), not a single all-or-nothing checkbox like `people`
   * or `projects`.
   */
  areas: string[] | null;
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

/** Replaces the entry for `date` with a fresh suggestion and empty edits. */
export function set(date: string, suggestion: JournalCloseSuggestion): void {
  entries.set(date, {
    suggestion,
    edits: { keepTodo: {}, dueTodo: {}, keepField: {}, areas: null },
  });
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
