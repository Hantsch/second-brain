/* The agent's jobs over IPC: `agent:jobs` lists them, `agent:handOverSource` files a
   condense-source job for a waiting raw source, `agent:withdrawJob` takes an open one back.

   The renderer sends a raw path and an id, never a job: the job's content is built in core
   from what is on disk. Settling after the agent's answer lives in `../agent-jobs-settle.ts`;
   this module only shares its serial chain, so a withdraw cannot interleave with a settle.
   (story 090) */

import { HandOverError, handOverSource } from '@core/agent/condense-source-job';
import { fileCurateJob } from '@core/agent/curate-job';
import { buildAuditJob } from '@core/agent/audit-job';
import { openJobView } from '@core/agent/job-views';
import { assertSafeVaultPath, slugify } from '@core/vault/paths';
import type { IpcError } from '@shared/ipc';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import type { Services } from '../services';
import {
  agentJobDeps,
  agentJobViews,
  emitAgentJobs,
  runAgentJobsExclusive,
} from '../agent-jobs-settle';
import { auditCandidate } from './gardener-agent-audit';

const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const WITHDRAWN = 'Withdrawn by the user';

const REFUSAL_CODES: Record<HandOverError['code'], IpcError['code']> = {
  'not-a-source': 'not-found',
  'already-condensed': 'conflict',
  'unknown-module': 'not-found',
  'help-module': 'invalid',
};

function requireRawPath(request: unknown): string {
  const path = (request as { rawPath?: unknown } | null)?.rawPath;
  if (typeof path !== 'string') throw fail('invalid', 'rawPath: not a path');
  let safe: string;
  try {
    safe = assertSafeVaultPath(path);
  } catch {
    throw fail('invalid', 'rawPath: not a vault path');
  }
  if (!safe.startsWith('raw/')) throw fail('invalid', 'rawPath: not a raw source');
  return safe;
}

function requireModule(request: unknown): string | null {
  const module = (request as { module?: unknown } | null)?.module;
  if (module === null || module === undefined) return null;
  if (typeof module !== 'string') throw fail('invalid', 'module: not a module name');
  return module;
}

/** A module is named by its slug exactly as the wiki writes it; anything else is no module. */
function requireModuleSlug(request: unknown): string {
  const module = (request as { module?: unknown } | null)?.module;
  if (typeof module !== 'string' || module === '' || slugify(module) !== module) {
    throw fail('invalid', 'module: not a module slug');
  }
  return module;
}

function requireId(request: unknown): string {
  const id = (request as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !JOB_ID.test(id)) throw fail('invalid', 'id: not a job id');
  return id;
}

export function agentJobsHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'agent:jobs': async () => agentJobViews(agentJobDeps(services)),
    'agent:handOverSource': async (request) => {
      const rawPath = requireRawPath(request);
      const module = requireModule(request);
      return runAgentJobsExclusive(services, async () => {
        const deps = agentJobDeps(services);
        try {
          const { status, job } = await handOverSource(deps, {
            rawPath,
            module,
            language: deps.docLanguage ?? 'de',
          });
          if (status === 'filed') await emitAgentJobs(services, deps);
          return { outcome: status, job: openJobView(job) };
        } catch (error) {
          if (error instanceof HandOverError) throw fail(REFUSAL_CODES[error.code], error.message);
          throw error;
        }
      });
    },
    'agent:handOverModule': async (request) => {
      const module = requireModuleSlug(request);
      return runAgentJobsExclusive(services, async () => {
        const deps = agentJobDeps(services);
        try {
          const { status, job } = await fileCurateJob(deps, module);
          if (status === 'filed') await emitAgentJobs(services, deps);
          return { outcome: status, job: openJobView(job) };
        } catch (error) {
          if (error instanceof HandOverError) throw fail(REFUSAL_CODES[error.code], error.message);
          throw error;
        }
      });
    },
    'agent:handOverGardenerRun': async () =>
      runAgentJobsExclusive(services, async () => {
        const deps = agentJobDeps(services);
        // The run is read here, never taken from the renderer: it may have been replaced since the screen drew it.
        const candidate = await auditCandidate(services);
        const job = candidate === null ? null : buildAuditJob(candidate.ctx, candidate.run);
        if (job === null) throw fail('conflict', 'There is no maintenance run to hand over.');
        const status = await deps.jobs.file(job);
        if (status === 'filed') await emitAgentJobs(services, deps);
        const open = (await deps.jobs.open()).find(
          (other) => other.kind === job.kind && other.subject === job.subject,
        );
        return { outcome: status, job: openJobView(status === 'filed' ? job : (open ?? job)) };
      }),
    'agent:withdrawJob': async (request) => {
      const id = requireId(request);
      return runAgentJobsExclusive(services, async () => {
        const deps = agentJobDeps(services);
        // A job that is gone already (settled meanwhile) is simply not withdrawn.
        if (await deps.jobs.finish(id, 'withdrawn', WITHDRAWN)) await emitAgentJobs(services, deps);
        return agentJobViews(deps);
      });
    },
  });
}
