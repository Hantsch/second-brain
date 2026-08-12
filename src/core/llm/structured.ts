/* Strukturierte Ausgabe hat zwei Wege: der Provider kann es nativ (OpenAI
   `response_format`, Anthropic `tools`) — oder er kann es nicht. Dann wandert das
   Schema in den System-Prompt und die Antwort wird tolerant gelesen.

   Beide Wege liefern am Ende dasselbe: `text` ist gültiges, kompaktes JSON. */

import type { ChatTurn } from '@shared/types';

/** Name, unter dem das Schema bei beiden Provider-Arten angemeldet wird. */
export const SCHEMA_NAME = 'antwort';

/**
 * Hängt die Schema-Anweisung an die System-Nachricht (oder legt eine an).
 * Bewusst knapp: lange Meta-Anweisungen verwirren kleine Modelle mehr, als sie helfen.
 */
export function withSchemaInstruction(
  messages: readonly ChatTurn[],
  schema: Record<string, unknown>,
): ChatTurn[] {
  const instruction = [
    'Antworte ausschließlich mit einem JSON-Objekt nach diesem Schema:',
    JSON.stringify(schema),
    'Kein Vorwort, keine Erklärung, keine Code-Fences.',
  ].join('\n');

  const first = messages[0];
  if (first && first.role === 'system') {
    return [
      { role: 'system', content: `${first.content}\n\n${instruction}` },
      ...messages.slice(1),
    ];
  }
  return [{ role: 'system', content: instruction }, ...messages];
}

/** Ob der native Weg noch versucht werden darf. Nach einem Nein bleibt es beim Nein. */
export type SchemaSupport = 'auto' | 'native' | 'prompt';

/**
 * Status-Codes, die wir als „kennt `json_schema` bzw. `tools` nicht" deuten.
 * Alles andere ist ein echter Fehler und wird nicht durch den Fallback verdeckt.
 */
export function meansSchemaUnsupported(status: number): boolean {
  return status === 400 || status === 404 || status === 415 || status === 422 || status === 501;
}
