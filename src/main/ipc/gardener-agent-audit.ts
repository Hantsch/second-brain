/* What the maintenance screen needs to offer the agent an audit of the stored run, and the
   one place that builds the hand-over job for it. */

import { auditPages, hasAudit } from '@core/gardener';
import { createAgentJobFiles } from '@core/agent/job-files';
import type { GardenerReport } from '@shared/types';
import { gardenerContext, gardenerStateFor } from './gardener-deps';
import type { Services } from '../services';

/** The stored run when it can still be handed over: no audit yet and a page to interpret. */
export async function auditCandidate(services: Services) {
  const run = (await gardenerStateFor(services)).run();
  if (run === null || hasAudit(run)) return null;
  const ctx = gardenerContext(services);
  return auditPages(ctx, run.findings).length > 0 ? { ctx, run } : null;
}

/**
 * Adds `agentAudit` to a report. A vault whose index cannot be read yet offers nothing
 * rather than failing the whole report read.
 */
export async function withAgentAudit<T extends GardenerReport | null>(
  services: Services,
  report: T,
): Promise<T> {
  if (report === null) return report;
  const jobs = createAgentJobFiles(services.requireVaultRoot());
  const candidate = await auditCandidate(services).catch(() => null);
  // Only the job for the stored run counts: one left for a replaced run says nothing about this one.
  const ranAt = (await gardenerStateFor(services).catch(() => null))?.run()?.ranAt;
  const open = (await jobs.open()).some(
    (job) => job.kind === 'gardener-audit' && job.subject === ranAt,
  );
  const offered = candidate !== null;
  return { ...report, agentAudit: { offered, open } };
}
