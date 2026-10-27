import type { TerminalBlock } from '../types/agent-terminal';

export interface TerminalReadinessInput {
  vaultOpen: boolean;
  cli: 'installed' | 'absent' | 'unknown';
  /** True when no managed setup file is missing. */
  setupComplete: boolean;
}

export type TerminalReadiness = { ready: true } | { ready: false; reason: TerminalBlock };

/** The one rule for "setup complete": a file that is merely outdated or changed by the user
 *  still lets the agent work; only a missing one does not. */
export function setupIsComplete(files: readonly { status: string }[]): boolean {
  return files.every((file) => file.status !== 'missing');
}

/** First failing check wins, so the UI names the step the user has to do next. */
export function terminalReadiness(input: TerminalReadinessInput): TerminalReadiness {
  if (!input.vaultOpen) return { ready: false, reason: 'no-vault' };
  if (input.cli === 'absent') return { ready: false, reason: 'cli-absent' };
  if (input.cli === 'unknown') return { ready: false, reason: 'cli-unknown' };
  if (!input.setupComplete) return { ready: false, reason: 'setup-missing' };
  return { ready: true };
}
