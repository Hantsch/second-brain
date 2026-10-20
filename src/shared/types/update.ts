/* State of the "is there a newer Gaston" check, shared by main and renderer. */

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'error';

export type UpdateFailure = 'network' | 'http' | 'feed' | 'timeout' | 'unknown';

export type UpdateDistribution = 'installed' | 'portable';

/** A newer release the check found. */
export interface UpdateOffer {
  version: string;
  notes: string;
  /** ISO timestamp, or `null` when the feed gives no release date. */
  releasedAt: string | null;
}

export interface UpdateState {
  status: UpdateStatus;
  /** `false` when checking makes no sense in this run; `disabledReason` says why. */
  supported: boolean;
  disabledReason: 'unpackaged' | 'demo' | null;
  distribution: UpdateDistribution;
  currentVersion: string;
  update: UpdateOffer | null;
  error: UpdateFailure | null;
  /** ISO timestamps. */
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
}
