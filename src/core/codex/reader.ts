/**
 * `CodexSessionReader` — the same idea as `../claude/reader.ts` (list directories,
 * sort files newest first, read head and tail, drop what carries no records), but
 * one level of directory structure deeper: Codex lays sessions out as
 * `<root>/YYYY/MM/DD/rollout-<iso>-<uuid>.jsonl` instead of Claude's flat
 * `<root>/<slug>/<id>.jsonl` (measured against a real `~/.codex/sessions`, see the
 * story's `## Plan`). There is no slug-decoding step here — Codex never encodes the
 * working directory into a folder name, so `cwd` comes straight from
 * `readSessionFacts` (`./jsonl.ts`), nothing to guess and verify against the disk.
 *
 * `session_index.jsonl` (session id → `thread_name`) is Codex's only source of a
 * session title. It lives one level above the sessions tree
 * (`~/.codex/session_index.jsonl`, sibling of `~/.codex/sessions/`), so its path is
 * derived from the sessions root's parent by default — pass `sessionIndexPath`
 * explicitly if a configured root doesn't literally end in `sessions`.
 *
 * Same discipline as Claude's reader: a missing directory is read as "no sessions
 * here", never as an error (guardrail 1); an empty or unreadable file is not a
 * session (`records === 0`); nothing here ever writes to the trail it reads
 * (guardrail 6 — this module only calls `listDirs`/`listFiles`/`readRange`, and
 * `AgentFileSystem` has no write method at all).
 */

import type { AgentFileSystem } from '@core/agents';
import type { ClaudeFileInfo, SessionListOptions } from '@core/claude';
import { DEFAULT_SESSION_LIMIT, READ_CONCURRENCY, TRANSCRIPT_EXTENSION } from '@core/claude';
import type { CodexSessionFacts, FactsOptions } from './jsonl';
import { CODEX_HEAD_BYTES, CODEX_HEAD_LINES, CODEX_TAIL_BYTES, readSessionFacts } from './jsonl';

export interface CodexReaderOptions {
  fs: AgentFileSystem;
  /** Root of the `YYYY/MM/DD` tree. Empty or missing = `~/.codex/sessions`. */
  sessionsDir?: string | null;
  /**
   * Explicit path to `session_index.jsonl`. Defaults to the sessions root's
   * parent directory plus that file name (see the file header comment). Set
   * this when a configured `sessionsDir` doesn't end in `sessions` — the
   * default guess would land in the wrong place.
   */
  sessionIndexPath?: string | null;
  headBytes?: number;
  headLines?: number;
  tailBytes?: number;
  /** So many files are read at once. */
  concurrency?: number;
}

/** The default location of the sessions tree when the setting is empty. */
export function codexSessionsDir(fs: AgentFileSystem, override?: string | null): string {
  const trimmed = override?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : fs.join(fs.homeDir(), '.codex', 'sessions');
}

/**
 * Best-effort guess at `session_index.jsonl` next to a sessions root: drop a
 * trailing `sessions` segment and add the file name. Correct for the real
 * Codex layout and for a root that mirrors it (e.g. the D3 fixtures'
 * `tests/fixtures/codex/sessions` next to `tests/fixtures/codex/session_index.jsonl`);
 * wrong for a root with a different name, which is what `sessionIndexPath`
 * is for.
 */
function defaultSessionIndexPath(fs: AgentFileSystem, sessionsRoot: string): string {
  const trimmed = sessionsRoot.replace(/[\\/]+$/, '');
  const parent = trimmed.replace(/[\\/]sessions$/i, '');
  return fs.join(parent.length > 0 ? parent : trimmed, 'session_index.jsonl');
}

/**
 * What the reader returns per session. Intentionally not `AgentSessionSummary`
 * yet — that unification (adding `agent`, `projectKey`, and a resolved
 * `vaultProject`) is D10's wiring job. This type carries everything that
 * wiring will need: the raw `cwd` for D7's `aggregateAgentProjects` (which
 * takes an unnormalized cwd per session, see `AgentProjectInput` in
 * `../agents/projects.ts`), plus the per-session facts the browser's session
 * row shows. `subagents` is hardcoded `null` — Codex's rollout format has no
 * such concept at all, so it is never omitted, only ever absent (guardrail 3:
 * unknown, not zero).
 */
export interface CodexSessionSummary {
  /** `session_id` from `session_meta`, or the file name without extension if absent. */
  id: string;
  /** Working directory as the session's records state it, or `null` if none did. */
  cwd: string | null;
  /** `thread_name` from `session_index.jsonl`, or `null` if unknown. */
  title: string | null;
  startedAt: string;
  lastActivity: string;
  /** `null` when it cannot be computed from the two timestamps above. */
  durationMs: number | null;
  messageCount: number;
  gitBranch: string | null;
  model: string | null;
  contextTokens: number | null;
  /** Always `null` — Codex records no subagent concept (see the type comment above). */
  subagents: null;
}

/** A candidate file plus enough context to build a summary from it. */
interface Candidate {
  file: ClaudeFileInfo;
}

/** Bytes read from `session_index.jsonl` — a session-id-to-title map, not a session trail. */
export const CODEX_INDEX_BYTES = 4 * 1024 * 1024;

/**
 * `session_id` → `thread_name` from `session_index.jsonl`. Missing file, unreadable
 * file, or a line that isn't a JSON object with both fields: silently absent from
 * the map — the caller reports those sessions' titles as `null`, never invented.
 */
async function readSessionIndex(
  fs: AgentFileSystem,
  path: string,
): Promise<ReadonlyMap<string, string>> {
  const text = await fs.readRange(path, 0, CODEX_INDEX_BYTES);
  const titles = new Map<string, string>();
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // Bookkeeping, not the session trail itself — not fatal.
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const record = parsed as { session_id?: unknown; thread_name?: unknown };
    const sessionId = typeof record.session_id === 'string' ? record.session_id : null;
    const threadName = typeof record.thread_name === 'string' ? record.thread_name.trim() : '';
    if (sessionId !== null && threadName.length > 0) titles.set(sessionId, threadName);
  }
  return titles;
}

/** Duration between two ISO timestamps, or `null` if either fails to parse or is negative. */
function durationOf(startedAt: string, lastActivity: string): number | null {
  const start = Date.parse(startedAt);
  const end = Date.parse(lastActivity);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return end - start;
}

function toSummary(
  candidate: Candidate,
  facts: CodexSessionFacts,
  titles: ReadonlyMap<string, string>,
): CodexSessionSummary {
  const id = facts.sessionId ?? candidate.file.name.slice(0, -TRANSCRIPT_EXTENSION.length);
  const lastActivity = facts.lastActivity ?? candidate.file.modified;
  const startedAt = facts.startedAt ?? lastActivity;
  return {
    id,
    cwd: facts.cwd,
    title: facts.sessionId === null ? null : (titles.get(facts.sessionId) ?? null),
    startedAt,
    lastActivity,
    durationMs: durationOf(startedAt, lastActivity),
    messageCount: facts.messageCount,
    gitBranch: facts.gitBranch,
    model: facts.model,
    contextTokens: facts.contextTokens,
    subagents: null,
  };
}

export class CodexSessionReader {
  private readonly fs: AgentFileSystem;
  private readonly concurrency: number;
  private readonly factsOptions: Required<FactsOptions>;
  private readonly sessionIndexPath: string;
  /** Root of the sessions tree, absolute. */
  readonly root: string;

  constructor(options: CodexReaderOptions) {
    this.fs = options.fs;
    this.root = codexSessionsDir(options.fs, options.sessionsDir ?? null);
    this.concurrency = Math.max(1, options.concurrency ?? READ_CONCURRENCY);
    this.factsOptions = {
      headBytes: options.headBytes ?? CODEX_HEAD_BYTES,
      headLines: options.headLines ?? CODEX_HEAD_LINES,
      tailBytes: options.tailBytes ?? CODEX_TAIL_BYTES,
    };
    const explicit = options.sessionIndexPath?.trim() ?? '';
    this.sessionIndexPath =
      explicit.length > 0 ? explicit : defaultSessionIndexPath(options.fs, this.root);
  }

  /**
   * The newest sessions. A missing sessions tree reads as an empty list, not an
   * error — on a machine without Codex CLI, or with the root misconfigured,
   * that is the truth (guardrail 1).
   */
  async list(options: SessionListOptions = {}): Promise<CodexSessionSummary[]> {
    const limit =
      options.limit === undefined || options.limit <= 0 ? DEFAULT_SESSION_LIMIT : options.limit;
    const candidates = await this.candidates(options.since);
    const chosen = candidates.slice(0, limit);

    const [facts, titles] = await Promise.all([
      this.readAll(chosen),
      readSessionIndex(this.fs, this.sessionIndexPath),
    ]);

    const sessions: CodexSessionSummary[] = [];
    for (let index = 0; index < chosen.length; index += 1) {
      const fact = facts[index]!;
      if (fact.records === 0) continue;
      sessions.push(toSummary(chosen[index]!, fact, titles));
    }
    sessions.sort((a, b) =>
      a.lastActivity === b.lastActivity
        ? a.id.localeCompare(b.id)
        : a.lastActivity < b.lastActivity
          ? 1
          : -1,
    );
    return sessions;
  }

  /**
   * The transcript file of a single session — what the transcript channel
   * needs (D10): `readTranscriptPage` wants `path`/`size`, which
   * `CodexSessionSummary` doesn't carry. Unlike Claude's rollout files, a
   * Codex file name is not the session id itself (`rollout-<iso>-<uuid>`),
   * so candidates are pre-filtered by the id appearing as the file name's
   * suffix — a property of the naming scheme, not a guess — before reading
   * facts (head and tail only, never the whole file) to confirm the match
   * against `session_meta`. Falls back to scanning every candidate for the
   * rare case a session carries no `session_id` at all. `null` if none
   * matches; never invented.
   */
  async findFile(sessionId: string): Promise<ClaudeFileInfo | null> {
    const candidates = await this.candidates();
    const likely = candidates.filter((candidate) =>
      candidate.file.name.endsWith(`${sessionId}${TRANSCRIPT_EXTENSION}`),
    );
    for (const candidate of likely.length > 0 ? likely : candidates) {
      const fact = await readSessionFacts(this.fs, candidate.file, this.factsOptions);
      if (fact.records === 0) continue;
      const id = fact.sessionId ?? candidate.file.name.slice(0, -TRANSCRIPT_EXTENSION.length);
      if (id === sessionId) return candidate.file;
    }
    return null;
  }

  /** Every `YYYY/MM/DD` day directory under the root, walked three levels deep. */
  private async dayDirs(): Promise<string[]> {
    const days: string[] = [];
    const years = (await this.fs.listDirs(this.root)).sort();
    for (const year of years) {
      const yearPath = this.fs.join(this.root, year);
      const months = (await this.fs.listDirs(yearPath)).sort();
      for (const month of months) {
        const monthPath = this.fs.join(yearPath, month);
        const monthDays = (await this.fs.listDirs(monthPath)).sort();
        for (const day of monthDays) days.push(this.fs.join(monthPath, day));
      }
    }
    return days;
  }

  /** All transcript files under the root, newest (by mtime) first. */
  private async candidates(since?: string): Promise<Candidate[]> {
    const found: Candidate[] = [];
    for (const dayDir of await this.dayDirs()) {
      const files = await this.fs.listFiles(dayDir);
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith(TRANSCRIPT_EXTENSION)) continue;
        if (file.size <= 0) continue;
        if (since !== undefined && file.modified < since) continue;
        found.push({ file });
      }
    }
    found.sort((a, b) =>
      a.file.modified === b.file.modified
        ? a.file.name.localeCompare(b.file.name)
        : a.file.modified < b.file.modified
          ? 1
          : -1,
    );
    return found;
  }

  /** Head and tail of the selected files, with limited concurrency. */
  private async readAll(candidates: readonly Candidate[]): Promise<CodexSessionFacts[]> {
    const facts: CodexSessionFacts[] = [];
    for (let start = 0; start < candidates.length; start += this.concurrency) {
      const batch = candidates.slice(start, start + this.concurrency);
      const read = await Promise.all(
        batch.map((candidate) => readSessionFacts(this.fs, candidate.file, this.factsOptions)),
      );
      facts.push(...read);
    }
    return facts;
  }
}
