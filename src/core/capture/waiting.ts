/**
 * „Auf wen warte ich?" — die dritte Frage der App, aus rohem Text gelesen.
 *
 * Erkannt werden vier Wendungen, die in echten Notizen vorkommen:
 * „warte auf X", „Rueckmeldung von X", „X muss noch Y", „von X fehlt noch Y".
 * Alles andere bleibt liegen: ein erfundener Wartender ist schlimmer als keiner.
 *
 * Die Namenspruefung laeuft ausdruecklich **ohne** `i`-Flag. Die Muster suchen
 * ihre Schluesselwoerter unabhaengig von der Schreibweise — und genau deshalb
 * koennte `[A-ZÄÖÜ]` dort einen Namen nicht von einem Verb unterscheiden.
 */

import { NOT_A_NAME } from './lexicon';
import { matchAll, wordRegex } from './words';

/** Ein erkannter Warte-auf-Hinweis: auf wen und worauf. */
export interface WaitingHit {
  who: string;
  what: string;
}

const NAME = '[A-ZÄÖÜ][\\p{L}-]+(?:\\s+[A-ZÄÖÜ][\\p{L}-]+)?';

const WAIT_FOR = wordRegex(
  'warte[nt]?\\s+(?:noch\\s+|immer\\s+noch\\s+)?auf\\s+(.{2,70}?)(?=[.,;!?]|$)',
);
const ANSWER_FROM = wordRegex(
  `(R(?:ü|ue)ckmeldung|Antwort|Freigabe|Zusage|Absage|Angebot|Feedback|Rechnung|Lieferung|` +
    `Best(?:ä|ae)tigung|Genehmigung|Entscheidung)\\s+(?:von|durch|aus)\\s+(${NAME})`,
);
const MUST_STILL = wordRegex(`(${NAME})\\s+muss\\s+(?:noch|erst|bis)\\s+(.{2,70}?)(?=[.,;!?]|$)`);
const MISSING_FROM = wordRegex(
  `von\\s+(${NAME})\\s+(?:fehlt|steht)\\s+(?:noch\\s+)?(.{2,70}?)(?=[.,;!?]|$)`,
);

/** Der Name am Anfang einer Phrase: hoechstens zwei gross geschriebene Woerter. */
function leadingName(phrase: string): string | null {
  const parts: string[] = [];
  for (const token of phrase.trim().split(/\s+/).slice(0, 2)) {
    const word = token.replace(/[^\p{L}\p{N}-]+$/u, '');
    if (word.length < 2 || !/^[A-ZÄÖÜ]/u.test(word)) break;
    if (NOT_A_NAME.has(word.toLowerCase())) break;
    parts.push(word);
  }
  return parts.length === 0 ? null : parts.join(' ');
}

/** Person und Sache aus einer Objektphrase: 'Jonas wegen des Fallbacks'. */
function splitPhrase(phrase: string, fallback: string): WaitingHit | null {
  const trimmed = phrase.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  const who = leadingName(trimmed);
  if (who === null) return { who: trimmed, what: fallback };
  const rest = trimmed
    .slice(who.length)
    .replace(/^[\s:,-]+/, '')
    .trim();
  return { who, what: rest.length > 0 ? rest : fallback };
}

/** Alle Warte-auf-Hinweise eines Satzes. Leer, wenn keiner sicher zu deuten ist. */
export function findWaitingOn(sentence: string): WaitingHit[] {
  const hits: WaitingHit[] = [];
  const context = sentence.replace(/\s*[.!?]+\s*$/, '').trim();

  for (const match of matchAll(WAIT_FOR, sentence)) {
    const hit = splitPhrase(match.groups[0] ?? '', context);
    if (hit !== null) hits.push(hit);
  }
  for (const match of matchAll(ANSWER_FROM, sentence)) {
    const who = leadingName(match.groups[1] ?? '');
    if (who !== null) hits.push({ who, what: (match.groups[0] ?? '').trim() });
  }
  for (const match of matchAll(MUST_STILL, sentence)) {
    const who = leadingName(match.groups[0] ?? '');
    if (who !== null) hits.push({ who, what: (match.groups[1] ?? '').trim() });
  }
  for (const match of matchAll(MISSING_FROM, sentence)) {
    const who = leadingName(match.groups[0] ?? '');
    if (who !== null) hits.push({ who, what: (match.groups[1] ?? '').trim() });
  }

  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.who.toLowerCase()}|${hit.what.toLowerCase()}`;
    if (seen.has(key) || hit.who.length === 0) return false;
    seen.add(key);
    return true;
  });
}
