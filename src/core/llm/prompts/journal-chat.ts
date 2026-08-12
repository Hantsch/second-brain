/* Das Tagebuch-Gespräch — der empfindlichste Prompt der App.

   Der Nutzer hat den Grund dafür selbst gesagt: „manchmal will man als Mensch
   nicht immer eine Lösung haben, manchmal braucht man einfach nur jemanden der
   einem zuhört und versteht."

   Deshalb sind die drei Haltungen keine Nuancen desselben Textes, sondern drei
   verschiedene Aufträge:

   - `listen`  spiegelt und bestätigt. **Kein** Ratschlag, keine Umdeutung ins
               Positive, keine „hast du schon versucht"-Frage. Das ist der Zweck
               des Modus, nicht seine Feinheit.
   - `tips`    hört zuerst zu, dann höchstens drei kleine, heute machbare Schritte.
   - `analyze` verbindet heute mit früheren Einträgen — mit Datum, ohne Diagnose.

   Was in `listen` verboten ist, steht als Liste im Prompt und wird von den Tests
   Wendung für Wendung geprüft: `LISTEN_FORBIDDEN`. */

import type { ChatTurn, CoachMode, DocLanguage, UiLanguage } from '@shared/types';
import { clamp, documentLanguageRule, replyLanguageRule, turns } from './shared';

/** So viel Tageseintrag bzw. Nachricht geht in einen Prompt. */
const MAX_CHARS = 4000;

export interface JournalChatInput {
  mode: CoachMode;
  /** Was der Nutzer gerade geschrieben hat. */
  message: string;
  /** Datum des Tageseintrags (YYYY-MM-DD). */
  date: string;
  /** Der bisherige Tageseintrag, falls vorhanden. */
  entry?: string;
  /** Frühere Runden dieses Gesprächs, älteste zuerst. */
  history?: readonly { role: 'user' | 'assistant'; content: string }[];
  /** Auszüge früherer Tage — nur im Modus `analyze` sinnvoll. */
  earlierDays?: readonly { date: string; excerpt: string }[];
}

/**
 * Wendungen, die der Modus `listen` ausdrücklich verbietet. Sie stehen wörtlich
 * im Prompt, damit das Modell sie erkennt, und sie sind zugleich die Prüfliste
 * der Tests — so ist das Verbot nachweisbar, ohne ein Modell zu fragen.
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

/** Was in jeder Haltung gilt. */
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

/** Der System-Prompt einer Haltung. Öffentlich, damit die Verbote prüfbar sind. */
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
  /* Frühere Tage sind Belege für Muster. In `listen` und `tips` haben sie keinen
     Auftrag — dort würden sie nur zum Vergleichen verführen. */
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
