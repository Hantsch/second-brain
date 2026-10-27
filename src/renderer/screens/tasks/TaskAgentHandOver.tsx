/* The agent's side of an ingest task that ended waiting for a model: hand the source over, or
   say it is with the agent. Mounted only for such a task, so no other row pays for the job
   query. Once the agent has condensed the source the offer is gone. (story 090) */

import type { IngestJob, WorkTask } from '@shared/types';
import { ErrorState } from '../../components/ErrorState';
import {
  isSourceCondensedByAgent,
  openSourceJob,
  useAgentJobMutations,
  useAgentJobs,
} from '../../lib/queries/agent-jobs';
import { AgentHandOver } from '../sources/AgentHandOver';

/** The ingest job behind a finished task that is waiting for a model — with its raw source. */
export function awaitingModelSource(task: WorkTask): (IngestJob & { rawPath: string }) | null {
  /* Only the ingest producer sets `detail` on a task of kind `'ingest'`. */
  const job = task.kind === 'ingest' ? (task.detail as IngestJob | null) : null;
  return job !== null && job.stage === 'awaiting-llm' && job.rawPath !== null
    ? { ...job, rawPath: job.rawPath }
    : null;
}

export interface TaskAgentHandOverProps {
  source: IngestJob & { rawPath: string };
  subject: string;
}

export function TaskAgentHandOver({ source, subject }: TaskAgentHandOverProps) {
  const jobs = useAgentJobs().data;
  const { handOver, withdraw } = useAgentJobMutations();
  if (isSourceCondensedByAgent(jobs, source.rawPath)) return null;
  return (
    <>
      <div className="sb-trow-actions">
        <AgentHandOver
          job={openSourceJob(jobs, source.rawPath)}
          pending={handOver.isPending}
          onHandOver={() => handOver.mutate({ rawPath: source.rawPath, module: source.module })}
          onWithdraw={(id) => withdraw.mutate(id)}
        />
      </div>
      {(handOver.error ?? withdraw.error) ? (
        <ErrorState
          error={handOver.error ?? withdraw.error}
          subject={subject}
          variant="secondary"
        />
      ) : null}
    </>
  );
}
