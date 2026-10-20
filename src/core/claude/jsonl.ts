/**
 * JSONL lesen, ohne die Datei zu laden.
 *
 * Eine Verlaufsdatei kann Megabytes gross sein; gebraucht werden aber nur zwei
 * Fenster: der **Kopf** (die ersten Zeilen tragen `cwd`, Startzeit und die erste
 * Nutzer-Nachricht) und das **Ende** (letzte Aktivitaet, Branch, aktuelle
 * Nachrichtendichte). Passt die Datei in beide Fenster zusammen, wird sie in einem
 * Zug gelesen und alles ist gezaehlt statt geschaetzt.
 *
 * Zwei Fehlerarten sind erwartbar, nicht aussergewoehnlich (RESEARCH.md §5.2):
 * - **halbe letzte Zeile**, weil Claude noch schreibt → wird verworfen,
 * - **halbe erste Zeile**, weil das Endfenster mitten in einer Zeile beginnt → wird
 *   verworfen.
 * Alles andere, was kein JSON ist, wird gezaehlt und uebersprungen — nie geworfen.
 */

import type { ClaudeFileInfo, ClaudeFileSystem, SessionFacts } from './types';
import {
  HEAD_BYTES,
  HEAD_LINES,
  MAX_FIRST_PROMPT_CHARS,
  MAX_SESSION_FILES,
  MAX_SUMMARY_CHARS,
  TAIL_BYTES,
  emptyFacts,
} from './types';
import type { ClaudeRecord } from './records';
import {
  cleanPromptText,
  clip,
  contextTokensOf,
  isPrompt,
  isSemantic,
  modelOf,
  recordText,
  subagentTypesOf,
  summaryOf,
  toolFilePaths,
} from './records';
import { isPathInside, normalizePath } from './paths';

export interface JsonlChunk {
  records: ClaudeRecord[];
  /** Nicht leere Zeilen im Fenster. */
  lines: number;
  /** Zeilen, die kein JSON-Objekt waren (ohne die verworfenen Torsi). */
  skipped: number;
}

export interface ParseOptions {
  /** Erste Zeile verwerfen — das Fenster begann mitten in einer Zeile. */
  dropFirstPartial: boolean;
  /** Letzte Zeile verwerfen, wenn sie kein JSON ist (halbgeschriebener Torso). */
  dropLastPartial: boolean;
  /** Nach so vielen gedeuteten Zeilen aufhoeren. */
  maxLines?: number;
}

function tryParse(line: string): ClaudeRecord | null {
  try {
    const value: unknown = JSON.parse(line);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as ClaudeRecord;
    }
    return null;
  } catch {
    return null;
  }
}

/** Ein Textfenster in Records. Wirft nie. */
export function parseJsonlChunk(chunk: string, options: ParseOptions): JsonlChunk {
  let text = chunk;
  if (options.dropFirstPartial) {
    const first = text.indexOf('\n');
    text = first === -1 ? '' : text.slice(first + 1);
  }
  const lines = text.split('\n');
  const result: JsonlChunk = { records: [], lines: 0, skipped: 0 };
  const max = options.maxLines ?? Number.POSITIVE_INFINITY;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]!;
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim().length === 0) continue;
    result.lines += 1;
    const record = tryParse(line);
    if (record === null) {
      const last = index === lines.length - 1;
      if (!(last && options.dropLastPartial)) result.skipped += 1;
      continue;
    }
    result.records.push(record);
    if (result.records.length >= max) break;
  }
  return result;
}

interface Window {
  chunk: JsonlChunk;
  bytes: number;
}

async function readWindow(
  fs: ClaudeFileSystem,
  file: ClaudeFileInfo,
  start: number,
  length: number,
  options: { maxLines?: number },
): Promise<Window> {
  const text = await fs.readRange(file.path, start, length);
  const chunk = parseJsonlChunk(text, {
    dropFirstPartial: start > 0,
    dropLastPartial: true,
    ...(options.maxLines === undefined ? {} : { maxLines: options.maxLines }),
  });
  return { chunk, bytes: text.length === 0 ? 0 : length };
}

export interface FactsOptions {
  headBytes?: number;
  headLines?: number;
  tailBytes?: number;
}

/**
 * Die Fakten einer Verlaufsdatei aus Kopf und Ende. Eine leere oder voellig
 * unlesbare Datei liefert `records: 0` — der Aufrufer entscheidet, dass das keine
 * Arbeitsspur ist.
 */
export async function readSessionFacts(
  fs: ClaudeFileSystem,
  file: ClaudeFileInfo,
  options: FactsOptions = {},
): Promise<SessionFacts> {
  if (file.size <= 0) return emptyFacts();
  const headBytes = options.headBytes ?? HEAD_BYTES;
  const headLines = options.headLines ?? HEAD_LINES;
  const tailBytes = options.tailBytes ?? TAIL_BYTES;

  // Kleine Datei: ein Zug, alles gezaehlt.
  if (file.size <= headBytes + tailBytes) {
    const whole = await readWindow(fs, file, 0, file.size, {});
    return facts(whole, whole, file, headLines, true);
  }

  const head = await readWindow(fs, file, 0, headBytes, { maxLines: headLines });
  const tail = await readWindow(fs, file, file.size - tailBytes, tailBytes, {});
  return facts(head, tail, file, headLines, false);
}

function firstOf<T>(
  records: readonly ClaudeRecord[],
  pick: (record: ClaudeRecord) => T | null,
): T | null {
  for (const record of records) {
    const value = pick(record);
    if (value !== null) return value;
  }
  return null;
}

function lastOf<T>(
  records: readonly ClaudeRecord[],
  pick: (record: ClaudeRecord) => T | null,
): T | null {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const value = pick(records[index]!);
    if (value !== null) return value;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Haeufigste Dateipfade, haeufigste zuerst; bei Gleichstand die zuerst gesehene. */
function frequentFiles(records: readonly ClaudeRecord[], cwd: string | null): string[] {
  const counts = new Map<string, { count: number; first: number; label: string }>();
  let seen = 0;
  for (const record of records) {
    for (const path of toolFilePaths(record)) {
      seen += 1;
      const key = normalizePath(path).toLowerCase();
      const known = counts.get(key);
      if (known === undefined)
        counts.set(key, { count: 1, first: seen, label: shorten(path, cwd) });
      else known.count += 1;
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, MAX_SESSION_FILES)
    .map((entry) => entry.label);
}

/** Pfade innerhalb des Arbeitsverzeichnisses werden relativ gezeigt. */
function shorten(path: string, cwd: string | null): string {
  const normalized = normalizePath(path);
  if (cwd === null || !isPathInside(normalized, cwd)) return normalized;
  const relative = normalized.slice(normalizePath(cwd).length).replace(/^\/+/, '');
  return relative.length > 0 ? relative : normalized;
}

/**
 * Distinkte `subagent_type`-Werte ueber alle gelesenen Records, zuerst gesehen
 * zuerst. `null` heisst: keiner in den gelesenen Fenstern gesehen — nicht "0
 * Subagenten" (gleiche Unterscheidung wie bei `AgentSessionSummary.subagents`).
 */
function subagentsSeen(records: readonly ClaudeRecord[]): string[] | null {
  const seen: string[] = [];
  for (const record of records) {
    for (const type of subagentTypesOf(record)) {
      if (!seen.includes(type)) seen.push(type);
    }
  }
  return seen.length > 0 ? seen : null;
}

/**
 * Nachrichtenzahl. Deckten die Fenster die Datei ab, ist sie gezaehlt. Sonst wird
 * sie ueber die Nachrichtendichte des Endfensters geschaetzt — und niemals kleiner
 * als das, was tatsaechlich gesehen wurde.
 */
function messageCount(head: Window, tail: Window, size: number, exact: boolean): number {
  const seen = exact
    ? head.chunk.records.filter(isSemantic).length
    : head.chunk.records.filter(isSemantic).length + tail.chunk.records.filter(isSemantic).length;
  if (exact) return seen;
  const inTail = tail.chunk.records.filter(isSemantic).length;
  if (inTail === 0 || tail.bytes <= 0) return seen;
  return Math.max(seen, Math.round((inTail / tail.bytes) * size));
}

function facts(
  head: Window,
  tail: Window,
  file: ClaudeFileInfo,
  headLines: number,
  exact: boolean,
): SessionFacts {
  const headRecords = exact ? head.chunk.records.slice(0, headLines) : head.chunk.records;
  const all = exact ? head.chunk.records : [...head.chunk.records, ...tail.chunk.records];
  if (all.length === 0) {
    return {
      ...emptyFacts(),
      skippedLines: exact ? head.chunk.skipped : head.chunk.skipped + tail.chunk.skipped,
      bytesRead: exact ? head.bytes : head.bytes + tail.bytes,
    };
  }

  const cwd =
    firstOf(head.chunk.records, (record) => text(record.cwd)) ??
    lastOf(tail.chunk.records, (record) => text(record.cwd));
  const prompt = firstOf(headRecords, (record) =>
    isPrompt(record) ? cleanPromptText(recordText(record)) : null,
  );
  const summary = lastOf(tail.chunk.records, summaryOf) ?? firstOf(head.chunk.records, summaryOf);

  return {
    sessionId: firstOf(all, (record) => text(record.sessionId)),
    cwd: cwd === null ? null : normalizePath(cwd),
    gitBranch:
      lastOf(tail.chunk.records, (record) => text(record.gitBranch)) ??
      firstOf(head.chunk.records, (record) => text(record.gitBranch)),
    startedAt: firstOf(head.chunk.records, (record) => text(record.timestamp)),
    lastActivity:
      lastOf(tail.chunk.records, (record) => text(record.timestamp)) ??
      lastOf(head.chunk.records, (record) => text(record.timestamp)),
    messageCount: messageCount(head, tail, file.size, exact),
    messageCountExact: exact,
    firstPrompt: clip(prompt, MAX_FIRST_PROMPT_CHARS),
    summary: clip(summary, MAX_SUMMARY_CHARS),
    files: frequentFiles(all, cwd),
    records: all.length,
    skippedLines: exact ? head.chunk.skipped : head.chunk.skipped + tail.chunk.skipped,
    bytesRead: exact ? head.bytes : head.bytes + tail.bytes,
    // Juengster Wert zuerst aus dem Endfenster, sonst aus dem Kopf — dieselbe
    // "letzter Wert gewinnt" Regel wie bei gitBranch/lastActivity oben.
    model: lastOf(tail.chunk.records, modelOf) ?? lastOf(head.chunk.records, modelOf),
    subagents: subagentsSeen(all),
    contextTokens:
      lastOf(tail.chunk.records, contextTokensOf) ?? lastOf(head.chunk.records, contextTokensOf),
  };
}
