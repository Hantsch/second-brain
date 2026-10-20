/* Structured output has two paths: the provider can do it natively (OpenAI
   `response_format`, Anthropic `tools`) — or it can't. Then the schema
   migrates into the system prompt and the response is read tolerantly.

   Both paths deliver the same thing in the end: `text` is valid, compact JSON. */

import type { ChatTurn } from '@shared/types';

/** Name under which the schema is registered with both provider kinds. */
export const SCHEMA_NAME = 'antwort';

/**
 * Appends the schema instruction to the system message (or creates one).
 * Deliberately terse: long meta-instructions confuse small models more than they help.
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

/** Whether the native path may still be tried. Once it's a no, it stays a no. */
export type SchemaSupport = 'auto' | 'native' | 'prompt';

/**
 * Status codes we interpret as "doesn't know `json_schema` or `tools`".
 * Everything else is a genuine error and is not masked by the fallback.
 */
export function meansSchemaUnsupported(status: number): boolean {
  return status === 400 || status === 404 || status === 415 || status === 422 || status === 501;
}
