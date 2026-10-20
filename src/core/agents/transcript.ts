/**
 * One page of a session transcript — the same `TranscriptEntry` rows out of two
 * different on-disk formats.
 *
 * ## Why paging, and why by bytes
 *
 * A Claude session file runs into megabytes; a Codex rollout routinely reaches
 * ~370 KB (measured, story 001). The dashboard readers next door
 * (`readSessionFacts` in `@core/claude` and `@core/codex`) get away with a head
 * plus a tail window because they only need facts from the file's edges. A
 * transcript view needs the whole conversation — but it must never hold the whole
 * file. So this module walks the file forward in **one bounded read per page**:
 *
 * - exactly one `readRange` call per `readTranscriptPage`, of at most
 *   `TRANSCRIPT_PAGE_BYTES`. No loop, no "just this once" whole-file read, no
 *   accumulation across pages. That single bound *is* the freeze prevention this
 *   module exists for, so tests/core/agents/transcript.test.ts asserts the
 *   requested `length` directly instead of inferring it from a timing.
 * - a page ends after the **last complete line** in that window, and the cursor
 *   points at the byte right behind it. The next page therefore starts on a line
 *   boundary and nothing is parsed twice. A window ending mid-line simply does
 *   not consume that line; it is read again, from its own start, next page.
 * - consequently a page's size in *entries* varies with where line boundaries
 *   fall. That is expected: the byte budget is the invariant, the entry count is
 *   not — which is also why `totalKnown` is only ever `true` for a page that
 *   covered the file on its own.
 *
 * ## Page size
 *
 * `TRANSCRIPT_PAGE_BYTES` is 128 KB — deliberately larger than the summary
 * windows beside it (`HEAD_BYTES` 64 KB, `CODEX_HEAD_BYTES` 48 KB), because the
 * purpose differs: those buy the first few fact-bearing lines, this one buys
 * readable conversation. 128 KB clears Codex's ~18 KB `session_meta` line with
 * room for a hundred-odd turns behind it, keeps a 370 KB rollout at three pages
 * and a 5 MB Claude session at forty, and is still small enough that a single
 * read cannot stall the UI. It is also wide enough that nearly every individual
 * record — including a pasted file or a fat tool result — fits inside one page,
 * which matters because of the next paragraph.
 *
 * ## Overlong lines
 *
 * A single JSONL line can exceed the page budget (a huge tool result). Reading it
 * whole would break the budget, so instead the page consumes nothing, returns no
 * entries, and hands back a cursor marked as mid-line (`<offset>+`); the next
 * page drops that line's leftover tail and carries on. The record is skipped, not
 * partially invented (guardrail 3), and paging keeps moving — an empty page with
 * a non-null cursor means "still scanning", not "done".
 *
 * ## What becomes an entry
 *
 * Condensed, per story 001's resolved open question on transcript depth: user and
 * assistant turns in full, one collapsed row per tool call (name + target, the
 * full call in `raw` for the view to expand), one row per tool result, and
 * **nothing at all** for reasoning or bookkeeping records. A Claude assistant
 * record carrying text *and* tool calls becomes several rows, never one merged
 * row. Codex `event_msg` records are dropped too: `user_message` is the CLI's own
 * echo of the `response_item` message right next to it, and emitting both would
 * show every prompt twice.
 *
 * Ids use the record's own identity where the format provides one (Claude `uuid`,
 * Codex `call_id`), otherwise `<page offset>:<record>` plus a block suffix — a
 * position, honestly synthetic, and stable when the same page is fetched again.
 * `at` is the record's own timestamp or `null`, never a substituted one.
 */

import type {
  AgentKind,
  TranscriptEntry,
  TranscriptEntryKind,
  TranscriptPage,
} from '@shared/types';
import type { ClaudeFileInfo, ClaudeRecord } from '@core/claude';
import {
  clip,
  isPrompt,
  parseJsonlChunk as parseClaudeLines,
  recordText as claudeText,
  toolCallsOf,
  toolResultOf,
} from '@core/claude';
import type { CodexRecord } from '@core/codex';
import {
  isReasoning,
  isSemantic as isCodexMessage,
  isUserTurn as isCodexUserTurn,
  parseJsonlChunk as parseCodexLines,
  recordText as codexText,
  toolCallOf,
  toolOutputOf,
} from '@core/codex';
import type { AgentFileSystem } from './types';

/** Byte budget of one page, and the cap on every single read — see the file header. */
export const TRANSCRIPT_PAGE_BYTES = 128 * 1024;

/** How long the collapsed one-line target of a tool call may get. */
export const MAX_TOOL_TARGET_CHARS = 160;

/**
 * The session file to page through. Resolving `sessionId`/`projectKey` to a path
 * is the caller's job (the IPC wiring), not this module's — it only ever reads
 * the file it is handed, which keeps it testable without a session store.
 */
export interface TranscriptSource {
  agent: AgentKind;
  file: ClaudeFileInfo;
}

export interface TranscriptPageOptions {
  /** Override the byte budget. Tests use it; production keeps the default. */
  pageBytes?: number;
}

/**
 * Where a page resumes. Encoded as the decimal byte offset, with a trailing `+`
 * when that offset is known to sit inside a line (only the overlong-line case
 * produces one). Opaque to callers by contract (`TranscriptPage.nextCursor`) —
 * kept a readable number anyway, so a bug report can quote it.
 */
interface Cursor {
  offset: number;
  midLine: boolean;
}

function parseCursor(cursor: string | null | undefined): Cursor {
  if (cursor === null || cursor === undefined) return { offset: 0, midLine: false };
  const midLine = cursor.endsWith('+');
  const offset = Number.parseInt(midLine ? cursor.slice(0, -1) : cursor, 10);
  // A cursor we did not write is not worth guessing about: start over at byte 0
  // rather than at some invented offset.
  if (!Number.isFinite(offset) || offset < 0) return { offset: 0, midLine: false };
  return { offset, midLine };
}

function encodeCursor(offset: number, midLine: boolean): string {
  return midLine ? `${offset}+` : `${offset}`;
}

/**
 * Bytes this text occupies as UTF-8. The cursor is a byte offset while a JS
 * string's `length` counts UTF-16 units, so the two must never be confused —
 * getting this wrong would drift the cursor on every non-ASCII character. Same
 * computation as `byteLength` in `../vault/hash.ts`, kept local on purpose:
 * pulling the vault barrel (store, watcher) in for a one-line utility would be
 * the wrong dependency.
 */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** The honest "nothing here" page — for an empty file, a missing one, or a spent cursor. */
function emptyPage(totalKnown: boolean): TranscriptPage {
  return { entries: [], nextCursor: null, totalKnown };
}

/**
 * One page of the transcript, starting where `cursor` left off (`null` = the
 * file's beginning). Never throws for a file that is merely empty, unreadable or
 * gone — that is an empty page, not an error (guardrail 1).
 */
export async function readTranscriptPage(
  fs: AgentFileSystem,
  source: TranscriptSource,
  cursor: string | null = null,
  options: TranscriptPageOptions = {},
): Promise<TranscriptPage> {
  const pageBytes = options.pageBytes ?? TRANSCRIPT_PAGE_BYTES;
  const { file } = source;
  const { offset, midLine } = parseCursor(cursor);
  const fromStart = offset === 0 && !midLine;
  if (file.size <= 0 || offset >= file.size) return emptyPage(fromStart);

  const length = Math.min(pageBytes, file.size - offset);
  const window = await fs.readRange(file.path, offset, length);
  if (window.length === 0) return emptyPage(fromStart);

  // The window reaches the file's end exactly when the budget covered whatever
  // was left of it — the same `start + length >= size` test the head/tail reader
  // in `../codex/jsonl.ts` uses to tell our own cutoff from the file's real end.
  const reachesEnd = offset + length >= file.size;
  const lastBreak = window.lastIndexOf('\n');
  if (!reachesEnd && lastBreak === -1) {
    const stepped = byteLength(window);
    if (stepped <= 0) return emptyPage(fromStart);
    // One line wider than the whole budget: consume nothing, step over the
    // window, and let the next page drop the rest of that line. If the window cut
    // a multi-byte character in half, `stepped` overshoots by the one or two
    // continuation bytes the replacement character stands in for — harmless here,
    // since continuation bytes are never `\n`, so no line end can be stepped over.
    return { entries: [], nextCursor: encodeCursor(offset + stepped, true), totalKnown: false };
  }

  const consumed = reachesEnd ? window : window.slice(0, lastBreak + 1);
  return {
    entries: entriesOf(source.agent, consumed, midLine, offset),
    nextCursor: reachesEnd ? null : encodeCursor(offset + byteLength(consumed), false),
    // Only a page that started at byte 0 *and* ran to the file's end has seen
    // every entry there is; any other page is one window out of several and says
    // so, instead of claiming a total it never counted.
    totalKnown: fromStart && reachesEnd,
  };
}

function entriesOf(
  agent: AgentKind,
  text: string,
  midLine: boolean,
  offset: number,
): TranscriptEntry[] {
  // A broken line is skipped, never thrown on; `dropFirstPartial` only matters
  // when the cursor deliberately points into a line (overlong-line case).
  const parse = { dropFirstPartial: midLine, dropLastPartial: true };
  if (agent === 'claude') {
    const chunk = parseClaudeLines(text, parse);
    return chunk.records.flatMap((record, index) => claudeEntries(record, `${offset}:${index}`));
  }
  const chunk = parseCodexLines(text, parse);
  return chunk.records.flatMap((record, index) => codexEntries(record, `${offset}:${index}`));
}

interface EntryParts {
  text?: string | null;
  toolName?: string | null;
  toolTarget?: string | null;
  raw?: unknown;
}

function entry(
  kind: TranscriptEntryKind,
  id: string,
  at: string | null,
  parts: EntryParts,
): TranscriptEntry {
  return {
    id,
    kind,
    at,
    text: parts.text ?? null,
    toolName: parts.toolName ?? null,
    toolTarget: parts.toolTarget ?? null,
    raw: parts.raw === undefined ? null : parts.raw,
  };
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * One Claude record → its rows. A prompt or an assistant text is one row; every
 * `tool_use` block of the same record is its own collapsed row, in block order,
 * behind that text. Tool results are their own row. Everything else — meta,
 * `summary`, `last-prompt` and any unknown type — produces nothing.
 */
function claudeEntries(record: ClaudeRecord, fallbackId: string): TranscriptEntry[] {
  const at = str(record.timestamp);
  const id = str(record.uuid) ?? fallbackId;

  const result = toolResultOf(record);
  if (result !== null) return [entry('tool-result', id, at, { raw: result.raw })];

  if (isPrompt(record)) {
    const text = claudeText(record);
    return text === null ? [] : [entry('user', id, at, { text })];
  }
  if (record.type !== 'assistant') return [];

  const rows: TranscriptEntry[] = [];
  const text = claudeText(record);
  if (text !== null) rows.push(entry('assistant', id, at, { text }));
  const calls = toolCallsOf(record);
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index]!;
    rows.push(
      entry('tool-call', call.id ?? `${id}:tool:${index}`, at, {
        toolName: call.name,
        toolTarget: clip(call.target, MAX_TOOL_TARGET_CHARS),
        raw: call.raw,
      }),
    );
  }
  return rows;
}

/**
 * One Codex record → its rows. `response_item`/`message` with role `user` or
 * `assistant` is one row, a `function_call`/`custom_tool_call` one collapsed row,
 * its `*_output` one result row. `reasoning`, `session_meta`, `turn_context` and
 * every `event_msg` (including `user_message`, which duplicates the message
 * record beside it) produce nothing.
 */
function codexEntries(record: CodexRecord, fallbackId: string): TranscriptEntry[] {
  if (isReasoning(record)) return [];
  const at = str(record.timestamp);

  const call = toolCallOf(record);
  if (call !== null) {
    return [
      entry('tool-call', call.callId ?? fallbackId, at, {
        toolName: call.name,
        toolTarget: clip(call.target, MAX_TOOL_TARGET_CHARS),
        raw: call.raw,
      }),
    ];
  }
  const output = toolOutputOf(record);
  if (output !== null) {
    const id = output.callId === null ? fallbackId : `${output.callId}:out`;
    return [entry('tool-result', id, at, { raw: output.raw })];
  }

  if (!isCodexMessage(record)) return [];
  const text = codexText(record);
  if (text === null) return [];
  return [entry(isCodexUserTurn(record) ? 'user' : 'assistant', fallbackId, at, { text })];
}
