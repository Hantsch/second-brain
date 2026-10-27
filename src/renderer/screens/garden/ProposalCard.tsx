/* One proposal the agent left for the human: what it would change, why, and the
   two ways out. An invalid proposal says why it cannot be accepted and offers only
   Reject — a card with no way to dismiss it would stay forever. (story 088) */

import type { AgentProposalView } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { CondenseDiff } from '../../components/CondenseDiff';
import { useT } from '../../i18n';

export interface ProposalCardProps {
  proposal: AgentProposalView;
  /** An action on this very proposal is running. */
  busy: boolean;
  /** The last accept found the target changed; nothing was written. */
  conflict: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

export function ProposalCard({ proposal, busy, conflict, onAccept, onReject }: ProposalCardProps) {
  const t = useT();
  const { invalid } = proposal;
  const title = invalid === null ? (proposal.target ?? proposal.path) : proposal.path;

  return (
    <Card padded={false} className="sb-finding">
      <div className="sb-finding-head">
        {invalid === null && proposal.kind !== null ? (
          <Badge variant="neutral">{t(`garden.proposal.kind.${proposal.kind}`)}</Badge>
        ) : (
          <Badge variant="warning">{t('garden.proposal.invalidBadge')}</Badge>
        )}
        <h4 className="sb-finding-title sb-mono">{title}</h4>
      </div>

      {invalid === null ? (
        <>
          {proposal.kind === 'filing' ? (
            <p className="sb-finding-why">
              {t('garden.proposal.filing', {
                target: proposal.target ?? '',
                fileInto: proposal.fileInto ?? '',
              })}
            </p>
          ) : null}
          {proposal.reason === null ? null : <p className="sb-finding-why">{proposal.reason}</p>}
          {proposal.diff === null ? null : <CondenseDiff rows={proposal.diff} />}
        </>
      ) : (
        <p className="sb-finding-why">
          {t(`garden.proposal.invalid.${invalid.code}`, { detail: invalid.detail ?? '' })}
        </p>
      )}

      {conflict ? (
        <p className="sb-finding-note" role="status">
          {t('garden.proposal.conflict')}
        </p>
      ) : null}

      <div className="sb-finding-actions">
        {invalid === null ? (
          <Button
            variant="secondary"
            size="sm"
            icon="check"
            loading={busy}
            onClick={() => onAccept(proposal.id)}
          >
            {t('garden.proposal.accept')}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          icon="x"
          disabled={busy}
          onClick={() => onReject(proposal.id)}
        >
          {t('garden.proposal.reject')}
        </Button>
      </div>
    </Card>
  );
}
