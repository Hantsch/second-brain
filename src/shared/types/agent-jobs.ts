/* Types for the Markdown job and result files Gaston and the agent exchange under
 * `.secondbrain/agent/jobs/` and `.secondbrain/agent/results/` (format: docs/VAULT-FORMAT.md). */

/** What a job asks of the agent. Later stories extend the union. */
export type AgentJobKind = 'condense-source';

/** How a job ended. `withdrawn` is the human taking it back; the other three are the agent's. */
export type AgentJobOutcome = 'done' | 'failed' | 'skipped' | 'withdrawn';

/** One job as the file holds it. A job carries paths and instructions, never source content. */
export interface AgentJobFile {
  version: 1;
  id: string;
  kind: AgentJobKind;
  /** ISO timestamp of the hand-over. */
  createdAt: string;
  /** What the job is about, usually a vault path; with `kind` it identifies an open job. */
  subject: string;
  /** The kind's own frontmatter fields. */
  fields: Record<string, unknown>;
  /** English instructions for the agent. */
  body: string;
}

/** The agent's answer to a job; `fields` are the kind's own frontmatter fields. */
export type AgentResultFile =
  | { status: 'done'; fields: Record<string, unknown>; body: string }
  | { status: 'failed' | 'skipped'; reason: string };

/** A job as the renderer lists it. */
export interface AgentJobView {
  id: string;
  kind: AgentJobKind;
  subject: string;
  label: string;
  /** The knowledge module the subject belongs to, if any. */
  module: string | null;
  state: 'with-agent' | AgentJobOutcome;
  reason: string | null;
  createdAt: string;
  finishedAt: string | null;
}
