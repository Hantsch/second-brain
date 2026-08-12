/* Ein Schlüssel darf nie in ein Log, eine Fehlermeldung oder eine Vault-Datei
   geraten. Jeder Text, der aus einer HTTP-Antwort in eine Fehlermeldung wandert,
   läuft vorher durch `sanitize`. */

const PLACEHOLDER = '***';

/** Typische Schlüsselformen, falls ein Dienst den Schlüssel in der Antwort spiegelt. */
const KEY_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|pk|rk|xai|gsk|or)-[A-Za-z0-9._-]{8,}/g,
  /\bsk-ant-[A-Za-z0-9._-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._-]{8,}/g,
];

/** Entfernt genau diesen Schlüssel aus dem Text. */
export function redactSecret(text: string, secret?: string | null): string {
  if (!secret || secret.length < 4) return text;
  return text.split(secret).join(PLACEHOLDER);
}

/** Entfernt alles, was wie ein API-Schlüssel aussieht. */
export function redactKeyLikeStrings(text: string): string {
  return KEY_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, PLACEHOLDER), text);
}

/**
 * Macht einen Fremdtext logfähig: Schlüssel raus, Länge begrenzt.
 * `max` schützt davor, dass eine HTML-Fehlerseite die Logs flutet.
 */
export function sanitize(text: string, secret?: string | null, max = 400): string {
  const clean = redactKeyLikeStrings(redactSecret(text, secret)).trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
