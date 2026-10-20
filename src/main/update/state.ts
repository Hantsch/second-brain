/* Pure derivations behind the update service's state: no I/O, no clock of its own. */

import type { UpdateActionErrorKey, UpdateOffer, UpdatePhase, UpdateStatus } from '@shared/types';
import type { UpdateCheckResult } from './checker';
import type { RestartBlocker } from './restart-blocker';
import type { UpdateRecord } from './store';

export const UPDATE_CHECK_WINDOW_MS = 24 * 60 * 60 * 1000;

export const BLOCKER_ERRORS: Record<RestartBlocker, UpdateActionErrorKey> = {
  taskRunning: 'update.error.taskRunning',
  llmStreaming: 'update.error.llmStreaming',
};

/** The single place the UI-facing phase is decided. */
export function derivePhase(
  status: UpdateStatus,
  stage: 'downloading' | 'downloaded' | null,
): UpdatePhase {
  if (stage !== null) return stage;
  return status === 'up-to-date' ? 'idle' : status;
}

export type Known = Pick<UpdateRecord, 'update' | 'error' | 'lastCheckedAt' | 'lastSuccessAt'>;

export const NOTHING_KNOWN: Known = {
  update: null,
  error: null,
  lastCheckedAt: null,
  lastSuccessAt: null,
};

export function deriveStatus(known: Known): UpdateStatus {
  if (known.error !== null) return 'error';
  if (known.update !== null) return 'available';
  if (known.lastSuccessAt !== null) return 'up-to-date';
  return 'idle';
}

/** An unparseable or future timestamp (a clock corrected backwards) cannot be trusted to keep the window shut. */
export function isWindowOpen(lastSuccessAt: string | null, nowMs: number): boolean {
  if (lastSuccessAt === null) return true;
  const last = Date.parse(lastSuccessAt);
  if (Number.isNaN(last)) return true;
  const elapsed = nowMs - last;
  return elapsed < 0 || elapsed >= UPDATE_CHECK_WINDOW_MS;
}

export function offerOf(result: UpdateCheckResult): UpdateOffer | null {
  if (result.kind !== 'available') return null;
  return { version: result.version, notes: result.notes, releasedAt: result.releasedAt };
}
