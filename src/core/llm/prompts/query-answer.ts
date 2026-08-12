/* Eine Frage an das Second Brain beantworten — ausschließlich aus den
   mitgegebenen Ausschnitten.

   Das ist der Prompt, an dem Guardrail 3 hängt („Keine Halluzinationen"):
   jede Aussage trägt einen Beleg als [[pfad]], und ohne Beleg sagt die Antwort
   ausdrücklich, dass nichts gefunden wurde.

   Dazu kommt die Zitat-Regel: was in Anführungszeichen steht, muss Zeichen für
   Zeichen in einem Ausschnitt stehen. Der Aufrufer prüft das nach
   (`core/wiki/citations.ts`) und verwirft ein Zitat, das er in keiner Datei findet —
   ein Beleg, der sich nicht wiederfinden lässt, ist keiner. Deshalb tragen die
   Ausschnitte hier auch ihre Zeilennummer: sie ist der Weg zurück in die Datei. */

import type { ChatTurn, DocLanguage, UiLanguage } from '@shared/types';
import { documentLanguageRule, replyLanguageRule, turns, type PromptExcerpt } from './shared';

/** Ein Ausschnitt mit Fundstelle. `line` ist die erste Zeile des Zitats in der Datei. */
export interface QueryExcerpt extends PromptExcerpt {
  line?: number | null;
}

export interface QueryAnswerInput {
  question: string;
  excerpts: readonly QueryExcerpt[];
  /** Frühere Runden desselben Gesprächs, älteste zuerst. */
  history?: readonly { role: 'user' | 'assistant'; content: string }[];
  /** Nur ein Modul befragt? Dann steht das im Prompt. */
  module?: string | null;
}

/** Der Satz, der bei fehlendem Beleg fallen muss. Tests und Oberfläche prüfen darauf. */
export const NO_EVIDENCE_MARKER = 'Dazu steht nichts im Vault.';

/**
 * Ausschnitte in der Form, in der das Modell sie zitieren kann. Wie
 * `formatExcerpts` in shared.ts, zusätzlich mit der Zeilennummer — sie macht aus
 * einem Beleg eine Fundstelle.
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
  // Vorgeschichte zwischen System- und Frage-Turn: die aktuelle Frage bleibt zuletzt.
  const [system, question] = base;
  return [
    ...(system ? [system] : []),
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    ...(question ? [question] : []),
  ];
}
