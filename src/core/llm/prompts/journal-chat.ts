/* The journal conversation — the app's most sensitive prompt.

   Since 011 there are two stances here, not three. `listen` files what the
   user wrote and asks nothing at all: it never reaches a model (see
   `core/journal/coach.ts`), so it has no stance text, and `JournalChatMode`
   excludes it on purpose — a prompt for a mode that must not contact a model
   would be an invitation to contact one.

   What's left are the two requests that really do want an answer, and they
   aren't nuances of the same text but two different assignments:

   - `tips`    listens first, then at most three small steps doable today.
   - `analyze` helps the user understand the problem and steadies them —
               grounded in what the entries actually say, with their dates,
               without a diagnosis.

   The user's own reason for the split: "sometimes as a human you don't always
   want a solution, sometimes you just need someone who listens and
   understands." That case is answered by writing now, not by a model
   performing empathy. */

import type { ChatTurn, CoachMode, DocLanguage, UiLanguage } from '@shared/types';
import { clamp, documentLanguageRule, replyLanguageRule, turns } from './shared';

/** How much journal entry or message content goes into a prompt. */
const MAX_CHARS = 4000;

/**
 * The stances that ask a model. `listen` stays a valid `CoachMode` at the IPC
 * and UI boundary — it is just handled without a prompt, so passing it here
 * is a compile error rather than a silent model call.
 */
export type JournalChatMode = Exclude<CoachMode, 'listen'>;

export interface JournalChatInput {
  mode: JournalChatMode;
  /** What the user just wrote. */
  message: string;
  /** Date of the journal entry (YYYY-MM-DD). */
  date: string;
  /** The entry so far, if there is one. */
  entry?: string;
  /** Earlier turns of this day, oldest first — the user's prose and the app's answers. */
  history?: readonly { role: 'user' | 'assistant'; content: string }[];
  /** Excerpts from earlier days — only meaningful in `analyze` mode. */
  earlierDays?: readonly { date: string; excerpt: string }[];
}

/** What applies in every stance. */
function common(docLanguage: DocLanguage, replyLanguage: UiLanguage): string[] {
  return [
    'Du bist der Gesprächspartner in einem privaten Tagebuch. Der Inhalt ist vertraulich und verlässt dieses Gespräch nicht.',
    replyLanguageRule(replyLanguage),
    documentLanguageRule(docLanguage),
    'Deine Antwort wird wortwörtlich in den Tageseintrag geschrieben. Schreibe sie in der Sprache, in der du dem Nutzer antwortest.',
    'Rede den Nutzer direkt an, in der Du-Form, nie in der dritten Person und nie über ihn.',
    'Ton: ruhig, direkt, ohne Floskeln, ohne Emoji, kein Therapeuten-Jargon.',
    'Erfinde keine Ereignisse und keine Personen, die nicht im Eintrag oder in dieser Runde vorkommen.',
    'Keine Anrede-Formel am Anfang und keine Grußformel am Ende.',
  ];
}

const STANCE: Record<JournalChatMode, readonly string[]> = {
  tips: [
    'Haltung: erst zuhören, dann konkret helfen. Beginne mit einem bis zwei Sätzen Spiegelung — die stehen zuerst und werden nicht übersprungen.',
    'Danach höchstens drei Vorschläge, als kurze Liste. Jeder ist klein und heute machbar, und jeder trägt einen halben Satz Begründung, warum er hilft.',
    'Vorschläge sind klein und heute machbar: keine Lebensratschläge, keine Methodenvorträge, keine Ratgeber-Floskeln, keine Buchtipps.',
    'Benenne, wenn etwas nicht in der Hand des Nutzers liegt, statt eine Handlung zu erfinden.',
    'Höchstens acht Sätze.',
  ],
  /* 011: die Haltung hilft verstehen und trägt, statt einen Musterbericht
     abzuliefern. Die Belegpflicht bleibt Wort für Wort stehen — getröstet wird
     mit dem, was wirklich in den Einträgen steht, nicht mit Erfundenem. */
  analyze: [
    'Haltung: verstehen helfen und stützen. Der Nutzer hat ein Problem — hilf ihm, es zu ordnen, und sage ihm, was er darin bisher schon getragen hat.',
    'Beginne mit einem bis zwei Sätzen, die das Problem in eigenen Worten wiedergeben. Erst wenn das steht, ordnest du ein.',
    'Ordne dann, was in den Einträgen steht: was zusammenhängt, was sich wiederholt, was sich verändert hat. Als Angebot formuliert, nie als Befund über den Nutzer.',
    'Nenne bei jeder Beobachtung das Datum des Eintrags, auf den du dich beziehst, und was dort stand. Ohne Eintrag keine Behauptung.',
    'Zähle nur, was du zählen kannst — „das dritte Mal in drei Wochen" nur, wenn drei Einträge dastehen.',
    'Sage ausdrücklich, was besser geworden ist, und benenne, was nicht in der Hand des Nutzers liegt.',
    'Keine Diagnosen, keine psychologischen Etiketten, keine Ferndeutung der Psyche: nur was in den Einträgen steht.',
    'Kein Bericht und keine Liste von Befunden: zusammenhängende Sätze, höchstens acht. Schließe mit einer Frage, die den Nutzer weiterdenken lässt.',
  ],
};

/** The system prompt of a stance. Exported so its rules are testable. */
export function journalChatSystemPrompt(
  mode: JournalChatMode,
  docLanguage: DocLanguage,
  replyLanguage: UiLanguage = docLanguage,
): string {
  return [...common(docLanguage, replyLanguage), ...STANCE[mode]].join('\n');
}

export function journalChatPrompt(
  input: JournalChatInput,
  docLanguage: DocLanguage,
  replyLanguage: UiLanguage = docLanguage,
): ChatTurn[] {
  /* Earlier days are the evidence `analyze` cites. In `tips` they have no
     purpose — there they'd only tempt comparisons. */
  const earlier = input.mode === 'analyze' ? (input.earlierDays ?? []) : [];
  const base = turns(
    [journalChatSystemPrompt(input.mode, docLanguage, replyLanguage)],
    [
      `Tag: ${input.date}`,
      input.entry ? `Bisheriger Eintrag:\n${clamp(input.entry, MAX_CHARS)}` : '',
      earlier.length > 0
        ? `Frühere Tage:\n${earlier
            .map((day) => `- ${day.date}: ${day.excerpt.replace(/\s+/g, ' ').trim()}`)
            .join('\n')}`
        : '',
      '',
      clamp(input.message, MAX_CHARS),
    ],
  );

  const history = input.history ?? [];
  if (history.length === 0) return base;
  const [system, current] = base;
  return [
    ...(system ? [system] : []),
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    ...(current ? [current] : []),
  ];
}
