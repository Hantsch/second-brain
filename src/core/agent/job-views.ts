/* The jobs as the renderer lists them: open ones first, then finished ones, newest first. */

import type { AgentJobFile, AgentJobView } from '@shared/types';
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

export async function listAgentJobViews(jobs: AgentJobFiles): Promise<AgentJobView[]> {
  const open = (await jobs.open()).map(openJobView);
  const finished = (await jobs.finished()).map((entry): AgentJobView => ({
    ...baseView(entry.job),
    state: entry.outcome,
    reason: entry.reason,
    finishedAt: entry.finishedAt,
  }));
  return [...open, ...finished];
}
