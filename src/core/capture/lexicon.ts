/**
 * The German word lists used for classification.
 *
 * They deliberately live in one place, spelled out in full: what the app
 * recognizes as "work", "private", "mood", or "task" should be readable and
 * extendable without touching logic. Each entry may carry up to three
 * trailing inflection letters ('Kunde' matches 'Kunden').
 *
 * Umlauts are given both ways (`m(?:ü|ue)de`), because users write both.
 */

import type { DocLanguage } from '@shared/types';
import { MOOD_WORDS_EN, PRIVATE_WORDS_EN, WORK_WORDS_EN } from './lexicon-en';
import { anyWordRegex, matchedWords, wordRegex } from './words';

/** Phrasings that signal a journal entry. */
export const MOOD_WORDS = wordRegex(
  'ich\\s+f(?:ü|ue)hle|f(?:ü|ue)hlt\\s+sich|stress|gestresst|m(?:ü|ue)de|ersch(?:ö|oe)pft|' +
    'zu\\s+viel|(?:ü|ue)berfordert|(?:ü|ue)berforderung|keine\\s+kraft|keine\\s+energie|' +
    'ausgelaugt|genervt|traurig|w(?:ü|ue)tend|angst|sorge|sorgen|dankbar|erleichtert|einsam|' +
    'kraftlos|schlecht\\s+geschlafen|kopf\\s+voll|unruhig|innerlich',
);

/** Words that signal an intent: their presence turns a sentence into a task. */
export const TASK_WORDS = wordRegex(
  'muss|m(?:ü|ue)ssen|musst|sollte|sollten|soll|todo|to-do|aufgabe|nicht\\s+vergessen|dringend|' +
    'erledigen|besorgen|kaufen|einkaufen|anrufen|schreiben|schicken|senden|nachfassen|nachhaken|' +
    'abkl(?:ä|ae)ren|pr(?:ü|ue)fen|checken|einplanen|buchen|absagen|aufsetzen|bauen|holen|' +
    'bestellen|abgeben|einreichen|vorbereiten|terminieren|erinnern|s(?:ä|ae)gen|anbringen',
);

/** A finite auxiliary verb turns a sentence into a report, not a task. */
export const REPORT_WORDS = wordRegex(
  'bin|ist|sind|war|waren|habe|hat|haben|hatte|hatten|wurde|wurden|f(?:ü|ue)hle|f(?:ü|ue)hlt|' +
    'l(?:ä|ae)uft|lief|liegt|liegen|gibt|kam|kommt|blieb|klappte',
);

/** Words that end in '-en' but are still not verbs. */
export const NOT_A_VERB = new Set([
  'oben',
  'unten',
  'eben',
  'neben',
  'gegen',
  'innen',
  'aussen',
  'morgen',
  'uebermorgen',
  'wochen',
  'stunden',
  'tagen',
  'wieder',
  'ihnen',
  'einen',
  'keinen',
  'meinen',
  'seinen',
  'deinen',
  'diesen',
  'jenen',
  'allen',
  'vielen',
  'beiden',
  'anderen',
  'letzten',
  'ersten',
  'naechsten',
  'kunden',
  'kollegen',
  'themen',
  'zahlen',
  'daten',
  'notizen',
]);

/** Capitalized words that are still not names — mostly sentence starters. */
export const NOT_A_NAME = new Set([
  'das',
  'der',
  'die',
  'den',
  'dem',
  'es',
  'ich',
  'wir',
  'du',
  'ihr',
  'man',
  'dann',
  'hier',
  'heute',
  'morgen',
  'alles',
  'nichts',
  'wichtig',
  'aber',
  'und',
  'noch',
  'sonst',
]);

const WORK_STEMS = [
  'kunde',
  'kundin',
  'sprint',
  'ticket',
  'jira',
  'kollege',
  'kollegin',
  'meeting',
  'deployment',
  'deploy',
  'release',
  'review',
  'abnahme',
  'abnahmeprotokoll',
  'stakeholder',
  'standup',
  'backlog',
  'produktion',
  'staging',
  'testsystem',
  'teamlead',
  'angebot',
  'rechnung',
  'vertrag',
  'chef',
  'b(?:ü|ue)ro',
  'team',
  'pipeline',
  'pull\\s+request',
  'merge\\s+request',
];

const PRIVATE_STEMS = [
  'balkon',
  'einkauf',
  'einkaufsliste',
  'urlaub',
  'familie',
  'frau',
  'mann',
  'kinder',
  'tochter',
  'sohn',
  'garten',
  'hochbeet',
  'wohnung',
  'miete',
  'arzt',
  'zahnarzt',
  'physiotherapeut',
  'geburtstag',
  'kochen',
  'rezept',
  'sport',
  'fitness',
  'freunde',
  'wochenende',
  'haushalt',
  'putzen',
  'keller',
  'baumarkt',
  'fahrrad',
  'eltern',
];

const WORK_WORDS = anyWordRegex(WORK_STEMS);
const PRIVATE_WORDS = anyWordRegex(PRIVATE_STEMS);

function mergeUnique(lists: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  for (const list of lists) for (const word of list) seen.add(word);
  return [...seen];
}

/** Mood words found in the text, lowercased — from every active document language. */
export function moodSignals(text: string, languages: readonly DocLanguage[] = ['de']): string[] {
  const lists: string[][] = [];
  if (languages.includes('de')) lists.push(matchedWords(MOOD_WORDS, text));
  if (languages.includes('en')) lists.push(matchedWords(MOOD_WORDS_EN, text));
  return mergeUnique(lists);
}

/** What in the text speaks for work and what speaks for private. */
export interface ScopeSignals {
  work: string[];
  private: string[];
}

/**
 * Signal words for both sides, from every active document language. Whichever
 * has more wins — the caller decides that.
 */
export function scopeSignals(
  text: string,
  languages: readonly DocLanguage[] = ['de'],
): ScopeSignals {
  const work: string[][] = [];
  const priv: string[][] = [];
  if (languages.includes('de')) {
    work.push(matchedWords(WORK_WORDS, text));
    priv.push(matchedWords(PRIVATE_WORDS, text));
  }
  if (languages.includes('en')) {
    work.push(matchedWords(WORK_WORDS_EN, text));
    priv.push(matchedWords(PRIVATE_WORDS_EN, text));
  }
  return { work: mergeUnique(work), private: mergeUnique(priv) };
}
