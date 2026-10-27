/* One job the agent holds or has settled, laid out like a `TaskRow`: kind, subject, a state
   badge whose text and icon both carry the state, and the reason line when the agent did not
   finish. Only an open job can be withdrawn; a settled one is a record. (story 090) */

import type { AgentJobView } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import { useT } from '../../i18n';

type JobState = AgentJobView['state'];

const STATE_LABEL_KEY: Record<JobState, string> = {
  'with-agent': 'sources.agent.with',
  done: 'tasks.outcome.done',
  failed: 'tasks.outcome.failed',
  skipped: 'tasks.agent.state.skipped',
  withdrawn: 'tasks.agent.state.withdrawn',
};
const STATE_BADGE_VARIANT: Record<JobState, 'success' | 'danger' | 'neutral'> = {
  'with-agent': 'neutral',
  done: 'success',
  failed: 'danger',
  skipped: 'neutral',
  withdrawn: 'neutral',
};
const STATE_ICON: Record<JobState, string> = {
  'with-agent': 'bot',
  done: 'circle-check-big',
  failed: 'triangle-alert',
  skipped: 'circle-alert',
  withdrawn: 'x',
};

export interface AgentJobRowProps {
  job: AgentJobView;
  onWithdraw: (id: string) => void;
}

export function AgentJobRow({ job, onWithdraw }: AgentJobRowProps) {
  const t = useT();
  return (
    <div className="sb-trow">
      <div className="sb-trow-head">
        <span className="sb-trow-kind sb-mono">{t(`tasks.agent.kind.${job.kind}`)}</span>
        <span className="sb-trow-subject">{job.label}</span>
        <Badge variant={STATE_BADGE_VARIANT[job.state]}>
          <Icon name={STATE_ICON[job.state]} size={12} />
          {t(STATE_LABEL_KEY[job.state])}
        </Badge>
      </div>
      {job.reason !== null ? (
        <div className="sb-trow-reason">{t('tasks.agent.reason', { reason: job.reason })}</div>
      ) : null}
      {job.state === 'with-agent' ? (
        <div className="sb-trow-actions">
          <Button variant="ghost" size="sm" icon="x" onClick={() => onWithdraw(job.id)}>
            {t('sources.agent.withdraw')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
