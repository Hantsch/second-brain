/**
 * Die deutschen Wortlisten des Einordnens.
 *
 * Sie stehen bewusst an einer Stelle und ausgeschrieben: was die App als
 * „Arbeit", „privat", „Gefuehl" oder „Aufgabe" erkennt, soll nachlesbar und
 * erweiterbar sein, ohne Logik anzufassen. Jeder Eintrag darf bis zu drei
 * Endbuchstaben Beugung tragen ('Kunde' trifft 'Kunden').
 *
 * Umlaute stehen doppelt (`m(?:ü|ue)de`), weil Nutzer beides schreiben.
 */

import { anyWordRegex, matchedWords, wordRegex } from './words';

/** Wendungen, die einen Tagebucheintrag ankuendigen. */
export const MOOD_WORDS = wordRegex(
  'ich\\s+f(?:ü|ue)hle|f(?:ü|ue)hlt\\s+sich|stress|gestresst|m(?:ü|ue)de|ersch(?:ö|oe)pft|' +
    'zu\\s+viel|(?:ü|ue)berfordert|(?:ü|ue)berforderung|keine\\s+kraft|keine\\s+energie|' +
    'ausgelaugt|genervt|traurig|w(?:ü|ue)tend|angst|sorge|sorgen|dankbar|erleichtert|einsam|' +
    'kraftlos|schlecht\\s+geschlafen|kopf\\s+voll|unruhig|innerlich',
);

/** Woerter, die eine Absicht ankuendigen: ihr Vorkommen macht einen Satz zur Aufgabe. */
export const TASK_WORDS = wordRegex(
  'muss|m(?:ü|ue)ssen|musst|sollte|sollten|soll|todo|to-do|aufgabe|nicht\\s+vergessen|dringend|' +
    'erledigen|besorgen|kaufen|einkaufen|anrufen|schreiben|schicken|senden|nachfassen|nachhaken|' +
    'abkl(?:ä|ae)ren|pr(?:ü|ue)fen|checken|einplanen|buchen|absagen|aufsetzen|bauen|holen|' +
    'bestellen|abgeben|einreichen|vorbereiten|terminieren|erinnern|s(?:ä|ae)gen|anbringen',
);

/** Ein finites Hilfsverb macht aus einem Satz einen Bericht, keine Aufgabe. */
export const REPORT_WORDS = wordRegex(
  'bin|ist|sind|war|waren|habe|hat|haben|hatte|hatten|wurde|wurden|f(?:ü|ue)hle|f(?:ü|ue)hlt|' +
    'l(?:ä|ae)uft|lief|liegt|liegen|gibt|kam|kommt|blieb|klappte',
);

/** Woerter, die auf '-en' enden und trotzdem keine Verben sind. */
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

/** Gross geschriebene Woerter, die trotzdem kein Name sind — meist Satzanfaenge. */
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

/** Gefuehlsworte im Text, klein geschrieben. */
export function moodSignals(text: string): string[] {
  return matchedWords(MOOD_WORDS, text);
}

/** Was im Text fuer Arbeit und was fuer Privat spricht. */
export interface ScopeSignals {
  work: string[];
  private: string[];
}

/** Signalwoerter beider Seiten. Wer mehr hat, gewinnt — das entscheidet der Aufrufer. */
export function scopeSignals(text: string): ScopeSignals {
  return { work: matchedWords(WORK_WORDS, text), private: matchedWords(PRIVATE_WORDS, text) };
}
