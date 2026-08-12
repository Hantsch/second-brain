/* Todos, Fristen und Warte-auf aus einem Text ziehen. Gebraucht beim Einordnen
   eines Dumps und beim Tagesabschluss — deshalb nimmt der Prompt nur Text und
   kennt weder Dump noch Tageseintrag.

   Grundsatz wie ueberall: nichts erfinden. Was nicht im Text steht, hat keine
   Frist und keinen Wartenden. */

import type { ChatTurn, DocLanguage } from '@shared/types';
import { clamp, documentLanguageRule, turns } from './shared';

export interface ExtractTasksInput {
  text: string;
  /** Heutiges Datum als YYYY-MM-DD — Grundlage für „morgen", „bis Freitag". */
  today: string;
  /** Projekt-Slugs, die zugeordnet werden dürfen. Alles andere ist erfunden. */
  projects?: readonly { slug: string; title: string }[];
}

/** Erwartete Antwortform. Wird als `schema` mitgeschickt. */
export const EXTRACT_TASKS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['todos', 'waitingOn'],
  properties: {
    todos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: {
          text: {
            type: 'string',
            description: 'Die Aufgabe als Handlung, ohne Vorsilben wie "ich muss".',
          },
          due: { type: ['string', 'null'], description: 'YYYY-MM-DD oder null.' },
          waitingFor: {
            type: ['string', 'null'],
            description: 'Person, auf die die Aufgabe wartet, oder null.',
          },
          priority: {
            type: 'integer',
            minimum: 0,
            maximum: 3,
            description: '0 = keine, 3 = dringend. Nur wenn der Text es sagt.',
          },
          project: {
            type: ['string', 'null'],
            description: 'Projekt-Slug aus der Liste oder null.',
          },
        },
      },
    },
    waitingOn: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['who', 'what'],
        properties: {
          who: { type: 'string', description: 'Auf wen gewartet wird.' },
          what: { type: 'string', description: 'Worauf gewartet wird.' },
          due: {
            type: ['string', 'null'],
            description: 'Bis wann die Antwort da sein muss, YYYY-MM-DD oder null.',
          },
        },
      },
    },
  },
};

export function extractTasksPrompt(input: ExtractTasksInput, docLanguage: DocLanguage): ChatTurn[] {
  const projects = input.projects ?? [];
  return turns(
    [
      'Du ziehst aus einem persönlichen Text die offenen Aufgaben heraus.',
      documentLanguageRule(docLanguage),
      `Heute ist ${input.today}. Rechne relative Fristen („morgen", „bis Freitag", „KW 34") in YYYY-MM-DD um.`,
      'Eine Aufgabe ist etwas, das noch getan werden muss. Berichtetes, Erledigtes und Gefühle sind keine Aufgaben.',
      'Formuliere jede Aufgabe als Handlung, ohne „ich muss" davor, und ohne die Frist im Text zu wiederholen.',
      'waitingOn ist nur für Dinge, die von einer anderen Person kommen müssen.',
      'Setze due und waitingFor nur, wenn der Text sie nennt. Sonst null.',
      projects.length > 0
        ? `Zulässige Projekt-Slugs: ${projects.map((project) => project.slug).join(', ')}. Andere Werte sind nicht erlaubt.`
        : 'Es gibt keine Projekte; project ist immer null.',
      'Findest du nichts, gib leere Listen zurück. Erfinde keine Aufgaben.',
    ],
    [
      projects.length > 0
        ? `Projekte:\n${projects.map((project) => `- ${project.slug}: ${project.title}`).join('\n')}\n`
        : '',
      'Text:',
      clamp(input.text, 6000),
    ],
  );
}
