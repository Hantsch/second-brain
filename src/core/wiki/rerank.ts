/**
 * Suchtreffer sortieren lassen (Aufgabe `query-rerank`).
 *
 * Der Prompt liegt bei der Suche, die er bedient, und nicht in `core/llm/prompts/`:
 * er ist Teil des Retrievals, sein Ergebnis verlaesst diese Datei nie als Text,
 * sondern nur als Reihenfolge. Wer die Prompts der App durchgeht, findet ihn ueber
 * `core/wiki/ask.ts`.
 *
 * Die Aufgabe ist billig gehalten: das Modell gibt nur Nummern zurueck und laesst
 * weg, was nichts zur Frage sagt. Faellt sie aus, bleibt die Reihenfolge der
 * Volltextsuche — ein Rerank ist eine Verbesserung, keine Voraussetzung.
 */

import type { ChatTurn, DocLanguage } from '@shared/types';
import { collapse } from '@core/index/text';
import { turns } from '@core/llm';

/** Nur eine Liste von Nummern — kein Fliesstext, kein Urteil. */
export const QUERY_RERANK_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['order'],
  properties: {
    order: {
      type: 'array',
      description:
        'Die Nummern der Ausschnitte, beste zuerst. Ausschnitte ohne Bezug zur Frage ' +
        'lasse weg. Erfinde keine Nummern.',
      items: { type: 'integer', minimum: 1 },
    },
  },
};

/** Ein Kandidat, so knapp wie moeglich — der Rerank liest, er schreibt nicht. */
export interface RerankCandidate {
  path: string;
  title: string;
  snippet: string;
}

/** So viel Ausschnitt reicht, um Bezug zu erkennen. */
const SNIPPET_CHARS = 300;

export function rerankPrompt(
  question: string,
  candidates: readonly RerankCandidate[],
  docLanguage: DocLanguage = 'de',
): ChatTurn[] {
  const lines = candidates.map(
    (candidate, index) =>
      `${index + 1}. ${candidate.title} (${candidate.path}): ${collapse(candidate.snippet).slice(0, SNIPPET_CHARS)}`,
  );
  return turns(
    [
      'Du sortierst Ausschnitte aus einem persoenlichen Wissensarchiv nach ihrem Bezug zu einer Frage.',
      `Die Ausschnitte sind auf ${docLanguage === 'en' ? 'Englisch' : 'Deutsch'} oder gemischt — die Sprache entscheidet nicht ueber die Relevanz.`,
      'Gib nur Nummern zurueck, beste zuerst. Was nichts zur Frage sagt, lasse weg.',
      'Antworte nicht auf die Frage. Bewerte nur.',
    ],
    [`Frage: ${question.trim()}`, '', 'Ausschnitte:', ...lines],
  );
}

/**
 * Eine Reihenfolge anwenden. Unbekannte und doppelte Nummern fallen weg, und was das
 * Modell nicht nennt, ebenso — darum bittet der Prompt: ein Ausschnitt ohne Bezug
 * ist kein Beleg, nur Laerm im Antwort-Prompt. Nennt es keine einzige gueltige
 * Nummer, ist das ein Ausfall und kein Urteil: dann bleibt die Reihenfolge der Suche.
 */
export function applyOrder<T>(items: readonly T[], order: unknown): T[] {
  if (!Array.isArray(order)) return [...items];
  const taken = new Set<number>();
  const result: T[] = [];
  for (const entry of order) {
    const position = typeof entry === 'number' ? Math.trunc(entry) - 1 : Number.NaN;
    if (!Number.isInteger(position) || position < 0 || position >= items.length) continue;
    if (taken.has(position)) continue;
    taken.add(position);
    const item = items[position];
    if (item !== undefined) result.push(item);
  }
  return result.length > 0 ? result : [...items];
}
