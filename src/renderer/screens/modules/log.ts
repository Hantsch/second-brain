/* `wiki/log.md` lesbar machen.

   Das Format steht in docs/MODULE-SCHEMA.md und ist bewusst greppbar:

     ## [2026-08-10] ingest | Auth0 RBAC Guide
     - summary: wiki/sources/s-2026-08-10-auth0-rbac-guide.md
     - touched: [[auth0]], [[rollenbasierte-zugriffskontrolle]], index.md
     - notes: widerspricht [[altes-rollenkonzept]] bei der Vererbung

   Warum hier und nicht im Kern: der Renderer importiert `src/core/**` nicht (die
   eine Richtung der Architektur), und einen eigenen IPC-Kanal nur zum Anzeigen
   der Chronik wäre eine Erweiterung des Vertrags. Die Feldnamen sind Datenformat,
   nicht Oberfläche — deshalb bleiben sie englisch, übersetzt wird ihre
   Beschriftung. */

/** Die drei Anlässe, die ein Modul protokolliert. */
export type LogKind = 'ingest' | 'query' | 'lint';

export interface LogEntry {
  day: string;
  kind: LogKind;
  title: string | null;
  /** `- key: value` in der Reihenfolge der Datei. */
  fields: { key: string; value: string }[];
}

const HEADING = /^##\s*\[(\d{4}-\d{2}-\d{2})\]\s*(ingest|query|lint)\s*(?:\|\s*(.*))?$/;
const FIELD = /^-\s*([a-z][a-z ]*):\s*(.*)$/i;

/** Ein Stück einer Feldzeile: Text oder ein Verweis. */
export interface LogPart {
  text: string;
  /** Gesetzt, wenn das Stück ein Wikilink ist. */
  target: string | null;
}

const WIKILINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g;

/**
 * Eine Feldzeile in Text und Verweise zerlegen. Auch `notes` trägt Wikilinks
 * („widerspricht [[altes-token-konzept]]") — sie als rohe Klammern stehen zu
 * lassen wäre eine halbe Aufbereitung.
 */
export function partsOf(value: string): LogPart[] {
  const parts: LogPart[] = [];
  let last = 0;
  WIKILINK.lastIndex = 0;
  for (let match = WIKILINK.exec(value); match !== null; match = WIKILINK.exec(value)) {
    if (match.index > last) parts.push({ text: value.slice(last, match.index), target: null });
    const target = (match[1] ?? '').trim();
    const label = (match[2] ?? '').trim();
    parts.push({ text: label.length > 0 ? label : target, target });
    last = match.index + match[0].length;
  }
  if (last < value.length) parts.push({ text: value.slice(last), target: null });
  return parts;
}

/** Wikilinks und Pfade einer Feldzeile, in der Reihenfolge des Auftretens. */
export function refsOf(value: string): { target: string; wiki: boolean }[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const wiki = /^\[\[.+\]\]$/.test(part);
      return { target: wiki ? part.slice(2, -2).trim() : part, wiki };
    });
}

/**
 * Die Einträge, jüngster zuerst. Ein Block, den niemand versteht, wird
 * übersprungen statt geraten — von Hand geschriebene Zeilen bleiben in der Datei,
 * auch wenn die Anzeige sie nicht kennt.
 */
export function parseLog(content: string | null, limit = 30): LogEntry[] {
  const entries: LogEntry[] = [];
  if (content === null) return entries;
  let current: LogEntry | null = null;
  for (const raw of content.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = HEADING.exec(line);
    if (heading !== null) {
      const title = (heading[3] ?? '').trim();
      current = {
        day: heading[1] ?? '',
        kind: (heading[2] ?? 'ingest') as LogKind,
        title: title.length > 0 ? title : null,
        fields: [],
      };
      entries.push(current);
      continue;
    }
    if (current === null || line.trim().length === 0) continue;
    if (line.startsWith('## ')) {
      current = null;
      continue;
    }
    const field = FIELD.exec(line);
    if (field === null) continue;
    current.fields.push({
      key: (field[1] ?? '').toLowerCase().trim(),
      value: (field[2] ?? '').trim(),
    });
  }
  entries.reverse();
  return entries.slice(0, Math.max(0, limit));
}

/** Beschriftung eines Feldes; unbekannte Felder behalten ihren Namen. */
export function fieldLabelKey(key: string): string {
  if (key === 'summary') return 'log.summary';
  if (key === 'touched') return 'log.touched';
  if (key === 'notes') return 'log.notes';
  if (key === 'answered from') return 'log.answeredFrom';
  if (key === 'filed back') return 'log.filedBack';
  if (key === 'findings') return 'log.findings';
  return key;
}

/** Felder, deren Wert aus Verweisen besteht. */
export function isRefField(key: string): boolean {
  return key === 'touched' || key === 'answered from';
}
