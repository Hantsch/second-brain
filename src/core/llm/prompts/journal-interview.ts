/* The interview's optional follow-up (012, D3): once a backbone question
   (`core/journal/interview.ts`) is answered, ask a model for at most one
   short follow-up that goes deeper on that one answer. Same task as
   `journal-chat` (`./journal-chat.ts`) — the story's own decision is not to
   add a new `TaskKind` for one extra question of the same sensitivity
   class.

   The prompt is deliberately narrow: the model sees only the backbone
   question just answered, the user's own answer to it, and — if the caller
   has it — the day's own projects and due todos. Nothing else feeds in, and
   the fixed topic set (`INTERVIEW_TOPICS`) is never extended by a model —
   this is one optional extra question, not a sixth topic.

   A follow-up that isn't grounded in exactly what was just said is worse
   than no follow-up: it would read as the app claiming to know something
   about the user it was never told (CLAUDE.md guardrail 3). The prompt
   forbids that outright; `core/journal/interview-followup.ts` still
   validates the reply hard afterward regardless — this prompt is the first
   line of defense, not the only one. */

import type { ChatTurn, DocLanguage } from '@shared/types';
import { clamp, documentLanguageRule, turns } from './shared';

/** A follow-up answer is short — this is generous headroom, not an invitation to ramble. */
const MAX_CHARS = 1000;

export interface JournalInterviewFollowupInput {
  /** The backbone question just answered, verbatim (`InterviewStep.question`). */
  question: string;
  /** The user's own answer to it, verbatim. */
  answer: string;
  /** Project names touched today, if known — context only, never a claim. */
  projects?: readonly string[];
  /** Todo texts due around today, if known — context only, never a claim. */
  todosDue?: readonly string[];
}

/**
 * Builds the prompt for one optional follow-up. Plain text, not a JSON
 * schema: `journal-chat` is a conversational task (not `structured` in
 * `core/llm/tasks.ts`), and the expected reply is either one short question
 * or the literal word "keine" — a caller-side hard validation
 * (`interview-followup.ts#sanitizeFollowup`) decides what counts as usable,
 * not the shape of the response.
 */
export function journalInterviewFollowupPrompt(
  input: JournalInterviewFollowupInput,
  docLanguage: DocLanguage,
): ChatTurn[] {
  const projects = input.projects ?? [];
  const todosDue = input.todosDue ?? [];
  return turns(
    [
      'Du hilfst bei einem kurzen Fragebogen in einem privaten Tagebuch. Der Inhalt ist vertraulich und verlässt dieses Gespräch nicht.',
      documentLanguageRule(docLanguage),
      'Rede den Nutzer direkt an, in der Du-Form, nie in der dritten Person und nie über ihn.',
      'Ton: ruhig, direkt, ohne Floskeln, ohne Emoji, kein Therapeuten-Jargon.',
      'Stelle höchstens eine kurze Rückfrage zu genau der Antwort, die gerade gegeben wurde.',
      'Behaupte nichts über den Nutzer, das nicht wörtlich in der Frage, der Antwort oder dem mitgegebenen Kontext steht. Erfinde keine Ereignisse, Personen, Gefühle oder Schlussfolgerungen.',
      'Erweitere den Fragebogen nicht um ein neues Thema — deine Rückfrage bleibt bei genau dem, was in der Antwort steht.',
      'Deine Antwort besteht aus genau einem Satz: der Rückfrage selbst, nichts davor, nichts danach. Keine Anrede, keine Einleitung, keine zweite Frage, keine Aussage.',
      'Hast du keine sinnvolle Rückfrage, antworte ausschließlich mit dem einzelnen Wort "keine".',
    ],
    [
      `Gestellte Frage: ${input.question}`,
      `Antwort des Nutzers: ${clamp(input.answer, MAX_CHARS)}`,
      projects.length > 0 ? `Heutige Projekte: ${projects.join(', ')}` : '',
      todosDue.length > 0 ? `Fällige Todos: ${todosDue.join(', ')}` : '',
    ],
  );
}
