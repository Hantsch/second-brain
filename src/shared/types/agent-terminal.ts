/* Types for opening a terminal in the vault with plain Claude Code started (rail Agent entry). */

export type TerminalKind = 'windows-terminal' | 'powershell';

export interface TerminalLaunchPlan {
  terminal: TerminalKind;
  command: string;
  args: string[];
  cwd: string;
  /** Set when `args` is one pre-quoted cmd.exe command line that must not be re-escaped. */
  windowsVerbatimArguments: boolean;
  /** Windows Terminal applies an inherited SW_HIDE to its own window, so its plan must not hide. */
  windowsHide: boolean;
}

/** Why the terminal cannot be opened yet; in the order readiness checks them. */
export type TerminalBlock = 'no-vault' | 'cli-absent' | 'cli-unknown' | 'setup-missing';

export type TerminalLaunchResult =
  | { ok: true; terminal: TerminalKind }
  | {
      ok: false;
      reason: TerminalBlock | 'unsupported-platform' | 'no-terminal';
      /** Error code only (e.g. ENOENT) — never a path or content. */
      detail?: string;
    };
