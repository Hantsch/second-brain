/* Der Bearbeitungsstand eines Ablage-Vorschlags — die Rechnung dahinter, ohne
   Ansicht.

   Sie liegt getrennt von der Karte, weil der Stand beim Screen wohnt: Ctrl+Enter
   kommt von außen und muss genau die Fassung ablegen, die zu sehen ist. Und weil
   „was geht über den Kanal" ohne React prüfbar sein soll. */

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FilingAction, FilingProposal, ProposedTodo, WaitingOn } from '@shared/types';

/** Ein Todo mit der Frage, ob es mitkommt. */
export interface TodoEdit {
  todo: ProposedTodo;
  keep: boolean;
}

export interface WaitingEdit {
  entry: WaitingOn;
  keep: boolean;
}

/** Was der Nutzer am Vorschlag geändert hat, bevor er ihn bestätigt. */
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

/** Ein Vorschlag ist derselbe, solange Dump und Entstehungszeit dieselben sind. */
function editKey(proposal: FilingProposal): string {
  return `${proposal.dumpPath}@${proposal.createdAt}`;
}

/**
 * Der Bearbeitungsstand eines Vorschlags. Kommt ein anderer Vorschlag herein,
 * beginnt der Stand von vorn — ein Text aus dem vorigen Dump wäre ein Fehler.
 *
 * Der Stand wird abgeleitet, nicht nachgezogen: passt das Gemerkte nicht zum
 * Vorschlag, gilt wieder der Vorschlag. Das braucht keinen Effekt, der nach dem
 * Rendern korrigiert — und damit auch kein Bild, in dem der falsche Text steht.
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

/** Der bearbeitete Vorschlag, wie er über `capture:apply` geht. */
export function applied(proposal: FilingProposal, edit: ProposalEdit): FilingProposal {
  return {
    ...proposal,
    primary: { ...edit.action, content: edit.content },
    /* Die Neben-Schreibvorgänge leitet der Hauptprozess aus `todos` ab — nur er
       weiß, wie eine Checkbox-Zeile aussieht. */
    extras: [],
    todos: edit.todos.filter((row) => row.keep).map((row) => row.todo),
    waitingOn: edit.waiting.filter((row) => row.keep).map((row) => row.entry),
  };
}
