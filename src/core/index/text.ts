/**
 * Textwerkzeug des Index. Zwei Aufgaben, die sich mehrere Ableitungen teilen:
 *
 * 1. **Zeilen ohne Code.** Checkboxen und Wikilinks in Code-Zaeunen sind Beispiele,
 *    keine Daten — Todo-Parser und Wikilink-Graph muessen sie gleich behandeln.
 * 2. **Deutsche Faltung.** 'Rueckmeldung' und 'Rückmeldung' sind fuer die Suche
 *    dasselbe Wort. Beide Seiten werden auf eine ASCII-Form gefaltet.
 */

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/* Ausgeschrieben, nicht entschaerft — dieselbe Regel wie in vault/slug.ts. */
const UMLAUTS: [RegExp, string][] = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
  [/æ/g, 'ae'],
  [/œ/g, 'oe'],
  [/ø/g, 'oe'],
];

/** Eine Zeile des Rumpfs mit ihrem 0-basierten Index. */
export interface ContentLine {
  line: string;
  index: number;
}

/**
 * Alle Zeilen eines Rumpfs **ausserhalb** von Code-Zaeunen, mit ihrem
 * Originalindex. Der Index bleibt erhalten, damit Zeilennummern stimmen.
 */
export function* contentLines(body: string): Generator<ContentLine> {
  const lines = body.split('\n');
  let fence: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = FENCE.exec(line);
    if (match) {
      const marker = (match[1] ?? '').slice(0, 1);
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    yield { line, index };
  }
}

/**
 * Suchform eines Wortes: klein, ASCII, Umlaute ausgeschrieben, Diakritika weg.
 * Wird auf Dokument- *und* Anfrageseite angewandt, damit beide sich treffen.
 */
export function fold(term: string): string {
  let text = (term ?? '').normalize('NFC').toLowerCase();
  for (const [pattern, replacement] of UMLAUTS) text = text.replace(pattern, replacement);
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Mehrere Leerzeichen und Umbrueche zu einem Leerzeichen. */
export function collapse(text: string): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Zeichen entschaerfen, die in einem regulaeren Ausdruck Bedeutung haetten. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 'YYYY-MM-DD' oder nichts. Wirft nie. */
export function asDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return match ? (match[0] ?? null) : null;
}

/** Ein Wert als Liste von Zeichenketten — Frontmatter ist nie zu trauen. */
export function asStringList(value: unknown): string[] {
  if (typeof value === 'string') return value.trim().length > 0 ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim().length > 0) result.push(entry.trim());
    else if (typeof entry === 'number') result.push(String(entry));
  }
  return result;
}

/** Ein Wert als Zeichenkette, oder null. */
export function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}
