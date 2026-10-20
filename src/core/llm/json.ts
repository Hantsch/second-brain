/* Tolerant JSON reader for model responses. Small models like to wrap JSON in
   code fences or write "Here is the result:" in front of it. That's
   fixable — broken JSON, on the other hand, is not: then a clear error
   instead of a mystery.

   The error message never contains the response text: it might carry journal content. */

export class JsonParseError extends Error {
  /** Length of the raw response — enough for a log, without revealing content. */
  readonly rawLength: number;

  constructor(message: string, rawLength: number) {
    super(message);
    this.name = 'JsonParseError';
    this.rawLength = rawLength;
  }
}

/** Removes ```json fences, even when only the opening one is present. */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const withoutOpening = trimmed.replace(/^```[a-zA-Z0-9_-]*\r?\n?/, '');
  return withoutOpening.replace(/```\s*$/, '').trim();
}

/**
 * Cuts out the first complete JSON object or array and ignores text before
 * and after it. Braces inside strings don't count.
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
 * Reads JSON as leniently as is reasonable: code fences gone, surrounding
 * text gone, trailing commas gone. After that, either a value or `JsonParseError`.
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
      // A single extra comma before } or ] is the most common error.
      return JSON.parse(candidate.replace(/,(\s*[}\]])/g, '$1')) as T;
    } catch {
      throw new JsonParseError('Antwort war kein gültiges JSON.', text.length);
    }
  }
}

/** Like `parseJsonLoose`, but returns the result as compact JSON again. */
export function normalizeJsonText(text: string): string {
  return JSON.stringify(parseJsonLoose(text));
}
