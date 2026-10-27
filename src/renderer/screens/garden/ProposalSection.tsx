/* The agent's proposals, waiting for a decision at the top of maintenance. Hidden
   while there are none. The outcome of an accept lives here, not in the list: the
   accepted card leaves the list at once, and the way back must outlive it. (story 088) */

import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { decodeIpcError } from '../../lib/ipc-error';
import { useAcceptProposal, useAgentProposals, useRejectProposal } from '../../lib/queries/agent';
import { useCaptureMutations } from '../../lib/queries/capture';
import { useGardenerMutations } from '../../lib/queries/gardener';
import { useT } from '../../i18n';
import { OutcomeStrip } from './OutcomeStrip';
import type { Outcome } from './OutcomeStrip';
import { ProposalCard } from './ProposalCard';

interface Accepted {
  outcome: Outcome;
  undo: { via: 'gardener' | 'capture'; token: string } | null;
}

export function ProposalSection() {
  const t = useT();
  const proposals = useAgentProposals();
  const accept = useAcceptProposal();
  const reject = useRejectProposal();
  const gardener = useGardenerMutations();
  const capture = useCaptureMutations();
  const [conflicts, setConflicts] = useState<ReadonlySet<string>>(new Set());
  const [accepted, setAccepted] = useState<Accepted | null>(null);

  const list = proposals.data ?? [];
  const busyId =
    (accept.isPending ? accept.variables : null) ?? (reject.isPending ? reject.variables : null);

  const setConflict = (id: string, on: boolean): void =>
    setConflicts((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const onAccept = (id: string): void => {
    const target = list.find((proposal) => proposal.id === id)?.target ?? id;
    accept.mutate(id, {
      onSuccess: (result) => {
        setConflict(id, false);
        setAccepted({
          outcome: { kind: 'fixed', files: [target], undoToken: result.undo.token },
          undo: result.undo,
        });
      },
      onError: (error) => setConflict(id, decodeIpcError(error).code === 'conflict'),
    });
  };

  const onUndo = (): void => {
    if (accepted?.undo == null) return;
    const done = (kept: string[]): void =>
      setAccepted({ outcome: { kind: 'undone', kept }, undo: null });
    if (accepted.undo.via === 'gardener') {
      gardener.undoFix.mutate(accepted.undo.token, { onSuccess: (result) => done(result.kept) });
    } else {
      capture.undo.mutate(accepted.undo.token, { onSuccess: () => done([]) });
    }
  };

  const conflicted = accept.error !== null && decodeIpcError(accept.error).code === 'conflict';
  const failed =
    (conflicted ? null : accept.error) ??
    reject.error ??
    gardener.undoFix.error ??
    capture.undo.error ??
    null;

  if (list.length === 0 && accepted === null && failed === null) return null;

  return (
    <section className="sb-ggroup">
      {list.length === 0 ? null : (
        <h3 className="sb-ggroup-title">
          {t('garden.proposal.title')}
          <span className="sb-mono sb-ggroup-count">{list.length}</span>
        </h3>
      )}
      {accepted === null ? null : (
        <OutcomeStrip
          outcome={accepted.outcome}
          busy={gardener.undoFix.isPending || capture.undo.isPending}
          {...(accepted.undo === null ? {} : { onUndo })}
        />
      )}
      {failed === null ? null : <ErrorState error={failed} variant="secondary" scrollIntoView />}
      {list.length === 0 ? null : (
        <ul className="sb-glist">
          {list.map((proposal) => (
            <li key={proposal.id}>
              <ProposalCard
                proposal={proposal}
                busy={busyId === proposal.id}
                conflict={conflicts.has(proposal.id)}
                onAccept={onAccept}
                onReject={(id) => reject.mutate(id, { onSuccess: () => setConflict(id, false) })}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
