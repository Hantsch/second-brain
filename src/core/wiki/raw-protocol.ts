/**
 * Das Protokoll einer Rohquelle (`.ingest.json`) nachziehen.
 *
 * Der **Inhalt** unter `raw/` ist unveraenderlich — er ist der Fixpunkt, den jedes
 * Zitat belegt (docs/VAULT-FORMAT.md). Das Protokoll daneben ist dagegen die
 * Buchhaltung der App: `sourcePage` heisst „schon verdichtet", und ohne diesen
 * Vermerk blieben alle Quellen fuer immer unverdichtet — der Pflege-Befund
 * „unverdichtete Quelle" waere damit dauerhaft falsch.
 *
 * Geschrieben wird nur, was die App verantwortet (`sourcePage`, `modules`); jedes
 * andere Feld bleibt wortwoertlich stehen. Ein fehlendes Protokoll wird **nicht**
 * angelegt: Quellen eintragen ist Sache von `core/ingest`.
 */

import type { WikiStore } from './types';

const SUFFIX = '.ingest.json';

/**
 * Die beiden in docs/VAULT-FORMAT.md festgelegten Orte: `<ordner>/.ingest.json`
 * (der Ordner ist die Quelle) und `<stamm>.ingest.json` als Geschwisterdatei.
 */
export function protocolPaths(rawPath: string): string[] {
  const slash = rawPath.lastIndexOf('/');
  const cut = rawPath.lastIndexOf('.');
  const name = rawPath.slice(slash + 1);
  const hasExtension = cut > slash && !name.startsWith('.');
  return hasExtension
    ? [`${rawPath.slice(0, cut)}${SUFFIX}`]
    : [`${rawPath}/${SUFFIX}`, `${rawPath}${SUFFIX}`];
}

/**
 * Vermerken, wohin eine Rohquelle verdichtet wurde. Findet sich kein lesbares
 * Protokoll, passiert nichts — lieber kein Vermerk als ein ueberschriebener
 * Vault-Inhalt.
 */
export async function markRawProtocol(
  store: WikiStore,
  rawPath: string,
  sourcePage: string,
  module: string,
): Promise<void> {
  for (const path of protocolPaths(rawPath)) {
    const raw = await store.readText(path);
    if (raw === null) continue;
    const record = parseRecord(raw);
    if (record === null) return;
    const modules = Array.isArray(record['modules'])
      ? record['modules'].filter((entry): entry is string => typeof entry === 'string')
      : [];
    if (!modules.includes(module)) modules.push(module);
    await store.writeText(path, `${JSON.stringify({ ...record, sourcePage, modules }, null, 2)}\n`);
    return;
  }
}

function parseRecord(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
