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

/** The one field the UI reads to decide what to show; derived from `status` plus the download stage. */
export type UpdatePhase =
  'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

export interface UpdateProgress {
  /** 0..1, or `null` while the total size is unknown. */
  ratio: number | null;
  bytesDone: number;
  bytesTotal: number | null;
}

export type UpdateDownloadFailure = 'offline' | 'checksum' | 'cancelled' | 'unknown';

/** i18n key of a failed download; the update stays offerable after any of them. */
export type UpdateDownloadErrorKey = `update.error.download.${UpdateDownloadFailure}`;

/** i18n keys main answers a refused update action with — keys, never prose. */
export type UpdateActionErrorKey =
  | UpdateDownloadErrorKey
  | 'update.error.notInstallable'
  | 'update.error.notAvailable'
  | 'update.error.notReady'
  | 'update.error.taskRunning'
  | 'update.error.llmStreaming'
  | 'update.error.installFailed';

/** Every update action answers with the state it left behind, refused or not. */
export type UpdateActionResult =
  { ok: true; state: UpdateState } | { ok: false; error: UpdateActionErrorKey; state: UpdateState };

export interface UpdateState {
  phase: UpdatePhase;
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
  /** Set only while downloading. */
  progress: UpdateProgress | null;
  /** "Not now" for this process; never persisted. */
  dismissed: boolean;
  downloadError: UpdateDownloadErrorKey | null;
  /** Release page of the offered version; set whenever an offer exists. */
  releaseUrl: string | null;
}
