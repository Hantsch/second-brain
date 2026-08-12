/* Status und nächsten Schritt eines Projekts aus seiner Geschichte ableiten.

   Das Ergebnis ist ein **Vorschlag**: der Nutzer bestätigt ihn, sonst passiert
   nichts (Guardrail 2). Deshalb ist `reason` Pflicht — ein Statuswechsel ohne
   sichtbaren Grund wäre eine Behauptung, die niemand prüfen kann.

   Grundsatz wie überall: nichts erfinden. Der nächste Schritt muss aus dem
   stehen, was mitgeschickt wurde — offene Todos, Warte-auf, Stand, Tageseinträge,
   Arbeitsspuren. Steht dort keiner, sagt das Modell das, statt einen zu dichten. */

import type { ChatTurn, DocLanguage, ProjectStatus } from '@shared/types';
import { clamp, documentLanguageRule, turns } from './shared';

/** Eine Erwähnung des Projekts in einem Tageseintrag. */
export interface ProjectStatusMention {
  /** Kalendertag des Eintrags. */
  date: string;
  text: string;
}

/** Eine Arbeitsspur aus einer Claude-Code-Sitzung. */
export interface ProjectStatusTrace {
  at: string;
  /** Erste Nutzer-Nachricht bzw. Zusammenfassung der Sitzung. */
  text: string;
  branch: string | null;
}

export interface ProjectStatusInput {
  title: string;
  slug: string;
  /** Heutiges Datum als YYYY-MM-DD — Grundlage für „seit", „überfällig". */
  today: string;
  currentStatus: ProjectStatus;
  /** Zulässige Werte. Alles andere ist erfunden. */
  statuses: readonly ProjectStatus[];
  deadline: string | null;
  nextStep: string | null;
  /** Der Wiedereinstiegspunkt aus dem Abschnitt „Stand". */
  state: string;
  openTodos: readonly { text: string; due: string | null }[];
  waitingOn: readonly { who: string; what: string; since: string; due?: string }[];
  /** Jüngste Spur, ISO — Dateiänderung, Sitzung oder Tageseintrag. */
  lastTouch: string | null;
  /** Tage seit der jüngsten Spur. */
  ageDays: number;
  journal: readonly ProjectStatusMention[];
  sessions: readonly ProjectStatusTrace[];
}

/** Erwartete Antwortform. Wird als `schema` mitgeschickt. */
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
