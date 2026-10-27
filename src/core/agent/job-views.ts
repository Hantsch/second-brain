/* The jobs as the renderer lists them: open ones first, then finished ones, newest first. */

import type { AgentJobFile, AgentJobView, AgentRunReport } from '@shared/types';
import { curateOutcome } from './curate-job';
import type { AgentJobFiles } from './job-files';

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function baseView(job: AgentJobFile) {
  return {
    id: job.id,
    kind: job.kind,
    subject: job.subject,
    // The title is a field of the job file, so a job never needs the source itself to be labelled.
    label: text(job.fields['title']) ?? job.subject,
    module: text(job.fields['module']),
    createdAt: job.createdAt,
  };
}

export function openJobView(job: AgentJobFile): AgentJobView {
  return { ...baseView(job), state: 'with-agent', reason: null, finishedAt: null };
}

/**
 * `readReports` is only called when a finished curate job needs the run reports, so a list
 * without one never reads the `runs/` folder.
 */
export async function listAgentJobViews(
  jobs: AgentJobFiles,
  readReports: () => Promise<AgentRunReport[]> = async () => [],
): Promise<AgentJobView[]> {
  const open = (await jobs.open()).map(openJobView);
  const done = await jobs.finished();
  const reports = done.some((entry) => isDoneCurate(entry.outcome, entry.job))
    ? await readReports()
    : [];
  const finished = done.map((entry): AgentJobView => {
    const view: AgentJobView = {
      ...baseView(entry.job),
      state: entry.outcome,
      reason: entry.reason,
      finishedAt: entry.finishedAt,
    };
    return isDoneCurate(entry.outcome, entry.job)
      ? { ...view, curate: curateOutcome(entry.job.id, entry.job.subject, reports) }
      : view;
  });
  return [...open, ...finished];
}

function isDoneCurate(outcome: string, job: AgentJobFile): boolean {
  return outcome === 'done' && job.kind === 'curate-module';
}
