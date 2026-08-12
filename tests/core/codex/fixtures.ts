/* Helpers for `CodexSessionReader` tests. Not a `.test.ts` file so vitest doesn't
 * collect it as a suite.
 *
 * Claude's own in-memory fake (`tests/core/claude/fixtures.ts`) only supports a
 * single flat directory level, because that is all `~/.claude/projects/<slug>/`
 * needs. Codex's tree is three levels deep (`YYYY/MM/DD`), so this fake is
 * generic over the full path instead: every entry carries its complete absolute
 * path, and `listDirs` walks whatever level it is asked about.
 */
import type { ClaudeFileInfo, ClaudeFileSystem } from '@core/claude';

export interface FakeCodexEntry {
  /** Full path, forward slashes, e.g. '/codex/sessions/2026/08/12/rollout-a.jsonl'. */
  path: string;
  text: string;
  /** mtime as ISO. */
  modified: string;
}

export interface FakeCodexFs extends ClaudeFileSystem {
  /** Log of every byte window read — proof that whole files are never loaded. */
  readonly reads: { path: string; start: number; length: number }[];
}

/** Slashes unified, no trailing slash — casing kept, since file names are case-sensitive. */
function unify(path: string): string {
  const unified = path.replace(/\\+/g, '/').replace(/\/+$/, '');
  return unified.length === 0 ? '/' : unified;
}

/** Comparison form — case-insensitive, same spirit as `@core/claude`'s `pathKey`. */
function key(path: string): string {
  return unify(path).toLowerCase();
}

function dirname(path: string): string {
  const unified = unify(path);
  const index = unified.lastIndexOf('/');
  return index <= 0 ? '/' : unified.slice(0, index);
}

function basename(path: string): string {
  const unified = unify(path);
  const index = unified.lastIndexOf('/');
  return index === -1 ? unified : unified.slice(index + 1);
}

/** In-memory adapter over a flat list of absolute-path entries. */
export function fakeCodexFs(entries: readonly FakeCodexEntry[]): FakeCodexFs {
  const reads: { path: string; start: number; length: number }[] = [];
  const buffers = new Map<string, Buffer>();
  const bufferFor = (text: string): Buffer => {
    const known = buffers.get(text);
    if (known !== undefined) return known;
    const buffer = Buffer.from(text, 'utf8');
    buffers.set(text, buffer);
    return buffer;
  };

  return {
    reads,

    listDirs: async (path: string) => {
      const prefix = key(path);
      const names = new Set<string>();
      for (const entry of entries) {
        const dir = dirname(entry.path);
        const dirKey = key(dir);
        if (dirKey === prefix) continue;
        if (!dirKey.startsWith(`${prefix}/`)) continue;
        // `key()` never changes length, so slicing the case-preserved `dir` at
        // `prefix.length` lands on the same boundary as it would in `dirKey`.
        const rest = dir.slice(prefix.length + 1);
        const next = rest.split('/')[0];
        if (next !== undefined && next.length > 0) names.add(next);
      }
      return [...names].sort();
    },

    listFiles: async (path: string) => {
      const target = key(path);
      return entries
        .filter((entry) => key(dirname(entry.path)) === target)
        .map((entry): ClaudeFileInfo => ({
          path: entry.path,
          name: basename(entry.path),
          size: bufferFor(entry.text).length,
          modified: entry.modified,
        }));
    },

    readRange: async (path: string, start: number, length: number) => {
      reads.push({ path, start, length });
      const entry = entries.find((candidate) => key(candidate.path) === key(path));
      if (entry === undefined) return '';
      return bufferFor(entry.text)
        .subarray(Math.max(0, start), Math.max(0, start) + length)
        .toString('utf8');
    },

    exists: async (path: string) => entries.some((entry) => key(entry.path) === key(path)),

    join: (...parts: string[]) => parts.join('/').replace(/\/{2,}/g, '/'),
    homeDir: () => '/home/test',
  };
}

/** One JSONL line from a Codex-shaped record. */
export function codexLine(record: Record<string, unknown>): string {
  return JSON.stringify(record);
}

/** Several records as a file body, with a trailing newline. */
export function codexJsonl(records: readonly Record<string, unknown>[]): string {
  return `${records.map(codexLine).join('\n')}\n`;
}

interface SyntheticSessionOptions {
  sessionId: string;
  cwd: string;
  branch?: string;
  model?: string;
  startedAt: string;
  lastActivity: string;
  prompt?: string;
  reply?: string;
}

/**
 * A minimal but realistic synthetic session: `session_meta`, `turn_context`, one
 * user turn, one assistant turn — enough for `readSessionFacts` to report
 * `records > 0` and a `messageCount` of 2, which is all these reader tests need.
 */
export function syntheticSession(options: SyntheticSessionOptions): string {
  return codexJsonl([
    {
      timestamp: options.startedAt,
      type: 'session_meta',
      payload: {
        session_id: options.sessionId,
        cwd: options.cwd,
        git: { branch: options.branch ?? 'main' },
        context_window: 128000,
      },
    },
    {
      timestamp: options.startedAt,
      type: 'turn_context',
      payload: { model: options.model ?? 'gpt-5-codex', cwd: options.cwd },
    },
    {
      timestamp: options.startedAt,
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: options.prompt ?? 'Do the thing.' }],
      },
    },
    {
      timestamp: options.lastActivity,
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: options.reply ?? 'Done.' }],
      },
    },
  ]);
}
