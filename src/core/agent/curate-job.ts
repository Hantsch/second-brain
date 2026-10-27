/* Handing a whole module to the agent for curation. The job carries the module slug and
   instructions only; the agent changes the wiki itself, so settling books nothing and what
   the run did is read back from its run report (story 091). */

import { moduleDir, slugify } from '@core/vault/paths';
import { HELP_MODULE_SLUG } from '@shared/help-module';
import { AGENT_SKILLS, type AgentJobFile, type AgentRunReport } from '@shared/types';
import { HandOverError } from './condense-source-job';
import { agentJobId } from './job-files';
import type { AgentJobDeps, Settler } from './settler';

export interface CurateOutcome {
  pagesChanged: number;
  proposalsWritten: number;
}

function curateInstructions(id: string, slug: string): string {
  return [
    `Curate the knowledge module \`${slug}\` the way the \`/${AGENT_SKILLS.curate} ${slug}\` skill does.`,
    '',
    `Work only inside \`modules/${slug}/\`. Change pages in its wiki directly and leave anything`,
    'that needs a decision from the human as a proposal.',
    '',
    `When you are done, write the result for job \`${id}\` with \`status: done\`.`,
    'Write `status: failed` or `status: skipped` with a reason if you could not curate the module.',
  ].join('\n');
}

export async function fileCurateJob(
  deps: Pick<AgentJobDeps, 'store' | 'jobs' | 'now'>,
  moduleSlug: string,
): Promise<{ status: 'filed' | 'exists'; job: AgentJobFile }> {
  const slug = slugify(moduleSlug);
  // The help module is Gaston's own page set; the agent never rewrites it.
  if (slug === HELP_MODULE_SLUG) {
    throw new HandOverError('help-module', 'The help module is not curated by the agent.');
  }
  if (slug === '' || !(await deps.store.exists(moduleDir(slug)))) {
    throw new HandOverError('unknown-module', 'There is no such module.');
  }

  const now = (deps.now ?? (() => new Date()))();
  const id = agentJobId('curate-module', slug, now);
  const job: AgentJobFile = {
    version: 1,
    id,
    kind: 'curate-module',
    createdAt: now.toISOString(),
    subject: slug,
    fields: { module: slug },
    body: curateInstructions(id, slug),
  };
  const status = await deps.jobs.file(job);
  if (status === 'filed') return { status, job };
  const open = (await deps.jobs.open()).find(
    (other) => other.kind === job.kind && other.subject === job.subject,
  );
  return { status, job: open ?? job };
}

function listsJob(report: AgentRunReport, jobId: string): boolean {
  return [report.jobsDone, report.jobsFailed, report.jobsSkipped].some((ids) =>
    ids.includes(jobId),
  );
}

/**
 * What the run that finished the job did to the module. Proposals carry a run, not a job,
 * so they are the report's proposals as a whole. `reportPending` while no report lists the
 * job: the stop hook writes it after the agent's last turn.
 */
export function curateOutcome(
  jobId: string,
  slug: string,
  reports: readonly AgentRunReport[],
): CurateOutcome | { reportPending: true } {
  const newest = reports
    .filter((report) => listsJob(report, jobId))
    .sort((a, b) => Date.parse(b.finished) - Date.parse(a.finished))[0];
  if (newest === undefined) return { reportPending: true };
  const prefix = `modules/${slug}/wiki/`;
  return {
    pagesChanged: newest.pages.filter((page) => page.startsWith(prefix)).length,
    proposalsWritten: newest.proposals.length,
  };
}

/** A done result needs nothing beyond its shape: the post-write hook checks pages and log. */
export const settleCurateModule: Settler = async () => ({ ok: true });
