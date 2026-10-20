/* The editing state of a filing proposal — the logic behind it, without the
   view.

   It lives separately from the card because the state belongs to the screen:
   Ctrl+Enter comes from outside and must file exactly the version that's
   currently visible. Also because "what goes over the channel" should be
   testable without React. */

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FilingAction, FilingProposal, ProposedTodo, WaitingOn } from '@shared/types';

/** A todo along with whether it should be included. */
export interface TodoEdit {
  todo: ProposedTodo;
  keep: boolean;
}

export interface WaitingEdit {
  entry: WaitingOn;
  keep: boolean;
}

/** What the user changed about the proposal before confirming it. */
export interface ProposalEdit {
  action: FilingAction;
  content: string;
  todos: TodoEdit[];
  waiting: WaitingEdit[];
}

function initialEdit(proposal: FilingProposal): ProposalEdit {
  return {
    action: proposal.primary,
    content: proposal.primary.content,
    todos: proposal.todos.map((todo) => ({ todo, keep: true })),
    waiting: proposal.waitingOn.map((entry) => ({ entry, keep: true })),
  };
}

/** A proposal is the same one as long as the dump and creation time match. */
function editKey(proposal: FilingProposal): string {
  return `${proposal.dumpPath}@${proposal.createdAt}`;
}

/**
 * The editing state of a proposal. When a different proposal comes in, the
 * state starts over — text from the previous dump would be a mistake.
 *
 * The state is derived, not tracked after the fact: if what's remembered
 * doesn't match the proposal, the proposal wins again. That needs no effect
 * correcting things after render — and therefore no frame where the wrong
 * text is showing.
 */
export function useProposalEdit(
  proposal: FilingProposal | undefined,
): [ProposalEdit | null, Dispatch<SetStateAction<ProposalEdit | null>>] {
  const [stored, setStored] = useState<{ key: string; edit: ProposalEdit } | null>(null);
  const key = proposal === undefined ? null : editKey(proposal);
  const edit =
    proposal === undefined
      ? null
      : stored !== null && stored.key === key
        ? stored.edit
        : initialEdit(proposal);

  const setEdit: Dispatch<SetStateAction<ProposalEdit | null>> = (next) => {
    if (key === null) return;
    const value = typeof next === 'function' ? next(edit) : next;
    if (value === null) setStored(null);
    else setStored({ key, edit: value });
  };
  return [edit, setEdit];
}

/** The edited proposal, as it goes out over `capture:apply`. */
export function applied(proposal: FilingProposal, edit: ProposalEdit): FilingProposal {
  return {
    ...proposal,
    primary: { ...edit.action, content: edit.content },
    /* The secondary write operations are derived by the main process from
       `todos` — only it knows what a checkbox line looks like. */
    extras: [],
    todos: edit.todos.filter((row) => row.keep).map((row) => row.todo),
    waitingOn: edit.waiting.filter((row) => row.keep).map((row) => row.entry),
  };
}
