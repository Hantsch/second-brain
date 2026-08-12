/**
 * The agent-neutral contract above `@core/claude`.
 *
 * Claude Code and Codex CLI store their sessions differently, but the questions
 * the agent browser asks are the same: which projects, which sessions, which
 * course of conversation. `AgentSessionSource` is that shared read surface per
 * `AgentKind`; `AgentFileSystem` is its file adapter — deliberately the same one
 * Claude uses, so Codex's reader (D3-D8) can reuse it unchanged.
 */

import type { ClaudeFileSystem } from '@core/claude';
import type { AgentProject, AgentSessionSummary, TranscriptPage } from '@shared/types';

/** The same narrow file adapter Claude uses — Codex needs none of its own. */
export type AgentFileSystem = ClaudeFileSystem;

/**
 * The read surface of an agent CLI, one implementation per `AgentKind`.
 * Mirrors the three `agents:*` IPC channels (src/shared/ipc.ts) 1:1 — the IPC
 * handlers call exactly these three methods, whichever `AgentKind` sits behind
 * them.
 */
export interface AgentSessionSource {
  /** Projects (working directories) with at least one session. */
  listProjects(): Promise<AgentProject[]>;
  /** Sessions of one project, newest first. */
  listSessions(projectKey: string): Promise<AgentSessionSummary[]>;
  /** One page of a session's course; `cursor` resumes where the last page ended. */
  transcript(
    sessionId: string,
    projectKey: string,
    cursor?: string | null,
  ): Promise<TranscriptPage>;
}
