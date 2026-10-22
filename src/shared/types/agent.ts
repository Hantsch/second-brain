/* Presence of the Claude Code CLI on this machine, as the Agent settings tab shows it. */

export type AgentCliStatus =
  | { state: 'installed'; path: string }
  | { state: 'absent' }
  | {
      state: 'unknown';
      reason: 'timeout' | 'lookup-error';
      /** Error code only (e.g. EACCES) — never a message or path. */
      code?: string;
    };

export const CLAUDE_CODE_INSTALL_URL = 'https://code.claude.com/docs/en/setup';
