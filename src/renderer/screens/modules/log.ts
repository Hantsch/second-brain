/* Make `wiki/log.md` readable.

   The format lives in docs/MODULE-SCHEMA.md and is deliberately greppable:

     ## [2026-08-10] ingest | Auth0 RBAC Guide
     - summary: wiki/sources/s-2026-08-10-auth0-rbac-guide.md
     - touched: [[auth0]], [[role-based-access-control]], index.md
     - notes: contradicts [[old-role-concept]] regarding inheritance

   Why here and not in the core: the renderer never imports `src/core/**`
   (the architecture's one-way rule), and a dedicated IPC channel just to
   display the chronicle would be an extension of the contract. The field
   names are data format, not UI — that's why they stay in English; only
   their label gets translated. */

/** The three occasions a module logs. */
export type LogKind = 'ingest' | 'query' | 'lint';

export interface LogEntry {
  day: string;
  kind: LogKind;
  title: string | null;
  /** `- key: value` in the order they appear in the file. */
  fields: { key: string; value: string }[];
}

const HEADING = /^##\s*\[(\d{4}-\d{2}-\d{2})\]\s*(ingest|query|lint)\s*(?:\|\s*(.*))?$/;
const FIELD = /^-\s*([a-z][a-z ]*):\s*(.*)$/i;

/** A piece of a field line: text or a reference. */
export interface LogPart {
  text: string;
  /** Set when the piece is a wikilink. */
  target: string | null;
}

const WIKILINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g;

/**
 * Split a field line into text and references. Even `notes` carries
 * wikilinks ("contradicts [[old-token-concept]]") — leaving them as raw
 * brackets would be only half-processed.
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

/** Wikilinks and paths of a field line, in order of appearance. */
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
 * The entries, most recent first. A block nobody understands is skipped
 * rather than guessed at — hand-written lines stay in the file even if the
 * display doesn't recognize them.
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

/** Label for a field; unknown fields keep their name. */
export function fieldLabelKey(key: string): string {
  if (key === 'summary') return 'log.summary';
  if (key === 'touched') return 'log.touched';
  if (key === 'notes') return 'log.notes';
  if (key === 'answered from') return 'log.answeredFrom';
  if (key === 'filed back') return 'log.filedBack';
  if (key === 'findings') return 'log.findings';
  return key;
}

/** Fields whose value consists of references. */
export function isRefField(key: string): boolean {
  return key === 'touched' || key === 'answered from';
}
