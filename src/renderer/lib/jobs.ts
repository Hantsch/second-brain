/* Which ingest job is still working.
   The renderer's copy of `TERMINAL_STAGES` from the core: the list is short and
   part of the IPC contract, and the view layer must not import the ingest core.
   It matters in three places — the job list, the source dialog, and the row with
   the "condense" button — and they have to agree, or a second click sneaks past. */

import type { IngestJob } from '@shared/types';

/** Stages where nothing is running anymore — same as `TERMINAL_STAGES` in the core. */
const TERMINAL: readonly IngestJob['stage'][] = [
  'done',
  'error',
  'duplicate',
  'awaiting-llm',
  'no-content',
];

export function isJobRunning(job: IngestJob): boolean {
  return !TERMINAL.includes(job.stage);
}

/** The most recent refetch of this raw source, running or finished, or null. */
export function latestRefetchFor(jobs: readonly IngestJob[], rawPath: string): IngestJob | null {
  return [...jobs].reverse().find((job) => job.refetch === true && job.rawPath === rawPath) ?? null;
}

/** The most recent running job for this raw source, or null. */
export function runningJobFor(jobs: readonly IngestJob[], rawPath: string): IngestJob | null {
  return [...jobs].reverse().find((job) => job.rawPath === rawPath && isJobRunning(job)) ?? null;
}
