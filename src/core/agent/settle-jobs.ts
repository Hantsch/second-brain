/* Settling turns the agent's answers into finished jobs. Every open job with a result ends
   here exactly once: a `done` result is checked and booked by its kind's settler, a failed
   or skipped one keeps the agent's reason. A result whose job is no longer open (withdrawn,
   finished) is moved aside and books nothing. One bad job never stops the others. */

import type { AgentJobFile, AgentJobKind } from '@shared/types';
import { settleGardenerAudit } from './audit-job';
import { settleCondenseModule } from './condense-module-job';
import { settleCondenseSource } from './condense-source-job';
import { settleCurateModule } from './curate-job';
import type { AgentJobDeps, Settler } from './settler';

export type { AgentJobDeps, Settler } from './settler';

/** One settler per job kind; a new kind registers here. */
export const AGENT_JOB_SETTLERS: Record<AgentJobKind, Settler> = {
  'condense-source': settleCondenseSource,
  'curate-module': settleCurateModule,
  'gardener-audit': settleGardenerAudit,
  'condense-module': settleCondenseModule,
};

const UNKNOWN_KIND = 'Gaston does not know this kind of job.';

function warn(what: string, error: unknown): void {
  // The error's kind only: a message may quote vault content.
  console.warn(`[agent/settle] ${what}:`, error instanceof Error ? error.name : 'error');
}

/** Settles one job; `true` when it was finished. A job without a result stays open. */
async function settleOne(
  deps: AgentJobDeps,
  job: AgentJobFile,
  settler: Settler | undefined,
): Promise<boolean> {
  const result = await deps.jobs.result(job.id);
  if (result === null) return false;
  if ('invalid' in result) {
    return deps.jobs.finish(job.id, 'failed', `The result is invalid: ${result.invalid}.`);
  }
  if (result.status !== 'done') return deps.jobs.finish(job.id, result.status, result.reason);
  // The kind comes from a file on disk, so it can name a kind this build does not have.
  if (settler === undefined) return deps.jobs.finish(job.id, 'failed', UNKNOWN_KIND);
  const outcome = await settler(deps, job, result);
  return outcome.ok
    ? deps.jobs.finish(job.id, 'done', null)
    : deps.jobs.finish(job.id, 'failed', outcome.reason.text);
}

/**
 * Settles every open job that has a result, then moves late results aside and prunes old
 * finished jobs. Returns whether anything changed. A job whose settling throws (an I/O
 * error, a lasting conflict on the index or log) stays open and is tried again next time.
 */
export async function settleAgentJobs(
  deps: AgentJobDeps,
  settlers: Partial<Record<AgentJobKind, Settler>> = AGENT_JOB_SETTLERS,
): Promise<boolean> {
  let changed = false;
  for (const job of await deps.jobs.open()) {
    try {
      if (await settleOne(deps, job, settlers[job.kind])) changed = true;
    } catch (error) {
      warn(`could not settle ${job.id}`, error);
    }
  }
  for (const id of await deps.jobs.orphanResults().catch(() => [])) {
    try {
      await deps.jobs.discardLateResult(id);
      changed = true;
    } catch (error) {
      warn(`could not move the late result ${id} aside`, error);
    }
  }
  try {
    if ((await deps.jobs.prune()) > 0) changed = true;
  } catch (error) {
    warn('could not prune finished jobs', error);
  }
  return changed;
}
