/* Types and constants for the agent setup that Gaston installs into a vault (the
 * vault-level CLAUDE.md, skills, hooks and settings that let Claude Code work on it). */

/** Where the agent exchanges files with Gaston; the only part of `.secondbrain/` it may write. */
export const AGENT_DIRS = {
  jobs: '.secondbrain/agent/jobs',
  results: '.secondbrain/agent/results',
  proposals: '.secondbrain/agent/proposals',
  runs: '.secondbrain/agent/runs',
} as const;

/** Skill folder names under `.claude/skills/`; each is also the slash command. */
export const AGENT_SKILLS = {
  jobs: 'gaston-jobs',
  curate: 'gaston-curate',
  propose: 'gaston-propose',
} as const;

/** Records which template versions and hashes were installed. */
export const AGENT_SETUP_MANIFEST = '.claude/gaston-manifest.json';

export type AgentSetupFileStatus =
  'current' | 'outdated' | 'missing' | 'modified' | 'newer' | 'yours';

export interface AgentSetupFile {
  path: string;
  status: AgentSetupFileStatus;
  installedVersion: number | null;
  shippedVersion: number | null;
}

export interface AgentSetupPlan {
  write: { path: string; expectedHash: string; reason: 'missing' | 'outdated' }[];
  optIn: { path: string; expectedHash: string }[];
  leave: { path: string; status: AgentSetupFileStatus }[];
  dirs: string[];
}

export interface AgentSetupState {
  files: AgentSetupFile[];
  action: 'install' | 'update' | 'none';
  plan: AgentSetupPlan;
}

export interface AgentSetupApplyRequest {
  confirmed: { path: string; expectedHash: string }[];
}

export interface AgentSetupApplyResult {
  results: { path: string; outcome: 'written' | 'conflict' | 'refused' }[];
}
