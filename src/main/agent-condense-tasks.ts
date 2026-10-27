/* A module condensation that is with the agent shows as a `condense` work task for the module,
   with the same subject ref an in-app run uses, so the Tasks screen and the proposal store find
   it the same way. The task is paced from outside the queue: it ends when the job does, whatever
   way the job ends. The proposal waits in the task results exactly like an in-app run's. */

import { createAgentJobFiles, type AgentJobFiles } from '@core/agent/job-files';
import { condenseModuleIsOpen } from '@core/agent/condense-module-job';
import type { AgentJobDeps } from '@core/agent/settler';
import type { ExternalTaskHandle, WorkRegistry } from '@core/work/registry';
import type { AgentJobFile, AgentJobOutcome } from '@shared/types';
import { condenseDocs } from './ipc/condense-docs';
import type { Services } from './services';
import { getTaskResults } from './task-results';
import { getWorkQueue } from './work-queue';

/** Handles by job id, per queue: a queue that is dropped takes its handles with it. */
const handles = new WeakMap<WorkRegistry, Map<string, ExternalTaskHandle>>();

export function condenseRef(slug: string): string {
  return `module:${slug}`;
}

function label(job: AgentJobFile): string {
  const title = job.fields['title'];
  return typeof title === 'string' && title.length > 0 ? title : job.subject;
}

function handlesOf(queue: WorkRegistry): Map<string, ExternalTaskHandle> {
  const known = handles.get(queue);
  if (known !== undefined) return known;
  const created = new Map<string, ExternalTaskHandle>();
  handles.set(queue, created);
  return created;
}

/** Starts the job's work task; a job already tracked keeps its task. */
export function startCondenseTask(services: Services, job: AgentJobFile): ExternalTaskHandle {
  const queue = getWorkQueue(services);
  const known = handlesOf(queue).get(job.id);
  if (known !== undefined) return known;
  const handle = queue.startExternal({
    kind: 'condense',
    lane: 'free',
    subject: { label: label(job), ref: condenseRef(job.subject) },
  });
  handlesOf(queue).set(job.id, handle);
  return handle;
}

/** Whether an in-app condensation of the module is queued or running (the agent's task is not one). */
export function inAppCondenseActive(services: Services, slug: string): boolean {
  const queue = getWorkQueue(services);
  const agentTasks = new Set([...handlesOf(queue).values()].map((handle) => handle.id));
  return queue
    .list()
    .some(
      (task) =>
        task.kind === 'condense' &&
        task.subject.ref === condenseRef(slug) &&
        (task.state === 'queued' || task.state === 'running') &&
        !agentTasks.has(task.id),
    );
}

/** Whether the module's condensation is with the agent, read from the job files. */
export function condenseWithAgent(services: Services, slug: string): Promise<boolean> {
  return condenseModuleIsOpen({ jobs: createAgentJobFiles(services.requireVaultRoot()) }, slug);
}

function endTask(
  services: Services,
  jobId: string,
  outcome: AgentJobOutcome,
  reason: string | null,
): void {
  const queue = getWorkQueue(services);
  const handle = handlesOf(queue).get(jobId);
  if (handle === undefined) return;
  handlesOf(queue).delete(jobId);
  if (outcome === 'done') {
    handle.finish({ hasResult: getTaskResults().get(handle.id) !== null });
  } else if (outcome === 'failed') {
    handle.fail(new Error(reason ?? 'The agent could not condense the module.'));
  } else {
    queue.cancel(handle.id);
  }
}

/** The job store the settler works on, ending the work task whenever a job is finished. */
function jobsEndingTasks(services: Services, jobs: AgentJobFiles): AgentJobFiles {
  return {
    ...jobs,
    finish: async (id, outcome, reason) => {
      const finished = await jobs.finish(id, outcome, reason);
      if (finished) endTask(services, id, outcome, reason);
      return finished;
    },
  };
}

/** The module-condensation parts of `AgentJobDeps`, wired to the work queue and the proposal store. */
export function withCondenseModuleTasks(services: Services, deps: AgentJobDeps): AgentJobDeps {
  return {
    ...deps,
    jobs: jobsEndingTasks(services, deps.jobs),
    condenseModule: {
      docs: () => condenseDocs(services),
      propose: (job, proposal) => {
        // A restart dropped the task but not the job: the proposal still needs a task to hang on.
        const handle = startCondenseTask(services, job);
        getTaskResults().put(
          handle.id,
          { kind: 'condense', proposal },
          { ref: condenseRef(job.subject) },
        );
      },
    },
  };
}
