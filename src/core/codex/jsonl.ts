/**
 * Read a Codex rollout file without loading it whole.
 *
 * Same problem as `../claude/jsonl.ts`, different geometry: a Codex session
 * can be hundreds of KB, but its **first line alone** is already ~18 KB —
 * `session_meta` carries the CLI's full `base_instructions` text (measured on
 * the fixtures in tests/fixtures/codex/: 18 039 bytes; lines 2-11 of the same
 * file run 165-374 bytes). Claude's `HEAD_BYTES` (64 KB) / `HEAD_LINES` (20)
 * would work here too, but the sizing below is chosen for Codex specifically
 * so the reasoning travels with the numbers instead of being borrowed:
 *
 * - `CODEX_HEAD_BYTES` = 48 KB: comfortably more than one ~18 KB
 *   `session_meta` line, leaving ~30 KB of headroom — at the fixture's
 *   per-line size that is another ~100 records, far more than the handful of
 *   turns (`turn_context`, the first user message, the first assistant reply)
 *   needed to read `cwd`, `model` and a first prompt.
 * - `CODEX_HEAD_LINES` = 40: generous on top of the byte budget, because once
 *   past the giant first line, Codex records are cheap to count.
 * - `CODEX_TAIL_BYTES` = 32 KB: the tail only needs the last few turns plus a
 *   trailing `token_count` event, all of which are small; unlike Claude's
 *   tail, there is no large pasted-file blob to budget for.
 *
 * Two failure modes are expected, not exceptional — but only one of them is
 * silently dropped:
 * - a **half-read first line**, because a tail window started mid-line — this
 *   is an artifact of where *we* chose to start reading, not a fact about the
 *   file, so it is discarded without counting anything;
 * - a **genuinely broken line at the true end of the file** (Codex was still
 *   writing it) — counted as skipped, not thrown, because it is a fact about
 *   the file. The D3 fixture with a truncated last line exists to prove this:
 *   `readSessionFacts` must still read the rest of that file and report the
 *   break via `skippedLines`, not silently swallow it.
 * The distinction that matters is whether a window's end coincides with the
 * file's real end (`start + length >= file.size`, computed in `readWindow`)
 * — only when it does *not* (a head window stopped short by its byte budget)
 * is the last line assumed to be our own cutoff rather than real breakage.
 */

import type { ClaudeFileInfo } from '@core/claude';
import type { AgentFileSystem } from '@core/agents';
import { MAX_FIRST_PROMPT_CHARS, clip, normalizePath } from '@core/claude';
import type { CodexRecord } from './records';
import {
  cwdOf,
  contextWindowOf,
  gitBranchOf,
  isSemantic,
  isUserTurn,
  modelOf,
  recordText,
  sessionIdOf,
  totalTokensOf,
} from './records';

/** Head window in bytes — see the file header comment for the sizing rationale. */
export const CODEX_HEAD_BYTES = 48 * 1024;

/** How many lines of the head window are parsed into records. */
export const CODEX_HEAD_LINES = 40;

/** Tail window in bytes. */
export const CODEX_TAIL_BYTES = 32 * 1024;

export interface JsonlChunk {
  records: CodexRecord[];
  /** Non-empty lines in this window. */
  lines: number;
  /** Lines that weren't a JSON object (not counting the dropped half-lines). */
  skipped: number;
}

export interface ParseOptions {
  /** Drop the first line — this window started in the middle of a line. */
  dropFirstPartial: boolean;
  /**
   * If the last line isn't JSON, treat it as our own read cutoff instead of
   * real breakage and don't count it. Pass `false` when this window's end is
   * the file's true end — see the file header comment.
   */
  dropLastPartial: boolean;
  /** Stop after this many parsed records. */
  maxLines?: number;
}

function tryParse(line: string): CodexRecord | null {
  try {
    const value: unknown = JSON.parse(line);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as CodexRecord;
    }
    return null;
  } catch {
    return null;
  }
}

/** One text window turned into records. Never throws. */
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
  fs: AgentFileSystem,
  file: ClaudeFileInfo,
  start: number,
  length: number,
  options: { maxLines?: number },
): Promise<Window> {
  const text = await fs.readRange(file.path, start, length);
  // Only a window that stops short of the file's real end can have cut a
  // line mid-way by our own choice; one that reaches the end reports the
  // file's actual last line, broken or not.
  const reachesFileEnd = start + length >= file.size;
  const chunk = parseJsonlChunk(text, {
    dropFirstPartial: start > 0,
    dropLastPartial: !reachesFileEnd,
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
 * What a Codex session file states, read from its head and tail windows.
 * `null` throughout means "not present in the windows that were read" — not
 * "absent from the session" (guardrail 3). Codex records no subagent
 * concept at all; that fact belongs to whichever layer unifies this onto
 * `AgentSessionSummary` (a later deliverable), not to this type.
 */
export interface CodexSessionFacts {
  /** `session_id` from `session_meta`, or `null` if that record wasn't read. */
  sessionId: string | null;
  /** Working directory, as `session_meta`/`turn_context` state it. */
  cwd: string | null;
  gitBranch: string | null;
  /** Timestamp of the first record read. */
  startedAt: string | null;
  /** Timestamp of the last record read. */
  lastActivity: string | null;
  /** Count of `response_item`/`message` records with role `user` or `assistant`. */
  messageCount: number;
  /** Was `messageCount` counted exactly (the windows covered the file) or estimated? */
  messageCountExact: boolean;
  /** First user turn in the head window, cleaned and clipped. */
  firstPrompt: string | null;
  /** Model name from the most recent `turn_context` read. */
  model: string | null;
  /** Cumulative tokens used, from the most recent `token_count` event read. */
  contextTokens: number | null;
  /** Context window size Codex last reported, or configured in `session_meta`. */
  contextWindow: number | null;
  /** Records actually read — 0 means no session trail at all. */
  records: number;
  /** Lines that weren't JSON and were skipped. */
  skippedLines: number;
  /** Bytes read to produce these facts. */
  bytesRead: number;
}

/** Empty facts — the honest state of an empty or unreadable file. */
export function emptyCodexFacts(): CodexSessionFacts {
  return {
    sessionId: null,
    cwd: null,
    gitBranch: null,
    startedAt: null,
    lastActivity: null,
    messageCount: 0,
    messageCountExact: true,
    firstPrompt: null,
    model: null,
    contextTokens: null,
    contextWindow: null,
    records: 0,
    skippedLines: 0,
    bytesRead: 0,
  };
}

/**
 * The facts of a Codex session file, from its head and tail. A zero-byte or
 * otherwise empty file yields `records: 0` up front, without attempting a
 * read — the caller decides that this is not a work trail at all.
 */
export async function readSessionFacts(
  fs: AgentFileSystem,
  file: ClaudeFileInfo,
  options: FactsOptions = {},
): Promise<CodexSessionFacts> {
  if (file.size <= 0) return emptyCodexFacts();
  const headBytes = options.headBytes ?? CODEX_HEAD_BYTES;
  const headLines = options.headLines ?? CODEX_HEAD_LINES;
  const tailBytes = options.tailBytes ?? CODEX_TAIL_BYTES;

  // Small file: read it in one pass, count everything exactly.
  if (file.size <= headBytes + tailBytes) {
    const whole = await readWindow(fs, file, 0, file.size, {});
    return facts(whole, whole, file, headLines, true);
  }

  const head = await readWindow(fs, file, 0, headBytes, { maxLines: headLines });
  const tail = await readWindow(fs, file, file.size - tailBytes, tailBytes, {});
  return facts(head, tail, file, headLines, false);
}

function firstOf<T>(
  records: readonly CodexRecord[],
  pick: (record: CodexRecord) => T | null,
): T | null {
  for (const record of records) {
    const value = pick(record);
    if (value !== null) return value;
  }
  return null;
}

function lastOf<T>(
  records: readonly CodexRecord[],
  pick: (record: CodexRecord) => T | null,
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

/**
 * Message count. If the windows covered the whole file it is exact; otherwise
 * it is estimated from the tail's message density — same approach as
 * Claude's `messageCount` in `../claude/jsonl.ts` — and never smaller than
 * what was actually counted in the two windows.
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
): CodexSessionFacts {
  const headRecords = exact ? head.chunk.records.slice(0, headLines) : head.chunk.records;
  const all = exact ? head.chunk.records : [...head.chunk.records, ...tail.chunk.records];
  if (all.length === 0) {
    return {
      ...emptyCodexFacts(),
      skippedLines: exact ? head.chunk.skipped : head.chunk.skipped + tail.chunk.skipped,
      bytesRead: exact ? head.bytes : head.bytes + tail.bytes,
    };
  }

  const cwd = firstOf(head.chunk.records, cwdOf) ?? lastOf(tail.chunk.records, cwdOf);
  const prompt = firstOf(headRecords, (record) => (isUserTurn(record) ? recordText(record) : null));

  return {
    sessionId: firstOf(all, sessionIdOf),
    cwd: cwd === null ? null : normalizePath(cwd),
    gitBranch: firstOf(all, gitBranchOf),
    startedAt: firstOf(head.chunk.records, (record) => text(record.timestamp)),
    lastActivity:
      lastOf(tail.chunk.records, (record) => text(record.timestamp)) ??
      lastOf(head.chunk.records, (record) => text(record.timestamp)),
    messageCount: messageCount(head, tail, file.size, exact),
    messageCountExact: exact,
    firstPrompt: clip(prompt, MAX_FIRST_PROMPT_CHARS),
    model: lastOf(tail.chunk.records, modelOf) ?? lastOf(head.chunk.records, modelOf),
    contextTokens:
      lastOf(tail.chunk.records, totalTokensOf) ?? lastOf(head.chunk.records, totalTokensOf),
    contextWindow:
      lastOf(tail.chunk.records, contextWindowOf) ?? lastOf(head.chunk.records, contextWindowOf),
    records: all.length,
    skippedLines: exact ? head.chunk.skipped : head.chunk.skipped + tail.chunk.skipped,
    bytesRead: exact ? head.bytes : head.bytes + tail.bytes,
  };
}
