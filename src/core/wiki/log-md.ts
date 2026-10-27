/**
 * `wiki/log.md` — die Chronik eines Moduls. **Append-only.**
 *
 * Format wortwoertlich nach docs/MODULE-SCHEMA.md, damit es greppbar bleibt
 * (`grep "^## \[" wiki/log.md | tail -5`):
 *
 * ```
 * ## [2026-08-10] ingest | Auth0 RBAC Guide
 * - summary: wiki/sources/s-2026-08-10-auth0-rbac-guide.md
 * - touched: [[auth0]], [[rollenbasierte-zugriffskontrolle]], index.md
 * - notes: widerspricht [[altes-rollenkonzept]] bei der Vererbung von Rollen
 * ```
 *
 * Die Feldnamen sind bewusst englisch und unveraendert aus dem Schema uebernommen:
 * sie sind ein Datenformat, das auch ein fremdes LLM lesen soll — nicht Oberflaeche.
 * Geschrieben wird nur am Ende: eine bestehende Zeile faesst diese Datei nie an.
 */

import type { DocLanguage } from '@shared/types';
import { isoDay, wikiLogPath } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { LOG_HEADING_SOURCE } from './log-heading';
import { phrases } from './text';
import { type TextStore, writeTextWithRetry } from './write-retry';

/** Die drei Anlaesse, die ein Modul protokolliert. */
export type WikiLogKind = 'ingest' | 'query' | 'lint';

/** Ein Eintrag, wie er geschrieben wird. Leere Felder entfallen. */
export interface WikiLogEntry {
  kind: WikiLogKind;
  /** Titel hinter dem Strich. Bei `lint` gibt es keinen. */
  title?: string;
  /** Tag des Eintrags; Vorgabe ist heute. */
  day?: string;
  /** `- summary: <pfad>` — die Source-Seite eines Ingests. */
  summary?: string;
  /** `- touched: [[a]], [[b]], index.md` */
  touched?: readonly string[];
  /** `- notes: …` — benannte Widersprueche, Auffaelligkeiten. */
  notes?: string;
  /** `- answered from: [[a]], [[b]]` bei einer Frage. */
  answeredFrom?: readonly string[];
  /** `- filed back: wiki/concepts/….md` */
  filedBack?: string;
  /** `- findings: …` bei einem Pflegelauf. */
  findings?: string;
}

/** Ein gelesener Eintrag. `fields` traegt jede `- key: value`-Zeile. */
export interface ParsedLogEntry {
  day: string;
  kind: WikiLogKind;
  title: string | null;
  fields: Record<string, string>;
  /** Alle Zeilen des Eintrags ohne die Ueberschrift — fuer die Anzeige. */
  lines: string[];
}

export { LOG_HEADING_SOURCE };
const HEADING = new RegExp(LOG_HEADING_SOURCE);
const FIELD = /^-\s*([a-z][a-z ]*):\s*(.*)$/i;

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function list(values: readonly string[] | undefined): string | null {
  if (values === undefined) return null;
  const items = values.map(oneLine).filter((item) => item.length > 0);
  return items.length === 0 ? null : items.join(', ');
}

/** Ein Eintrag als Markdown-Block, genau in der Form aus dem Schema. */
export function formatLogEntry(entry: WikiLogEntry, now: DateLike = new Date()): string {
  const day = entry.day ?? isoDay(now);
  const title = oneLine(entry.title ?? '');
  const head = `## [${day}] ${entry.kind}${title.length > 0 ? ` | ${title}` : ''}`;
  const fields: [string, string | null][] = [
    ['summary', entry.summary === undefined ? null : oneLine(entry.summary)],
    ['touched', list(entry.touched)],
    ['answered from', list(entry.answeredFrom)],
    ['filed back', entry.filedBack === undefined ? null : oneLine(entry.filedBack)],
    ['notes', entry.notes === undefined ? null : oneLine(entry.notes)],
    ['findings', entry.findings === undefined ? null : oneLine(entry.findings)],
  ];
  const body = fields
    .filter((pair): pair is [string, string] => pair[1] !== null && pair[1].length > 0)
    .map(([key, value]) => `- ${key}: ${value}`);
  return [head, ...body].join('\n');
}

/** Kopf einer neuen Chronik in der Dokumentsprache. */
export function logHeader(language: DocLanguage = 'de'): string {
  const text = phrases(language);
  return `# ${text.chronicle}\n\n${text.chronicleIntro}\n`;
}

export interface AppendLogOptions {
  now?: DateLike;
  language?: DocLanguage;
  /** Hash, den der Aufrufer gelesen hat — Konflikt statt Ueberschreiben. */
  expectedHash?: string;
}

/**
 * Einen Eintrag anhaengen. Fehlt die Datei, entsteht sie mit ihrem Kopf; alles
 * Bestehende bleibt Zeichen fuer Zeichen stehen.
 *
 * The write carries the hash of the text it read and, on a conflict, reads again
 * and appends to the newer text — bounded at `MAX_WRITE_ATTEMPTS`. The chronicle
 * is append-only, so re-reading is the one reaction that loses neither the
 * foreign line nor this entry. The module lock keeps two digestions of this
 * process apart already; this guard is for the gardener and for a hand edit,
 * which the lock cannot see (story 050, D-e).
 *
 * `expectedHash` is the exception: a caller that names a hash gets the conflict,
 * not a retry — it asserted a state, and being told the assertion broke is the
 * whole point of naming it.
 */
export async function appendLog(
  store: TextStore,
  module: string,
  entry: WikiLogEntry,
  options: AppendLogOptions = {},
): Promise<{ path: string; block: string }> {
  const path = wikiLogPath(module);
  const block = formatLogEntry(entry, options.now ?? new Date());
  const language = options.language ?? 'de';
  await writeTextWithRetry(
    store,
    path,
    (current) => {
      const head = current === null ? logHeader(language) : current.content;
      return `${head.replace(/\s+$/, '')}\n\n${block}\n`;
    },
    options.expectedHash === undefined ? {} : { expectedHash: options.expectedHash },
  );
  return { path, block };
}

/**
 * Die letzten `limit` Eintraege, juengste zuerst. Ein kaputter Block wird
 * uebersprungen, nicht geraten — die Chronik bleibt lesbar, auch wenn jemand von
 * Hand darin geschrieben hat.
 */
export function parseLog(content: string | null, limit = 20): ParsedLogEntry[] {
  const entries: ParsedLogEntry[] = [];
  if (content === null) return entries;
  let current: ParsedLogEntry | null = null;
  for (const raw of content.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = HEADING.exec(line);
    if (heading !== null) {
      current = {
        day: heading[1] ?? '',
        kind: (heading[2] ?? 'ingest') as WikiLogKind,
        title: oneLine(heading[3] ?? '') || null,
        fields: {},
        lines: [],
      };
      entries.push(current);
      continue;
    }
    if (current === null || line.trim().length === 0) continue;
    if (line.startsWith('## ')) {
      current = null;
      continue;
    }
    current.lines.push(line);
    const field = FIELD.exec(line);
    if (field === null) continue;
    const key = (field[1] ?? '').toLowerCase().trim();
    current.fields[key] = (field[2] ?? '').trim();
  }
  entries.reverse();
  return entries.slice(0, Math.max(0, limit));
}

/** Tag des jüngsten `ingest`-Eintrags; `null`, wenn noch keiner drinsteht. */
export function lastIngestDay(content: string | null): string | null {
  for (const entry of parseLog(content, Number.MAX_SAFE_INTEGER)) {
    if (entry.kind === 'ingest') return entry.day;
  }
  return null;
}
