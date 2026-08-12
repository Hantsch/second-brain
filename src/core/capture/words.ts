/**
 * Deutsche Wortgrenzen und ein Scanner darueber.
 *
 * `\b` kennt nur ASCII und versagt genau bei den Woertern, um die es beim
 * Einordnen geht: `/\buebermorgen\b/` trifft, `/\bübermorgen\b/` nie — denn vor
 * dem `ü` steht fuer die Regex-Maschine schon eine Wortgrenze. Alle Muster im
 * Capture-Kern werden deshalb hier gebaut.
 */

/** Kein Wortzeichen davor. */
export const LEFT_EDGE = '(?<![\\p{L}\\p{N}_])';
/** Kein Wortzeichen dahinter. */
export const RIGHT_EDGE = '(?![\\p{L}\\p{N}_])';

/** Muster mit Wortgrenzen, die Umlaute als Wortzeichen zaehlen. */
export function wordRegex(body: string, flags = 'giu'): RegExp {
  return new RegExp(`${LEFT_EDGE}(?:${body})${RIGHT_EDGE}`, flags);
}

/** Muster, das eines der Woerter trifft — auch gebeugt (bis zu drei Endbuchstaben). */
export function anyWordRegex(words: readonly string[], extraLetters = 3): RegExp {
  const body = words.map((word) => `${word}\\p{L}{0,${extraLetters}}`).join('|');
  return wordRegex(body);
}

/** Ein Treffer mit seiner Stelle im Text. */
export interface Match {
  at: number;
  text: string;
  groups: (string | undefined)[];
}

/**
 * Alle Treffer eines Musters. Das Muster wird kopiert, damit `lastIndex` beim
 * Aufrufer nicht haengen bleibt — geteilte Muster mit `g` sind sonst eine Falle.
 */
export function matchAll(pattern: RegExp, text: string): Match[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const found: Match[] = [];
  for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
    found.push({ at: match.index, text: match[0], groups: match.slice(1) });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return found;
}

/** Trifft das Muster irgendwo? */
export function hasMatch(pattern: RegExp, text: string): boolean {
  return new RegExp(pattern.source, pattern.flags.replace('g', '')).test(text);
}

/** Die getroffenen Woerter, klein geschrieben und ohne Wiederholung. */
export function matchedWords(pattern: RegExp, text: string): string[] {
  const seen = new Set<string>();
  for (const match of matchAll(pattern, text)) {
    seen.add(match.text.toLowerCase().replace(/\s+/g, ' '));
  }
  return [...seen];
}
