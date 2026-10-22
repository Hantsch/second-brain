/* Types for opening a terminal in the vault with Claude Code started (Agent settings tab). */

export type TerminalKind = 'windows-terminal' | 'powershell';

export type TerminalIntent =
  { kind: 'open' } | { kind: 'jobs' } | { kind: 'curate'; module: string };

export interface TerminalLaunchPlan {
  terminal: TerminalKind;
  command: string;
  args: string[];
  cwd: string;
  /** Set when `args` is one pre-quoted cmd.exe command line that must not be re-escaped. */
  windowsVerbatimArguments: boolean;
}

/** Why the terminal cannot be opened yet; in the order readiness checks them. */
export type TerminalBlock = 'no-vault' | 'cli-absent' | 'cli-unknown' | 'setup-missing';

export type TerminalLaunchResult =
  | { ok: true; terminal: TerminalKind }
  | {
      ok: false;
      reason: TerminalBlock | 'unsupported-platform' | 'invalid-module' | 'no-terminal';
      /** Error code only (e.g. ENOENT) — never a path or content. */
      detail?: string;
    };
