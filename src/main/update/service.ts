/* Decides whether an update check runs and owns the resulting `UpdateState`.

   Electron-free: the checker, the clock, the support verdict and the storage
   directory are injected. The service never compares versions — "newer" is the
   checker's verdict; the only version test here is whether the stored record
   was written by the build that is running now.

   The 24 h window is measured from `lastSuccessAt` alone, and only a successful
   check writes it, so a failed check can never close the window. For the same
   reason a failure keeps the last known offer: an update found yesterday still
   shows after an offline start today.

   Downloading and installing are staged on top of that and live only in memory:
   a failed or cancelled download changes nothing on disk, so the offer stays
   offerable. The install never cancels anything — it reads the injected restart
   blocker and refuses while work is in flight. */

import type {
  UpdateActionErrorKey,
  UpdateActionResult,
  UpdateDistribution,
  UpdateState,
} from '@shared/types';
import type { UpdateBackend } from './backend';
import { UNAVAILABLE_UPDATE_BACKEND } from './backend';
import type { UpdateCheckResult } from './checker';
import { RELEASE_TAG_URL_PREFIX } from './checker';
import type { RestartBlocker } from './restart-blocker';
import { NOTHING_KNOWN, deriveStatus, derivePhase, isWindowOpen, offerOf } from './state';
import type { Known } from './state';
import { createUpdateStaging } from './staging';
import { loadUpdateRecord, saveUpdateRecord } from './store';

export { UPDATE_CHECK_WINDOW_MS } from './state';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_STARTUP_DELAY_MS = 3_000;

export interface UpdateSupport {
  supported: boolean;
  disabledReason: UpdateState['disabledReason'];
}

export interface UpdateServiceOptions {
  /** Directory holding the remembered check (`userData`). */
  dir: string;
  now?: () => Date;
  check: () => Promise<UpdateCheckResult>;
  currentVersion: string;
  distribution: UpdateDistribution;
  /** Asked on every call, so a verdict that settles after construction (demo mode) is honoured. */
  isSupported: () => UpdateSupport;
  timeoutMs?: number;
  onStateChange?: (state: UpdateState) => void;
  /** Omitted means nothing can be downloaded, so nothing can be installed either. */
  backend?: UpdateBackend;
  /** Read right before installing; only ever read, never used to stop the work it reports. */
  restartBlocker?: () => RestartBlocker | null;
  /** Lets the installer's quit past the close guard; returns the revoke for a failed hand-over. */
  authoriseQuit?: () => () => void;
}

export interface UpdateService {
  getState(): Promise<UpdateState>;
  /** A manual check ignores the 24 h window; an automatic one respects it. Never rejects. */
  check(options: { manual: boolean }): Promise<UpdateState>;
  /** Returns at once; the single automatic attempt of this process runs after `delayMs`. */
  scheduleStartupCheck(delayMs?: number): void;
  stop(): void;
  /** Only from `available`; resolves once the download finished, failed or was cancelled. */
  startDownload(): Promise<UpdateActionResult>;
  /** Resolves once the running download has settled back in `available`. */
  cancelDownload(): Promise<UpdateActionResult>;
  installAndRestart(): Promise<UpdateActionResult>;
  dismiss(): Promise<UpdateActionResult>;
}

export function createUpdateService(options: UpdateServiceOptions): UpdateService {
  const now = options.now ?? ((): Date => new Date());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let known: Known = NOTHING_KNOWN;
  let checking = false;
  let restoring: Promise<void> | undefined;
  let inFlight: Promise<UpdateState> | undefined;
  let startupScheduled = false;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let lastPublished = '';
  const backend = options.backend ?? UNAVAILABLE_UPDATE_BACKEND;
  const restartBlocker = options.restartBlocker ?? ((): RestartBlocker | null => null);
  let dismissed = false;

  // A staged update must never install itself on an ordinary quit.
  backend.autoInstallOnAppQuit = false;

  const staging = createUpdateStaging({
    backend,
    distribution: options.distribution,
    restartBlocker,
    authoriseQuit: options.authoriseQuit ?? (() => () => undefined),
    ready: async () => {
      if (options.isSupported().supported) await ensureRestored();
    },
    offerVersion: () => known.update?.version,
    phase: () => compose().phase,
    publish,
    refuse,
    recheck: () => check({ manual: true }),
  });

  function compose(): UpdateState {
    const { supported, disabledReason } = options.isSupported();
    const status = checking ? 'checking' : deriveStatus(known);
    const offer = known.update;
    const staged = staging.stagedFor(offer?.version);
    return {
      phase: derivePhase(status, staged.kind),
      status,
      supported,
      disabledReason: supported ? null : disabledReason,
      distribution: options.distribution,
      currentVersion: options.currentVersion,
      ...known,
      progress: staged.progress,
      dismissed,
      downloadError: staging.downloadError(),
      releaseUrl: offer === null ? null : `${RELEASE_TAG_URL_PREFIX}${offer.version}`,
    };
  }

  function refuse(error: UpdateActionErrorKey): UpdateActionResult {
    return { ok: false, error, state: publish() };
  }

  function publish(): UpdateState {
    const state = compose();
    const serialized = JSON.stringify(state);
    if (serialized === lastPublished) return state;
    lastPublished = serialized;
    try {
      options.onStateChange?.(state);
    } catch (error) {
      console.warn('[update] state listener failed:', error);
    }
    return state;
  }

  function ensureRestored(): Promise<void> {
    restoring ??= (async () => {
      const record = await loadUpdateRecord(options.dir);
      if (record === null) return;
      const { update, error, lastCheckedAt, lastSuccessAt } = record;
      // A record from another build may offer the very version now running, and its success
      // must not keep the window shut for the new build.
      known =
        record.checkedWith === options.currentVersion
          ? { update, error, lastCheckedAt, lastSuccessAt }
          : { update: null, error, lastCheckedAt, lastSuccessAt: null };
      publish();
    })();
    return restoring;
  }

  /* Never rejects and never outlasts `timeoutMs`; a late answer after a timeout is ignored.
     electron-updater cannot cancel a check and dedupes concurrent calls, so a timed-out call
     that runs on is harmless: its late answer is discarded here, and the next check joins or
     replaces it inside the library. */
  async function callChecker(): Promise<UpdateCheckResult> {
    const answered = Promise.resolve()
      .then(() => options.check())
      .catch((): UpdateCheckResult => ({ kind: 'failed', reason: 'unknown' }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<UpdateCheckResult>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'failed', reason: 'timeout' }), timeoutMs);
    });
    try {
      return await Promise.race([answered, timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function runAttempt(): Promise<UpdateState> {
    checking = true;
    publish();
    try {
      const result = await callChecker();
      const at = now().toISOString();
      known =
        result.kind === 'failed'
          ? { ...known, error: result.reason, lastCheckedAt: at }
          : { update: offerOf(result), error: null, lastCheckedAt: at, lastSuccessAt: at };
      // A download reason describes one version; once a check offers another (or none) it is stale.
      if (result.kind !== 'failed') staging.forgetErrorUnless(known.update?.version);
      await saveUpdateRecord(options.dir, {
        version: 1,
        checkedWith: options.currentVersion,
        ...known,
      });
    } finally {
      checking = false;
    }
    return publish();
  }

  async function check({ manual }: { manual: boolean }): Promise<UpdateState> {
    if (!options.isSupported().supported) return compose();
    await ensureRestored();
    if (inFlight !== undefined) return inFlight;
    if (!manual && !isWindowOpen(known.lastSuccessAt, now().getTime())) return compose();
    // Assigned synchronously after the last await, so a second caller always sees it and joins.
    const attempt = runAttempt()
      .catch(() => publish())
      .finally(() => {
        inFlight = undefined;
      });
    inFlight = attempt;
    return attempt;
  }

  async function getState(): Promise<UpdateState> {
    if (options.isSupported().supported) await ensureRestored();
    return compose();
  }

  function scheduleStartupCheck(delayMs = DEFAULT_STARTUP_DELAY_MS): void {
    if (startupScheduled) return;
    startupScheduled = true;
    startupTimer = setTimeout(() => {
      startupTimer = undefined;
      void check({ manual: false }).catch(() => undefined);
    }, delayMs);
  }

  function stop(): void {
    if (startupTimer !== undefined) clearTimeout(startupTimer);
    startupTimer = undefined;
  }

  async function dismiss(): Promise<UpdateActionResult> {
    dismissed = true;
    return { ok: true, state: publish() };
  }

  return {
    getState,
    check,
    scheduleStartupCheck,
    stop,
    startDownload: staging.startDownload,
    cancelDownload: staging.cancelDownload,
    installAndRestart: staging.installAndRestart,
    dismiss,
  };
}
