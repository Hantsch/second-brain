/* Loose ends the heuristic cannot see: an announcement in journal prose whose
   day has passed with nothing said about it since. `findLooseEnds()`
   (`core/journal/loose-ends.ts`) resolves German relative phrasing and written
   dates; English phrasing ("tomorrow", "next week") and anything worded around
   a date is what this pass is for.

   The model sees **only** journal days that are already over, and of those only
   the user's own entry blocks — never an answer the app itself wrote, never a
   project, wiki or source file. That is the smallest input the question can be
   answered from at all, and journal prose is the most sensitive content in the
   vault (guardrail 6; the task `journal-loose-ends` is `sensitive`, so 019b's
   local-model recommendation applies by itself).

   Everything it returns is checked afterwards against the files
   (`core/journal/loose-ends-llm.ts`): the day has to be one of the days below,
   the sentence has to stand verbatim in that day's own prose, the referenced
   date has to lie between that day and today, and the subject may only use
   words from the quoted sentence. Whatever fails one of those is dropped, not
   shown — a loose end without the user's own sentence would be a claim, not a
   finding (guardrail 3).

   No language rule in this prompt, deliberately: nothing in the answer is the
   model's own prose. The quote is the user's sentence character for character,
   the subject is words out of that same sentence, and both dates are ISO days.
   There is no language left to instruct. */

import type { ChatTurn } from '@shared/types';
import { clamp, turns } from './shared';

/** One day the model may judge: its date and the user's own prose. */
export interface LooseEndDayInput {
  /** ISO day — the answer must name one of these, verbatim. */
  date: string;
  /** The user's own entry text of that day, verbatim. */
  text: string;
}

/** A loose end the heuristic already found — not to be reported a second time. */
export interface KnownLooseEndInput {
  day: string;
  quote: string;
}

export interface JournalLooseEndsInput {
  today: string;
  days: readonly LooseEndDayInput[];
  known: readonly KnownLooseEndInput[];
  /** Wording of todos that carry a deadline: those are tracked elsewhere (AC 8). */
  tracked: readonly string[];
}

/** Maximum length of one day's prose in the prompt. */
export const MAX_LOOSE_END_DAY_CHARS = 900;

/** Maximum number of proposals. More than this is a list nobody works through. */
export const MAX_LOOSE_END_PROPOSALS = 8;

/** A subject is a handle, not a summary — same limit as the heuristic's. */
export const MAX_LOOSE_END_SUBJECT_WORDS = 6;

export const JOURNAL_LOOSE_ENDS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['looseEnds'],
  properties: {
    looseEnds: {
      type: 'array',
      description: 'Angekündigte Dinge, deren Tag vorbei ist und zu denen nichts mehr kam.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['day', 'quote', 'subject', 'refDate'],
        properties: {
          day: {
            type: 'string',
            description: 'Datum des Tages, in dem der Satz steht (JJJJ-MM-TT), wortwörtlich.',
          },
          quote: {
            type: 'string',
            description: 'Der ankündigende Satz, Zeichen für Zeichen aus diesem Tag.',
          },
          subject: {
            type: 'string',
            description: 'Worum es geht — nur Wörter aus dem zitierten Satz.',
          },
          refDate: {
            type: 'string',
            description: 'Der angekündigte Tag (JJJJ-MM-TT): nach `day`, vor heute.',
          },
        },
      },
    },
  },
};

function dayLines(input: JournalLooseEndsInput): string {
  if (input.days.length === 0) return '(keine Tage)';
  return input.days
    .map((day) =>
      [`--- Tag ---`, `datum: ${day.date}`, clamp(day.text, MAX_LOOSE_END_DAY_CHARS)].join('\n'),
    )
    .join('\n\n');
}

function knownLines(input: JournalLooseEndsInput): string {
  if (input.known.length === 0) return 'Schon bekannt: nichts.';
  const lines = input.known.map((entry) => `- ${entry.day}: ${entry.quote}`);
  return ['Schon bekannt (nicht noch einmal melden):', ...lines].join('\n');
}

function trackedLines(input: JournalLooseEndsInput): string {
  if (input.tracked.length === 0) return 'Schon als Aufgabe mit Frist erfasst: nichts.';
  const lines = input.tracked.map((text) => `- ${text}`);
  return ['Schon als Aufgabe mit Frist erfasst (nicht melden):', ...lines].join('\n');
}

export function journalLooseEndsPrompt(input: JournalLooseEndsInput): ChatTurn[] {
  return turns(
    [
      'Du liest Tagebuchtage eines Menschen und suchst darin lose Enden.',
      `Heute ist ${input.today}.`,
      'Ein loses Ende ist ein Satz, der etwas für einen späteren Tag ankündigt, dessen Tag inzwischen vorbei ist und zu dem an keinem späteren Tag etwas gesagt wurde.',
      'Ein Bericht über etwas Vergangenes ist kein loses Ende. Eine Ankündigung für heute oder später ist keins — der Tag ist noch nicht vorbei. Etwas, das ein späterer Tag in eigenen Worten aufgreift, ist keins mehr.',
      'Du hast nur, was unten steht. Suche nichts hinzu und nenne kein Datum, das unten nicht als Tag vorkommt.',
      '`quote` ist ein Satz aus dem Text dieses Tages, Zeichen für Zeichen. Schreibe nicht um, kürze nicht, übersetze nicht, korrigiere keinen Tippfehler. Was nicht wortwörtlich dort steht, wird verworfen.',
      '`day` ist das Datum des Tages, in dem der Satz steht. `refDate` ist der angekündigte Tag: nach `day` und vor heute.',
      `\`subject\` sind höchstens ${MAX_LOOSE_END_SUBJECT_WORDS} Wörter, und zwar Wörter aus dem zitierten Satz — keine eigenen.`,
      `Höchstens ${MAX_LOOSE_END_PROPOSALS} Einträge. Findest du nichts, bleibt die Liste leer: ein erfundenes loses Ende kostet mehr als ein übersehenes.`,
      'Keine Lobsätze, keine Zusammenfassung des Auftrags, keine Ratschläge, keine Emoji.',
    ],
    [knownLines(input), '', trackedLines(input), '', 'Tage:', dayLines(input)],
  );
}
