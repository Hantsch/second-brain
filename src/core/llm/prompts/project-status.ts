/* Derive a project's status and next step from its history.

   The result is a **suggestion**: the user confirms it, otherwise nothing
   happens (guardrail 2). That's why `reason` is mandatory — a status change
   without a visible reason would be a claim nobody could verify.

   Principle as everywhere: don't invent anything. The next step has to come
   from what was sent along — open todos, waiting-on entries, state, journal
   entries, work traces. If none is there, the model says so instead of
   making one up. */

import type { ChatTurn, DocLanguage, ProjectStatus } from '@shared/types';
import { clamp, documentLanguageRule, turns } from './shared';

/** A mention of the project in a journal entry. */
export interface ProjectStatusMention {
  /** Calendar day of the entry. */
  date: string;
  text: string;
}

/** A work trace from a Claude Code session. */
export interface ProjectStatusTrace {
  at: string;
  /** First user message, or the session summary. */
  text: string;
  branch: string | null;
}

export interface ProjectStatusInput {
  title: string;
  slug: string;
  /** Today's date as YYYY-MM-DD — basis for "since", "overdue". */
  today: string;
  currentStatus: ProjectStatus;
  /** Allowed values. Anything else is invented. */
  statuses: readonly ProjectStatus[];
  deadline: string | null;
  nextStep: string | null;
  /** The re-entry point from the "Stand" section. */
  state: string;
  openTodos: readonly { text: string; due: string | null }[];
  waitingOn: readonly { who: string; what: string; since: string; due?: string }[];
  /** Most recent trace, ISO — file change, session, or journal entry. */
  lastTouch: string | null;
  /** Days since the most recent trace. */
  ageDays: number;
  journal: readonly ProjectStatusMention[];
  sessions: readonly ProjectStatusTrace[];
}

/** Expected response shape. Sent along as `schema`. */
export const PROJECT_STATUS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'nextStep', 'reason'],
  properties: {
    status: {
      type: 'string',
      description: 'Einer der zulässigen Status-Werte.',
    },
    nextStep: {
      type: 'string',
      description: 'Der eine nächste Schritt als Handlung, ein Satz. Leer, wenn keiner belegt ist.',
    },
    reason: {
      type: 'string',
      description: 'Ein Satz, warum dieser Status — mit dem Beleg, auf den er sich stützt.',
    },
  },
};

function todoLines(input: ProjectStatusInput): string {
  if (input.openTodos.length === 0) return 'Offene Todos: keine.';
  const lines = input.openTodos
    .slice(0, 12)
    .map((todo) => `- ${todo.text}${todo.due === null ? '' : ` (fällig ${todo.due})`}`);
  return ['Offene Todos:', ...lines].join('\n');
}

function waitingLines(input: ProjectStatusInput): string {
  if (input.waitingOn.length === 0) return 'Warte auf: nichts.';
  const lines = input.waitingOn
    .slice(0, 8)
    .map(
      (entry) =>
        `- ${entry.who}: ${entry.what} (seit ${entry.since}${entry.due === undefined ? '' : `, bis ${entry.due}`})`,
    );
  return ['Warte auf:', ...lines].join('\n');
}

function journalLines(input: ProjectStatusInput): string {
  if (input.journal.length === 0) return 'Tageseinträge mit Bezug: keine.';
  const lines = input.journal
    .slice(0, 5)
    .map((mention) => `- ${mention.date}: ${clamp(mention.text, 400)}`);
  return ['Tageseinträge mit Bezug:', ...lines].join('\n');
}

function sessionLines(input: ProjectStatusInput): string {
  if (input.sessions.length === 0) return 'Arbeitsspuren aus Claude-Code-Sitzungen: keine.';
  const lines = input.sessions
    .slice(0, 5)
    .map(
      (trace) =>
        `- ${trace.at}${trace.branch === null ? '' : ` (Branch ${trace.branch})`}: ${clamp(trace.text, 300)}`,
    );
  return ['Arbeitsspuren aus Claude-Code-Sitzungen:', ...lines].join('\n');
}

export function projectStatusPrompt(
  input: ProjectStatusInput,
  docLanguage: DocLanguage,
): ChatTurn[] {
  return turns(
    [
      'Du beurteilst den Stand eines persönlichen Projekts und schlägst Status und nächsten Schritt vor.',
      documentLanguageRule(docLanguage),
      `Heute ist ${input.today}.`,
      `Zulässige Status-Werte: ${input.statuses.join(', ')}. Andere Werte sind nicht erlaubt.`,
      'Bedeutung: idea = noch nicht begonnen, active = es geht voran, waiting = blockiert durch eine fremde Antwort, paused = bewusst liegengelassen, done = fertig, dropped = aufgegeben.',
      'Gibt es ein offenes Warte-auf und sonst keine frische Spur, ist der Status waiting.',
      'Setze done nur, wenn der Stand ausdrücklich sagt, dass alles fertig ist. Rate es nicht aus fehlenden Todos.',
      'Der nächste Schritt ist eine Handlung, ein Satz, ohne „ich muss" davor. Nimm ihn aus den offenen Todos, dem Stand oder dem Warte-auf.',
      'Ist kein nächster Schritt belegt, gib für nextStep eine leere Zeichenkette zurück.',
      'reason ist ein Satz und nennt den Beleg (Datum, Todo, Person). Erfinde keinen Beleg.',
    ],
    [
      `Projekt: ${input.title} (${input.slug})`,
      `Aktueller Status: ${input.currentStatus}`,
      input.deadline === null ? 'Frist: keine.' : `Frist: ${input.deadline}`,
      input.nextStep === null
        ? 'Bisheriger nächster Schritt: keiner eingetragen.'
        : `Bisheriger nächster Schritt: ${input.nextStep}`,
      input.lastTouch === null
        ? 'Letzte Spur: unbekannt.'
        : `Letzte Spur: ${input.lastTouch} (vor ${input.ageDays} Tagen)`,
      '',
      'Stand:',
      clamp(input.state.length > 0 ? input.state : '(kein Stand notiert)', 2000),
      '',
      todoLines(input),
      '',
      waitingLines(input),
      '',
      journalLines(input),
      '',
      sessionLines(input),
    ],
  );
}
