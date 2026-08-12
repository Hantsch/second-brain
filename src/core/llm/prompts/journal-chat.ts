/* The journal conversation — the app's most sensitive prompt.

   The user stated the reason themself: "sometimes as a human you don't
   always want a solution, sometimes you just need someone who listens and
   understands."

   That's why the three stances aren't nuances of the same text but three
   different assignments:

   - `listen`  mirrors and affirms. **No** advice, no reframing toward the
               positive, no "have you tried" question. That's the purpose of
               the mode, not a refinement of it.
   - `tips`    listens first, then at most three small steps doable today.
   - `analyze` connects today with earlier entries — with dates, without
               diagnosis.

   What's forbidden in `listen` is listed in the prompt and checked phrase by
   phrase by the tests: `LISTEN_FORBIDDEN`. */

import type { ChatTurn, CoachMode, DocLanguage, UiLanguage } from '@shared/types';
import { clamp, documentLanguageRule, replyLanguageRule, turns } from './shared';

/** How much journal entry or message content goes into a prompt. */
const MAX_CHARS = 4000;

export interface JournalChatInput {
  mode: CoachMode;
  /** What the user just wrote. */
  message: string;
  /** Date of the journal entry (YYYY-MM-DD). */
  date: string;
  /** The entry so far, if there is one. */
  entry?: string;
  /** Earlier turns of this conversation, oldest first. */
  history?: readonly { role: 'user' | 'assistant'; content: string }[];
  /** Excerpts from earlier days — only meaningful in `analyze` mode. */
  earlierDays?: readonly { date: string; excerpt: string }[];
}

/**
 * Phrases that the `listen` mode explicitly forbids. They appear verbatim in
 * the prompt so the model recognizes them, and they double as the tests'
 * checklist — that way the prohibition is verifiable without asking a model.
 */
export const LISTEN_FORBIDDEN: readonly string[] = [
  'hast du schon versucht',
  'hast du mal daran gedacht',
  'du könntest',
  'du solltest',
  'versuch einfach',
  'vielleicht hilft es',
  'immerhin',
  'wenigstens',
  'sieh es positiv',
  'das wird schon',
  'kopf hoch',
];

/** What applies in every stance. */
function common(docLanguage: DocLanguage, replyLanguage: UiLanguage): string[] {
  return [
    'Du bist der Gesprächspartner in einem privaten Tagebuch. Der Inhalt ist vertraulich und verlässt dieses Gespräch nicht.',
    replyLanguageRule(replyLanguage),
    documentLanguageRule(docLanguage),
    'Deine Antwort wird wortwörtlich in den Tageseintrag geschrieben. Schreibe sie in der Sprache, in der du dem Nutzer antwortest.',
    'Rede den Nutzer direkt an, in der Du-Form, nie in der dritten Person und nie über ihn.',
    'Ton: ruhig, direkt, ohne Floskeln, ohne Emoji, kein Therapeuten-Jargon.',
    'Erfinde keine Ereignisse und keine Personen, die nicht im Eintrag oder im Gespräch vorkommen.',
    'Keine Anrede-Formel am Anfang und keine Grußformel am Ende.',
  ];
}

const STANCE: Record<CoachMode, readonly string[]> = {
  listen: [
    'Haltung: nur zuhören. Spiegele in eigenen Worten, was du gehört hast, und benenne das Gefühl dahinter, wenn es klar erkennbar ist.',
    'Bestätige die Anstrengung: sage, was der Nutzer heute geleistet oder ausgehalten hat, ohne es zu bewerten.',
    'Stelle höchstens eine offene Rückfrage, und nur wenn sie das Erzählen weiterträgt.',
    'Gib keine Ratschläge, keine Tipps, keine Handlungsvorschläge, keine Aufgaben — auch nicht abgeschwächt, auch nicht als Frage verpackt, auch nicht, wenn der Nutzer es naheliegend macht.',
    'Keine Umdeutung ins Positive, kein Aufmuntern, keine Bewertung, kein Vergleich mit anderen Tagen oder anderen Menschen.',
    'Keine Liste, keine Aufzählung, keine Überschrift: zusammenhängende Sätze.',
    `Verboten sind Wendungen wie: ${LISTEN_FORBIDDEN.map((phrase) => `"${phrase}"`).join(', ')}.`,
    'Zwei bis fünf Sätze. Länger heißt hier: nicht zugehört.',
  ],
  tips: [
    'Haltung: erst zuhören, dann konkret helfen. Beginne mit einem bis zwei Sätzen Spiegelung — die stehen zuerst und werden nicht übersprungen.',
    'Danach höchstens drei Vorschläge, als kurze Liste. Jeder ist klein und heute machbar, und jeder trägt einen halben Satz Begründung, warum er hilft.',
    'Vorschläge sind klein und heute machbar: keine Lebensratschläge, keine Methodenvorträge, keine Ratgeber-Floskeln, keine Buchtipps.',
    'Benenne, wenn etwas nicht in der Hand des Nutzers liegt, statt eine Handlung zu erfinden.',
    'Höchstens acht Sätze.',
  ],
  analyze: [
    'Haltung: analysieren. Verbinde den heutigen Eintrag mit den früheren Einträgen und zeige Muster über die Zeit.',
    'Nenne bei jedem Muster das Datum des Eintrags, auf den du dich beziehst, und was dort stand. Ohne Eintrag keine Behauptung.',
    'Zähle nur, was du zählen kannst — „das dritte Mal in drei Wochen" nur, wenn drei Einträge dastehen.',
    'Sage ausdrücklich, was sich verändert hat: was häufiger, seltener oder anders geworden ist. Auch Verbesserungen.',
    'Keine Diagnosen, keine psychologischen Etiketten, keine Ferndeutung der Psyche: nur was in den Einträgen steht.',
    'Höchstens acht Sätze. Schließe mit einer Frage, die den Nutzer weiterdenken lässt.',
  ],
};

/** The system prompt of a stance. Exported so the prohibitions are testable. */
export function journalChatSystemPrompt(
  mode: CoachMode,
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
  /* Earlier days are evidence for patterns. In `listen` and `tips` they have
     no purpose — there they'd only tempt comparisons. */
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
