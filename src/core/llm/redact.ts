/* A key must never end up in a log, an error message, or a vault file. Any
   text that migrates from an HTTP response into an error message passes
   through `sanitize` first. */

const PLACEHOLDER = '***';

/** Typical key shapes, in case a service mirrors the key back in its response. */
const KEY_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|pk|rk|xai|gsk|or)-[A-Za-z0-9._-]{8,}/g,
  /\bsk-ant-[A-Za-z0-9._-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._-]{8,}/g,
];

/** Removes exactly this key from the text. */
export function redactSecret(text: string, secret?: string | null): string {
  if (!secret || secret.length < 4) return text;
  return text.split(secret).join(PLACEHOLDER);
}

/** Removes anything that looks like an API key. */
export function redactKeyLikeStrings(text: string): string {
  return KEY_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, PLACEHOLDER), text);
}

/**
 * Makes a foreign text loggable: keys removed, length capped.
 * `max` protects against an HTML error page flooding the logs.
 */
export function sanitize(text: string, secret?: string | null, max = 400): string {
  const clean = redactKeyLikeStrings(redactSecret(text, secret)).trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
