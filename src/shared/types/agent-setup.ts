/* Types and constants for the agent setup that Gaston installs into a vault (the
 * vault-level CLAUDE.md, skills, hooks and settings that let Claude Code work on it). */

import type { HelpModuleState } from '../help-module';

/** Where the agent exchanges files with Gaston; the only part of `.secondbrain/` it may write. */
export const AGENT_DIRS = {
  jobs: '.secondbrain/agent/jobs',
  results: '.secondbrain/agent/results',
  proposals: '.secondbrain/agent/proposals',
  runs: '.secondbrain/agent/runs',
} as const;

/** Format version of a job file in `jobs/`; the `gaston-jobs` skill documents the same number. */
export const AGENT_JOB_VERSION = 1;

/** `gaston:` value, format version and retention of a run report in `runs/`. */
export const RUN_REPORT_FORMAT = 'run-report';
export const RUN_REPORT_VERSION = 1;
export const RUN_REPORTS_KEPT = 50;

/** What one agent run left behind, as its stop hook recorded it. */
export interface AgentRunReport {
  skill: string;
  argument: string | null;
  started: string;
  finished: string;
  /** Vault-relative paths of the pages the run wrote. */
  pages: string[];
  /** File names, not paths, of the proposals the run wrote. */
  proposals: string[];
  jobsDone: string[];
  jobsFailed: string[];
  jobsSkipped: string[];
}

export type AgentLastRun =
  | { state: 'none' }
  | { state: 'read'; path: string; report: AgentRunReport }
  | { state: 'unreadable'; path: string; reason: string };

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
  /**
   * A user-owned folder sits where Gaston would install a module. While it is set, the
   * plan writes nothing at all — `write`, `optIn` and `dirs` are empty and apply refuses
   * every path. Absent when nothing collides.
   */
  collision?: AgentSetupCollision;
}

export interface AgentSetupCollision {
  /** Slug of the module whose folder is taken. */
  module: string;
  /** The module file that is missing or not Gaston's. */
  path: string;
}

export interface AgentSetupState {
  files: AgentSetupFile[];
  action: 'install' | 'update' | 'none';
  plan: AgentSetupPlan;
  /** The help module as one row; it travels with the setup because one Install writes both. */
  help: HelpModuleState;
}

export interface AgentSetupApplyRequest {
  confirmed: { path: string; expectedHash: string }[];
}

export interface AgentSetupApplyResult {
  /**
   * One row per confirmed path, plus a row for each folder, the manifest or the help
   * chronicle that could not be written. `failed` is a hard write error; `reason` is set
   * only then and holds the errno code (`EPERM`, …) or `unknown`, never a message.
   */
  results: {
    path: string;
    outcome: 'written' | 'conflict' | 'refused' | 'failed';
    reason?: string;
  }[];
}

/** The protection rules the installed settings.json is checked against. */
export type AgentProtectionRuleId =
  | 'journal-read'
  | 'raw-write'
  | 'setup-write'
  | 'overview-write'
  | 'internal-write'
  | 'pre-tool-guard'
  | 'wiki-check';

export interface AgentProtectionRule {
  id: AgentProtectionRuleId;
  /** `off`: the hooks are registered but `disableAllHooks` switches every hook off. */
  status: 'installed' | 'missing' | 'off';
  /** The deny entries or hook registrations the settings file lacks. */
  missing: string[];
}

export type AgentProtectionState =
  | { state: 'none' }
  | { state: 'unreadable'; reason: string }
  | { state: 'read'; rules: AgentProtectionRule[]; extraDeny: string[] };
