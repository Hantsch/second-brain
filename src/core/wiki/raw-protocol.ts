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

import { sha256 } from '@core/vault/hash';
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
 *
 * The write carries `expectedHash` — the hash of the very text this call read and
 * merged. Somebody who changed the protocol in between (a second digestion of the
 * same source, a hand edit, the ingest pipeline) gets a conflict instead of losing
 * their line, the same read-then-write guard the catalog and every page write use.
 * The hash is taken here rather than passed in: only this function knows which of
 * the two possible protocol paths it actually read.
 */
export async function markRawProtocol(
  store: WikiStore,
  rawPath: string,
  sourcePage: string,
  module: string,
): Promise<void> {
  const found = await readProtocol(store, rawPath);
  if (found === null) return;
  const { path, raw, record } = found;
  const modules = moduleList(record);
  if (!modules.includes(module)) modules.push(module);
  await store.writeText(path, `${JSON.stringify({ ...record, sourcePage, modules }, null, 2)}\n`, {
    expectedHash: sha256(raw),
  });
}

/**
 * Sagt das Protokoll dieser Rohquelle, dass sie in dieses Modul schon verdichtet
 * ist? Genau das ist der Vermerk, den `markRawProtocol` als letzten Schritt setzt —
 * `sourcePage` plus das Modul in `modules`.
 *
 * Ein zweiter Versuch darf eine liegengebliebene Source-Seite nur wiederverwenden,
 * solange dieser Vermerk fehlt (Story 050, D-c). Steht er, war die Verdichtung
 * vollstaendig, und eine bewusst zweite Verdichtung derselben Quelle gehoert weiter
 * **neben** die erste Seite, nicht darueber. Kein lesbares Protokoll heisst „kein
 * Vermerk" — und damit nicht verdichtet.
 */
export async function isRawDigestedInto(
  store: WikiStore,
  rawPath: string,
  module: string,
): Promise<boolean> {
  const found = await readProtocol(store, rawPath);
  if (found === null) return false;
  const page = found.record['sourcePage'];
  if (typeof page !== 'string' || page.trim().length === 0) return false;
  return moduleList(found.record).includes(module);
}

/**
 * Das Protokoll einer Rohquelle lesen — der erste der beiden moeglichen Orte, an
 * dem eine lesbare Datei liegt. `null`, wenn es keine gibt oder sie kein Objekt
 * enthaelt: dann laesst die App sie in Ruhe, statt Vault-Inhalt zu ueberschreiben.
 */
export async function readProtocol(
  store: WikiStore,
  rawPath: string,
): Promise<{ path: string; raw: string; record: Record<string, unknown> } | null> {
  for (const path of protocolPaths(rawPath)) {
    const raw = await store.readText(path);
    if (raw === null) continue;
    const record = parseRecord(raw);
    return record === null ? null : { path, raw, record };
  }
  return null;
}

/** `modules` als Liste von Strings; alles andere zaehlt als „noch keine". */
function moduleList(record: Record<string, unknown>): string[] {
  return Array.isArray(record['modules'])
    ? record['modules'].filter((entry): entry is string => typeof entry === 'string')
    : [];
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
