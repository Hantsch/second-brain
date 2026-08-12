/**
 * Was ein Rohtext sagt: Saetze, Aufgaben, Links, Entitaeten.
 *
 * Reine Zeichenkettenarbeit auf deutschem Text — deterministisch, ohne Modell und
 * ohne Zustand. Das ist die Grundlage dafuer, dass die App auch ohne Sprachmodell
 * einordnet (Guardrail 1). Die Wortlisten liegen daneben in `lexicon.ts`, das
 * Erkennen von Wartenden in `waiting.ts`.
 *
 * Jede Erkennung ist bewusst zurueckhaltend: ein falsches Todo kostet mehr
 * Vertrauen, als ein uebersehenes einbringt.
 */

import { MOOD_WORDS, NOT_A_NAME, NOT_A_VERB, REPORT_WORDS, TASK_WORDS } from './lexicon';
import { hasMatch, matchAll } from './words';

export { moodSignals, scopeSignals, type ScopeSignals } from './lexicon';
export { findWaitingOn, type WaitingHit } from './waiting';

/** Ein Satz oder Listenpunkt des Rumpfs. */
export interface Sentence {
  /** Text ohne Listenzeichen und Checkbox. */
  text: string;
  /** 0-basierte Zeile im Rumpf. */
  line: number;
  /** Stand die Zeile als Listenpunkt da? */
  listItem: boolean;
  /** War die Checkbox schon abgehakt? */
  checked: boolean;
}

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s*)?(.*)$/;
const HEADING_OR_QUOTE = /^\s*(?:#{1,6}\s|>)/;
const FENCE = /^\s*(?:`{3,}|~{3,})/;
/**
 * Satzende: ein Punkt, Frage- oder Ausrufezeichen, dem Leerraum folgt — aber nicht
 * der Punkt eines deutschen Datums. Ohne diese Ausnahme zerfaellt
 * „bis 15.08. durchgehen" in zwei Saetze und die Frist verliert ihre Aufgabe.
 */
const SENTENCE_END = /(?<=[.!?])(?<!\d\.)\s+/;

/** Rumpf in Saetze und Listenpunkte zerlegen. Code-Zaeune zaehlen nicht mit. */
export function sentences(text: string): Sentence[] {
  const result: Sentence[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let fenced = false;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = (lines[index] ?? '').trim();
    if (FENCE.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || raw.length === 0 || HEADING_OR_QUOTE.test(raw)) continue;

    const item = LIST_ITEM.exec(raw);
    if (item !== null) {
      const body = (item[2] ?? '').trim();
      if (body.length > 0) {
        result.push({ text: body, line: index, listItem: true, checked: (item[1] ?? ' ') !== ' ' });
      }
      continue;
    }
    for (const part of raw.split(SENTENCE_END)) {
      const piece = part.trim();
      if (piece.length > 0) {
        result.push({ text: piece, line: index, listItem: false, checked: false });
      }
    }
  }
  return result;
}

// ── Aufgaben ───────────────────────────────────────────────────────────────────

/** Satzende, das nach einem Infinitiv klingt: '... auf Laenge saegen'. */
const INFINITIVE_END = /(?<![\p{L}])(\p{Ll}{2,}(?:en|ern|eln))\s*[.!]?$/u;

/** Vorsilben, die vor der eigentlichen Aufgabe stehen. */
const TASK_PREFIX =
  /^(?:todo|to-do|aufgabe)\s*[:-]\s*|^(?:ich|wir)\s+(?:muss|m(?:ü|ue)ssen|sollte|sollten)\s+(?:noch\s+|unbedingt\s+)?|^nicht\s+vergessen\s*[:,-]?\s*|^noch\s+/i;

/** Mindestlaenge eines Satzes, der ueber seinen Infinitiv zur Aufgabe wird. */
const MIN_TASK_WORDS = 3;

function asciiFold(word: string): string {
  return word.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
}

function looksLikeInfinitive(text: string): boolean {
  const trimmed = text.trim();
  const match = INFINITIVE_END.exec(trimmed);
  if (match === null) return false;
  if (NOT_A_VERB.has(asciiFold((match[1] ?? '').toLowerCase()))) return false;
  return trimmed.split(/\s+/).length >= MIN_TASK_WORDS;
}

/**
 * Ist dieser Satz eine Aufgabe?
 *
 * Ein Listenpunkt gilt als Aufgabe: eine Liste in einem Dump ist fast immer eine
 * Liste von Dingen, die zu tun sind. Ein Gefuehlssatz nie — auch nicht als
 * Listenpunkt.
 */
export function isTask(sentence: Sentence): boolean {
  if (sentence.checked) return false;
  if (hasMatch(MOOD_WORDS, sentence.text)) return false;
  if (sentence.listItem) return true;
  if (hasMatch(TASK_WORDS, sentence.text)) return true;
  return looksLikeInfinitive(sentence.text) && !hasMatch(REPORT_WORDS, sentence.text);
}

/** Aufgabentext aufraeumen: Vorsilbe weg, Satzpunkt weg, erster Buchstabe gross. */
export function taskText(text: string): string {
  const trimmed = text
    .replace(TASK_PREFIX, '')
    .replace(/\s*[.;]+\s*$/, '')
    .trim();
  if (trimmed.length === 0) return text.trim();
  return `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1)}`;
}

// ── Links und Entitaeten ───────────────────────────────────────────────────────

const URL = /(?:https?:\/\/|www\.)[^\s<>()[\]"'»]+/gi;

/** Alle Links im Text, Satzzeichen am Ende abgeschnitten. */
export function findUrls(text: string): string[] {
  const seen = new Set<string>();
  for (const match of matchAll(URL, text)) {
    seen.add(match.text.replace(/[.,;:!?)\]]+$/, ''));
  }
  return [...seen];
}

/* Host eines Links, ohne 'www.' — kurz genug fuer eine Begruendung. Eine Fassung
   fuer den ganzen Kern; hier nur weitergereicht, damit die Aufrufer bleiben. */
export { hostOf } from '@core/text/url';

const CAPITALIZED = /(?<![\p{L}\p{N}])([A-ZÄÖÜ][\p{Ll}äöüß]{2,})(?![\p{L}])/u;

/**
 * Kandidaten fuer Wiki-Entitaeten: gross geschriebene Woerter, die nicht am
 * Satzanfang stehen. Im Deutschen sind das Nomen und Namen — genau das, was als
 * Entitaet in Frage kommt.
 */
export function findEntities(list: readonly Sentence[], limit = 6): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const sentence of list) {
    const tokens = sentence.text.split(/\s+/);
    for (let index = sentence.listItem ? 0 : 1; index < tokens.length; index += 1) {
      const word = CAPITALIZED.exec(tokens[index] ?? '')?.[1];
      if (word === undefined || NOT_A_NAME.has(word.toLowerCase()) || seen.has(word)) continue;
      seen.add(word);
      found.push(word);
      if (found.length >= limit) return found;
    }
  }
  return found;
}
