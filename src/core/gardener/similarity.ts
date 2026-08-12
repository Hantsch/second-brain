/**
 * Textwerkzeug der beiden unscharfen Checks — Beinahe-Dubletten und fehlende
 * Seiten. Beide brauchen dasselbe Fundament: **normalisierte Woerter**.
 *
 * Normalisiert heisst: Code-Zaeune weg (dort stehen Beispiele, keine Aussagen),
 * Markdown-Auszeichnung weg, Wikilinks auf ihren Text reduziert, Umlaute
 * ausgeschrieben (`fold` aus dem Index — dieselbe Faltung wie in der Suche),
 * deutsche und englische Funktionswoerter weg. Was bleibt, sind die Woerter, die
 * eine Seite von einer anderen unterscheiden.
 *
 * Alles hier ist deterministisch. Kein Modell, keine Zufallszahl, keine Uhr.
 */

import { contentLines, fold } from '@core/index/text';

/** Woerter unter dieser Laenge tragen keine Bedeutung („und", „im", „x"). */
export const MIN_WORD_CHARS = 3;

/**
 * Funktionswoerter, die in jedem deutschen Satz stehen und deshalb keine
 * Aehnlichkeit belegen. Englisch dabei, weil Quellen englisch sein duerfen
 * (VAULT-FORMAT.md: Zitate bleiben im Original).
 */
const STOPWORDS = new Set([
  'aber',
  'alle',
  'allem',
  'allen',
  'aller',
  'alles',
  'als',
  'also',
  'and',
  'andere',
  'anderen',
  'are',
  'auch',
  'auf',
  'aus',
  'bei',
  'beide',
  'bein',
  'bis',
  'but',
  'dabei',
  'damit',
  'dann',
  'das',
  'dass',
  'dem',
  'den',
  'denen',
  'denn',
  'der',
  'des',
  'deshalb',
  'dessen',
  'die',
  'dies',
  'diese',
  'diesem',
  'diesen',
  'dieser',
  'doch',
  'dort',
  'durch',
  'ein',
  'eine',
  'einem',
  'einen',
  'einer',
  'eines',
  'etwa',
  'etwas',
  'for',
  'from',
  'fuer',
  'gegen',
  'hat',
  'hatte',
  'has',
  'have',
  'her',
  'hier',
  'ihre',
  'ihren',
  'immer',
  'ist',
  'kann',
  'kein',
  'keine',
  'man',
  'mehr',
  'mit',
  'muss',
  'nach',
  'nicht',
  'noch',
  'not',
  'nur',
  'oben',
  'ober',
  'oder',
  'ohne',
  'sehr',
  'sein',
  'seine',
  'sich',
  'sie',
  'sind',
  'sodass',
  'soll',
  'sollen',
  'sonst',
  'that',
  'the',
  'their',
  'this',
  'ueber',
  'und',
  'uns',
  'unter',
  'usw',
  'viel',
  'vom',
  'von',
  'vor',
  'war',
  'waren',
  'was',
  'wenn',
  'werden',
  'wie',
  'wir',
  'wird',
  'with',
  'wurde',
  'wurden',
  'zum',
  'zur',
  'zwei',
]);

/** Ist das ein Wort, das eine Seite kennzeichnet? */
export function isContentWord(word: string): boolean {
  if (word.length < MIN_WORD_CHARS) return false;
  if (STOPWORDS.has(word)) return false;
  // Reine Zahlen und Datumsteile sind Belegdaten, keine Begriffe.
  return /[a-z]/.test(word);
}

/**
 * Rumpf ohne Code-Zaeune und ohne Auszeichnung. Wikilinks werden auf ihren
 * sichtbaren Text reduziert, Belegklammern (`(source: [[…]])`) fallen weg — sonst
 * waeren zwei Seiten schon deshalb aehnlich, weil sie dieselbe Quelle zitieren.
 */
export function plainText(body: string): string {
  const kept: string[] = [];
  for (const { line } of contentLines(body)) kept.push(line);
  return kept
    .join('\n')
    .replace(/\s*\(source:[^)]*\)/gi, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (_all, target: string) => target.split('/').pop() ?? target)
    .replace(/[*_#>|]+/g, ' ');
}

/** Bedeutungstragende Woerter eines Rumpfs, in Reihenfolge des Auftretens. */
export function contentWords(body: string): string[] {
  return fold(plainText(body))
    .split(/[^a-z0-9]+/)
    .filter(isContentWord);
}

/**
 * Wortfolgen fester Laenge (Shingles). Drei Woerter sind der Kompromiss: einzelne
 * Woerter teilen zwei Seiten zum selben Thema ohnehin, ganze Saetze teilen nur
 * Kopien. Bei drei Woerter ist eine Uebereinstimmung schon ein Hinweis auf
 * denselben Text und noch robust gegen kleine Umformulierungen.
 */
export const SHINGLE_SIZE = 3;

export function shingles(words: readonly string[], size = SHINGLE_SIZE): Set<string> {
  const result = new Set<string>();
  if (words.length < size) {
    // Zu kurz fuer eine Wortfolge: das einzelne Wort ist alles, was da ist.
    if (words.length > 0) result.add(words.join(' '));
    return result;
  }
  for (let at = 0; at + size <= words.length; at += 1) {
    result.add(words.slice(at, at + size).join(' '));
  }
  return result;
}

/**
 * Jaccard-Aehnlichkeit zweier Mengen aus ihren Groessen und der Schnittmenge.
 * `0` heisst: keine gemeinsame Wortfolge. `1` heisst: dieselben Wortfolgen.
 */
export function jaccard(sizeA: number, sizeB: number, shared: number): number {
  const union = sizeA + sizeB - shared;
  return union <= 0 ? 0 : shared / union;
}

/** Fette Stellen eines Rumpfs — `**Begriff**`. Auszeichnung heisst: das ist wichtig. */
export function boldSpans(body: string): string[] {
  const found: string[] = [];
  for (const { line } of contentLines(body)) {
    for (const match of line.matchAll(/\*\*([^*\n]{2,80})\*\*/g)) {
      const text = (match[1] ?? '').trim();
      if (text.length > 0) found.push(text);
    }
  }
  return found;
}

/** Sichtbare Texte der Wikilinks — `[[slug|Text]]` zaehlt mit `Text`. */
export function linkTexts(body: string): string[] {
  const found: string[] = [];
  for (const { line } of contentLines(body)) {
    for (const match of line.matchAll(/\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g)) {
      const label = (match[2] ?? '').trim();
      const target = (match[1] ?? '').trim();
      const text = label.length > 0 ? label : (target.split('/').pop() ?? target);
      if (text.length > 0) found.push(text.replace(/-/g, ' '));
    }
  }
  return found;
}

/** Suchform eines Begriffs: gefaltet, ohne Satzzeichen, mit einfachen Leerzeichen. */
export function termKey(term: string): string {
  return fold(term)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
