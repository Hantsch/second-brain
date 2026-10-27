/* Everything in main that touches the agent's job files goes through one promise chain per
   container, so two watcher bursts, or a withdraw next to a settle, never book twice or book a
   job that was just taken back. A settle never rejects: it is a follow-up to a file change, and
   a job that could not be settled simply stays open for the next one. (story 090) */

import { createAgentJobFiles } from '@core/agent/job-files';
import { listAgentJobViews } from '@core/agent/job-views';
import { settleAgentJobs, type AgentJobDeps } from '@core/agent/settle-jobs';
import { FsVaultStore } from '@core/vault';
import { AGENT_DIRS } from '@shared/types';
import type { Services } from './services';

const chains = new WeakMap<Services, Promise<unknown>>();

/** Whether a vault-relative path is an exchange file the agent or Gaston writes for jobs. */
export function isAgentJobPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return [AGENT_DIRS.jobs, AGENT_DIRS.results].some((dir) => normalized.startsWith(`${dir}/`));
}

export function agentJobDeps(services: Services): AgentJobDeps {
  const vaultRoot = services.requireVaultRoot();
  return {
    vaultRoot,
    store: new FsVaultStore(vaultRoot),
    jobs: createAgentJobFiles(vaultRoot),
    docLanguage: services.settings.vault()?.languages.documents ?? 'de',
  };
}

/** Runs `task` after everything queued before it, whether that succeeded or not. */
export function runAgentJobsExclusive<T>(services: Services, task: () => Promise<T>): Promise<T> {
  const next = (chains.get(services) ?? Promise.resolve()).then(task, task);
  chains.set(services, next);
  return next;
}

export async function emitAgentJobs(services: Services, deps: AgentJobDeps): Promise<void> {
  services.sendEvent('event:agent-jobs', await listAgentJobViews(deps.jobs));
}

/** Settles every job that has an answer and tells the renderer if any job changed. */
export function settleAgentJobsQueued(services: Services): Promise<void> {
  return runAgentJobsExclusive(services, async () => {
    if (services.vaultRoot() === null) return;
    try {
      const deps = agentJobDeps(services);
      if (await settleAgentJobs(deps)) await emitAgentJobs(services, deps);
    } catch (error) {
      // The error's kind only: a message may quote vault content.
      console.warn('[agent/settle] failed:', error instanceof Error ? error.name : 'error');
    }
  });
}
