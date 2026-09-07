import type { CondenseProposal } from './condense';
import type { JournalCloseSuggestion } from './journal';

/**
 * The result of a finished `WorkTask` (story 073) — the proposal a "run I
 * walk away from" (condensation, day close) produced. Kept separate from
 * `WorkTask` itself: the task record only ever carries `hasResult: boolean`,
 * never this payload, so listing tasks never has to serialize a whole
 * proposal.
 */
export type TaskResult =
  | { kind: 'condense'; proposal: CondenseProposal }
  | { kind: 'journal-close'; suggestion: JournalCloseSuggestion };
