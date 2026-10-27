/* Types and constants for the edits the agent proposes by writing a file into
   `.secondbrain/agent/proposals/`; Gaston lists and validates them and the human decides. */

import type { DiffRow } from './condense';

/** Where an accepted or rejected proposal is archived. */
export const AGENT_RESOLVED_DIR = '.secondbrain/agent/resolved';

/** Frontmatter fields every proposal needs. */
export const PROPOSAL_FIELDS = [
  'gaston',
  'version',
  'kind',
  'target',
  'base_hash',
  'run',
  'reason',
] as const;

/** Additional required fields of a `filing` proposal; `section` stays optional. */
export const PROPOSAL_FILING_FIELDS = ['file_into'] as const;

export type ProposalKind = 'edit' | 'filing';

export type ProposalInvalidCode =
  | 'unreadable'
  | 'missing-field'
  | 'unknown-kind'
  | 'bad-hash'
  | 'forbidden-target'
  | 'outside-vault'
  | 'target-missing'
  | 'filing-invalid';

export interface AgentProposalView {
  /** The file stem under `proposals/`. */
  id: string;
  path: string;
  kind: ProposalKind | null;
  target: string | null;
  reason: string | null;
  run: string | null;
  fileInto: string | null;
  section: string | null;
  valid: boolean;
  /** Why the proposal cannot be accepted; `detail` carries the field or path concerned. */
  invalid: { code: ProposalInvalidCode; detail: string | null } | null;
  /** Proposed content against the current file; `null` while invalid. */
  diff: DiffRow[] | null;
}
