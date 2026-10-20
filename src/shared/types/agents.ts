/* Agent session browser: Claude Code and Codex CLI session trails, unified. */

/** Which CLI's session store an entry was read from. */
export type AgentKind = 'claude' | 'codex';

/**
 * One working directory aggregated across its sessions — the list the
 * browser's left column shows before drilling into a single session.
 */
export interface AgentProject {
  /** Normalized cwd — the aggregation identity, stable across renames. */
  key: string;
  /** Display path as recorded by the CLI. */
  path: string;
  /** Short name derived from the path. */
  name: string;
  agent: AgentKind;
  sessionCount: number;
  /** ISO timestamp of the earliest known session. */
  firstActivity: string;
  /** ISO timestamp of the most recent known session. */
  lastActivity: string;
  /** Linked vault project, if one can be matched. */
  vaultProject: string | null;
}

/** One session within a project — the row the browser's middle column shows. */
export interface AgentSessionSummary {
  id: string;
  agent: AgentKind;
  projectKey: string;
  /** Session title or summary, if the CLI recorded one. */
  title: string | null;
  startedAt: string;
  lastActivity: string;
  durationMs: number | null;
  messageCount: number;
  gitBranch: string | null;
  model: string | null;
  /**
   * Subagents invoked during the session. `null` means the format doesn't
   * record this (Codex) — not the same as an empty array, which would mean
   * "recorded as zero".
   */
  subagents: string[] | null;
  contextTokens: number | null;
  vaultProject: string | null;
}

/** The kind of one transcript entry, for rendering. */
export type TranscriptEntryKind = 'user' | 'assistant' | 'tool-call' | 'tool-result';

/** One entry of a session transcript, normalized across agent formats. */
export interface TranscriptEntry {
  id: string;
  kind: TranscriptEntryKind;
  at: string | null;
  /** Message text for `user`/`assistant` entries. */
  text: string | null;
  toolName: string | null;
  /** Collapsed one-line description of a tool call, e.g. a file path. */
  toolTarget: string | null;
  /** Expand-on-click detail, passed through as-is — kept JSON-serializable. */
  raw: unknown;
}

/** One page of a session transcript, for cursor-based paging over large logs. */
export interface TranscriptPage {
  entries: TranscriptEntry[];
  /** Opaque paging cursor; `null` means there are no more pages. */
  nextCursor: string | null;
  /** Whether the total entry count could be determined without reading the whole file. */
  totalKnown: boolean;
}
