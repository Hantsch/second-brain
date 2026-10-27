/* Everything in main that touches the agent's job files goes through one promise chain per
   container, so two watcher bursts, or a withdraw next to a settle, never book twice or book a
   job that was just taken back. A settle never rejects: it is a follow-up to a file change, and
   a job that could not be settled simply stays open for the next one. (story 090) */

import { createAgentJobFiles } from '@core/agent/job-files';
import { listAgentJobViews } from '@core/agent/job-views';
import { readRecentRuns } from '@core/agent/run-reports';
import { settleAgentJobs, type AgentJobDeps } from '@core/agent/settle-jobs';
import { FsVaultStore } from '@core/vault';
import { AGENT_DIRS, type AgentJobView } from '@shared/types';
import { gardenerContext, gardenerStateFor, wakeGardener } from './ipc/gardener-deps';
import type { Services } from './services';

/** How many run reports a finished curate job is looked up in; older ones read as pending. */
const RECENT_RUNS = 50;

const chains = new WeakMap<Services, Promise<unknown>>();

function underDir(path: string, dir: string): boolean {
  return path.replace(/\\/g, '/').startsWith(`${dir}/`);
}

/** Whether a vault-relative path is an exchange file the agent or Gaston writes for jobs. */
export function isAgentJobPath(path: string): boolean {
  return [AGENT_DIRS.jobs, AGENT_DIRS.results].some((dir) => underDir(path, dir));
}

/** A new run report is not a job file, but it settles what a finished curate job shows. */
export function isAgentRunPath(path: string): boolean {
  return underDir(path, AGENT_DIRS.runs);
}

/** The audit dep: books into the run it read, so a run replaced meanwhile is never touched. */
function gardenerAuditDep(services: Services): NonNullable<AgentJobDeps['gardenerAudit']> {
  let readRanAt: string | null = null;
  return {
    storedRun: async () => {
      const run = (await gardenerStateFor(services)).run();
      readRanAt = run?.ranAt ?? null;
      return run;
    },
    checkContext: async () => gardenerContext(services),
    book: async (audit, at) => {
      const state = await gardenerStateFor(services);
      // A throw leaves the job open: the next settle reads the run again and says why not.
      if (readRanAt === null || !(await state.bookAgentAudit(readRanAt, audit, at))) {
        throw new Error('The maintenance run changed before the audit was booked');
      }
      wakeGardener(services);
    },
  };
}

export function agentJobDeps(services: Services): AgentJobDeps {
  const vaultRoot = services.requireVaultRoot();
  return {
    vaultRoot,
    store: new FsVaultStore(vaultRoot),
    jobs: createAgentJobFiles(vaultRoot),
    docLanguage: services.settings.vault()?.languages.documents ?? 'de',
    gardenerAudit: gardenerAuditDep(services),
  };
}

/** The jobs as the renderer lists them, finished curate jobs with what their run did. */
export function agentJobViews(deps: AgentJobDeps): Promise<AgentJobView[]> {
  return listAgentJobViews(deps.jobs, () =>
    readRecentRuns(new FsVaultStore(deps.vaultRoot), RECENT_RUNS),
  );
}

/** Runs `task` after everything queued before it, whether that succeeded or not. */
export function runAgentJobsExclusive<T>(services: Services, task: () => Promise<T>): Promise<T> {
  const next = (chains.get(services) ?? Promise.resolve()).then(task, task);
  chains.set(services, next);
  return next;
}

export async function emitAgentJobs(services: Services, deps: AgentJobDeps): Promise<void> {
  services.sendEvent('event:agent-jobs', await agentJobViews(deps));
}

/** Settles every job that has an answer and tells the renderer if any job changed (or always, for a new run report). */
export function settleAgentJobsQueued(
  services: Services,
  options: { alwaysEmit?: boolean } = {},
): Promise<void> {
  return runAgentJobsExclusive(services, async () => {
    if (services.vaultRoot() === null) return;
    try {
      const deps = agentJobDeps(services);
      const changed = await settleAgentJobs(deps);
      if (changed || options.alwaysEmit === true) await emitAgentJobs(services, deps);
    } catch (error) {
      // The error's kind only: a message may quote vault content.
      console.warn('[agent/settle] failed:', error instanceof Error ? error.name : 'error');
    }
  });
}
