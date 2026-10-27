/* The agent's side of a waiting source, in one place for the source row and the job note:
   hand it over, or — once an open job exists — say it is with the agent and offer to take
   it back. Never both, so a second click cannot file a second job. (story 090) */

import type { AgentJobView } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { useT } from '../../i18n';

export interface AgentHandOverProps {
  /** The open job for this source, if the agent holds one. */
  job: AgentJobView | null;
  /** No module to file the page into yet. */
  disabled?: boolean;
  pending?: boolean;
  onHandOver: () => void;
  onWithdraw: (id: string) => void;
}

export function AgentHandOver({
  job,
  disabled = false,
  pending = false,
  onHandOver,
  onWithdraw,
}: AgentHandOverProps) {
  const t = useT();
  if (job !== null) {
    return (
      <>
        <Badge variant="neutral">{t('sources.agent.with')}</Badge>
        <Button variant="ghost" size="sm" icon="x" onClick={() => onWithdraw(job.id)}>
          {t('sources.agent.withdraw')}
        </Button>
      </>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      icon="bot"
      disabled={disabled || pending}
      onClick={onHandOver}
    >
      {t('sources.agent.hand')}
    </Button>
  );
}
