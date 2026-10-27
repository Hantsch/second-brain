/* What settling one agent job needs and returns. Each job kind registers one `Settler`; it
   checks the agent's done result against the vault and books it, or says why not. */

import type { AuditResult, GardenerContext, StoredRun } from '@core/gardener';
import type { WikiTxStore } from '@core/wiki/types';
import type { AgentJobFile, AgentResultFile, DocLanguage } from '@shared/types';
import type { AgentJobFiles } from './job-files';

export interface AgentJobDeps {
  /** Absolute vault root: paths the agent names are resolved against it, symlinks included. */
  vaultRoot: string;
  store: WikiTxStore;
  jobs: AgentJobFiles;
  now?: () => Date;
  docLanguage?: DocLanguage;
  /** The gardener's state lives in main; absent where nothing can book an audit. */
  gardenerAudit?: {
    storedRun(): Promise<StoredRun | null>;
    /** The context the audit check runs against: today's index, not the run's. */
    checkContext(): Promise<GardenerContext>;
    /** Merges a checked audit into the stored run. */
    book(audit: AuditResult, at: string): Promise<void>;
  };
}

/** A refusal with a stable code and an English text that ends up as the job's reason. */
export interface AgentRefusal<Code extends string = string> {
  code: Code;
  text: string;
}

export type SettleOutcome = { ok: true } | { ok: false; reason: AgentRefusal };

/** The agent's answer once it says `done`. */
export type AgentDoneResult = Extract<AgentResultFile, { status: 'done' }>;

/** Validates and books one done result. Must not throw for a wrong answer, only for I/O. */
export type Settler = (
  deps: AgentJobDeps,
  job: AgentJobFile,
  result: AgentDoneResult,
) => Promise<SettleOutcome>;
