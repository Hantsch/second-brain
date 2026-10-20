/**
 * Zitierform fuer eine Agenten-Session (z. B. eine Claude-Code-Session unter
 * `~/.claude/projects`) innerhalb der `sources:`-Liste eines kondensierten
 * Artefakts. Diese Liste enthaelt sowohl Vault-Pfade als auch Agenten-Refs;
 * die Form muss deshalb unverwechselbar von einem Vault-Pfad sein.
 *
 * Aufbau: `agent:<kind>/<pathKey>` — `<pathKey>` ist die bereits normalisierte
 * Vergleichsform aus `pathKey()` in `src/core/claude/paths.ts` (Trenner und
 * Gross/Klein-Schreibung sind dort schon vereinheitlicht); dieses Modul
 * erbt die Stabilitaet nur, indem es den Wert unveraendert einbettet.
 */

/** Prefix, das einen Agenten-Ref von einem Vault-Pfad unterscheidet. */
const PREFIX = 'agent:';

/** Ergebnis von `parseAgentRef`: Agenten-Art und normalisierter Pfad-Schluessel. */
export interface AgentRef {
  kind: string;
  pathKey: string;
}

/** Baut die Zitierform `agent:<kind>/<pathKey>` fuer eine Agenten-Session. */
export function agentRef(kind: string, pathKey: string): string {
  return `${PREFIX}${kind}/${pathKey}`;
}

/**
 * Erkennt einen Agenten-Ref in einem Token der `sources:`-Liste. Liefert
 * `null` fuer alles andere — insbesondere fuer Vault-Pfade (auch wenn sie
 * zufaellig mit `agent:` beginnen wuerden) und fuer unvollstaendige Formen
 * ohne `/`, ohne Art oder ohne Pfad-Schluessel.
 */
export function parseAgentRef(token: string): AgentRef | null {
  if (!token.startsWith(PREFIX)) return null;
  const rest = token.slice(PREFIX.length);
  const separator = rest.indexOf('/');
  if (separator <= 0) return null;
  const kind = rest.slice(0, separator);
  const pathKeyValue = rest.slice(separator + 1);
  if (kind.length === 0 || pathKeyValue.length === 0) return null;
  return { kind, pathKey: pathKeyValue };
}
