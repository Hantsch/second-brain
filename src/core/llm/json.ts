/* Toleranter JSON-Leser für Modellantworten. Kleine Modelle rahmen JSON gern in
   Code-Fences oder schreiben „Hier ist das Ergebnis:" davor. Das ist reparierbar
   — kaputtes JSON dagegen nicht: dann ein klarer Fehler statt eines Rätsels.

   Die Fehlermeldung enthält nie den Antworttext: der kann Tagebuchinhalt tragen. */

export class JsonParseError extends Error {
  /** Länge der Rohantwort — genug für ein Log, ohne Inhalt zu verraten. */
  readonly rawLength: number;

  constructor(message: string, rawLength: number) {
    super(message);
    this.name = 'JsonParseError';
    this.rawLength = rawLength;
  }
}

/** Entfernt ```json-Zäune, auch wenn nur der öffnende gesetzt ist. */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const withoutOpening = trimmed.replace(/^```[a-zA-Z0-9_-]*\r?\n?/, '');
  return withoutOpening.replace(/```\s*$/, '').trim();
}

/**
 * Schneidet das erste vollständige JSON-Objekt bzw. -Array heraus und ignoriert
 * Text davor und danach. Klammern in Strings zählen nicht mit.
 */
export function extractJsonBlock(text: string): string | null {
  const openIndex = firstOpener(text);
  if (openIndex === -1) return null;
  const opener = text[openIndex];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex, i + 1);
    }
  }
  return null;
}

function firstOpener(text: string): number {
  const brace = text.indexOf('{');
  const bracket = text.indexOf('[');
  if (brace === -1) return bracket;
  if (bracket === -1) return brace;
  return Math.min(brace, bracket);
}

/**
 * Liest JSON so nachsichtig wie vertretbar: Code-Fences weg, Rahmentext weg,
 * abschließende Kommas weg. Danach entweder ein Wert oder `JsonParseError`.
 */
export function parseJsonLoose<T = unknown>(text: string): T {
  const candidate = extractJsonBlock(stripCodeFences(text));
  if (candidate === null) {
    throw new JsonParseError('Antwort enthielt kein JSON-Objekt.', text.length);
  }
  try {
    return JSON.parse(candidate) as T;
  } catch {
    try {
      // Ein einzelnes überzähliges Komma vor } oder ] ist der häufigste Fehler.
      return JSON.parse(candidate.replace(/,(\s*[}\]])/g, '$1')) as T;
    } catch {
      throw new JsonParseError('Antwort war kein gültiges JSON.', text.length);
    }
  }
}

/** Wie `parseJsonLoose`, gibt das Ergebnis aber wieder als kompaktes JSON zurück. */
export function normalizeJsonText(text: string): string {
  return JSON.stringify(parseJsonLoose(text));
}
