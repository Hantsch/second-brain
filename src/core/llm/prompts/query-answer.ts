/* Answer a question to the Second Brain — exclusively from the excerpts
   passed in.

   This is the prompt that guardrail 3 ("no hallucinations") hangs on: every
   statement carries a citation as [[path]], and without a citation the answer
   explicitly says that nothing was found.

   On top of that comes the quote rule: whatever is placed in quotation marks
   must appear character-for-character in an excerpt. The caller verifies this
   afterward (`core/wiki/citations.ts`) and discards a quote it can't find in
   any file — a citation that can't be relocated isn't one. That's why the
   excerpts here also carry their line number: it's the way back into the
   file. */

import type { ChatTurn, DocLanguage, UiLanguage } from '@shared/types';
import { documentLanguageRule, replyLanguageRule, turns, type PromptExcerpt } from './shared';

/** An excerpt with a location. `line` is the first line of the quote in the file. */
export interface QueryExcerpt extends PromptExcerpt {
  line?: number | null;
}

export interface QueryAnswerInput {
  question: string;
  excerpts: readonly QueryExcerpt[];
  /** Earlier turns of the same conversation, oldest first. */
  history?: readonly { role: 'user' | 'assistant'; content: string }[];
  /** Only one module being queried? Then that's stated in the prompt. */
  module?: string | null;
}

/** The sentence that must appear when no citation was found. Tests and the UI check for it. */
export const NO_EVIDENCE_MARKER = 'Dazu steht nichts im Vault.';

/**
 * Excerpts in the form the model can cite them in. Like `formatExcerpts` in
 * shared.ts, but additionally with the line number — it turns a citation into
 * a locatable spot.
 */
export function formatQueryExcerpts(excerpts: readonly QueryExcerpt[]): string {
  if (excerpts.length === 0) return '(keine Ausschnitte)';
  return excerpts
    .map((excerpt, index) =>
      [
        `--- Ausschnitt ${index + 1} ---`,
        `pfad: ${excerpt.path}`,
        `titel: ${excerpt.title}`,
        typeof excerpt.line === 'number' ? `zeile: ${excerpt.line}` : '',
        excerpt.snippet.trim(),
      ]
        .filter((line) => line.length > 0)
        .join('\n'),
    )
    .join('\n\n');
}

export function queryAnswerPrompt(
  input: QueryAnswerInput,
  docLanguage: DocLanguage,
  replyLanguage: UiLanguage = docLanguage,
): ChatTurn[] {
  const base = turns(
    [
      'Du beantwortest Fragen zu einem persönlichen Second Brain.',
      replyLanguageRule(replyLanguage),
      documentLanguageRule(docLanguage),
      'Benutze ausschließlich die mitgegebenen Ausschnitte. Kein Weltwissen, keine Vermutungen, keine Ergänzungen.',
      'Belege jede Aussage mit dem Pfad des Ausschnitts in doppelten eckigen Klammern, z. B. [[projects/work/nyota/project.md]]. Mehrere Belege stehen hintereinander.',
      'Zitiere wortwörtlich: was du in Anführungszeichen setzt, muss Zeichen für Zeichen in einem Ausschnitt stehen. Ein Zitat, das sich nicht wiederfinden lässt, wird verworfen.',
      `Findest du in den Ausschnitten keine Antwort, schreibe genau: "${NO_EVIDENCE_MARKER}" — und nenne höchstens einen Satz dazu, wonach der Nutzer stattdessen suchen könnte.`,
      'Widersprechen sich Ausschnitte, benenne den Widerspruch mit beiden Belegen statt ihn zu glätten.',
      'Antworte knapp und sachlich: erst die Antwort, dann bei Bedarf zwei bis drei Stichpunkte. Keine Einleitung, kein Lob, keine Emoji.',
      input.module ? `Die Frage bezieht sich auf das Modul ${input.module}.` : '',
    ],
    ['Ausschnitte:', formatQueryExcerpts(input.excerpts), '', `Frage: ${input.question.trim()}`],
  );

  const history = input.history ?? [];
  if (history.length === 0) return base;
  // History goes between the system turn and the question turn: the current question stays last.
  const [system, question] = base;
  return [
    ...(system ? [system] : []),
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    ...(question ? [question] : []),
  ];
}
