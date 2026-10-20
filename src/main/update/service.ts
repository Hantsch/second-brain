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
  UpdateDownloadErrorKey,
  UpdateProgress,
  UpdateState,
} from '@shared/types';
import type { DownloadOutcome, UpdateBackend } from './backend';
import { UNAVAILABLE_UPDATE_BACKEND } from './backend';
import type { UpdateCheckResult } from './checker';
import { RELEASE_TAG_URL_PREFIX } from './checker';
import type { RestartBlocker } from './restart-blocker';
import {
  BLOCKER_ERRORS,
  NOTHING_KNOWN,
  deriveStatus,
  derivePhase,
  isWindowOpen,
  offerOf,
} from './state';
import type { Known } from './state';
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

type Stage =
  | {
      kind: 'downloading';
      version: string;
      progress: UpdateProgress;
      controller: AbortController;
      settled: Promise<UpdateActionResult>;
    }
  | { kind: 'downloaded'; version: string };

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
  let stage: Stage | null = null;
  let downloadError: UpdateDownloadErrorKey | null = null;
  let downloadErrorVersion: string | null = null;
  let dismissed = false;

  // A staged update must never install itself on an ordinary quit.
  backend.autoInstallOnAppQuit = false;

  function compose(): UpdateState {
    const { supported, disabledReason } = options.isSupported();
    const status = checking ? 'checking' : deriveStatus(known);
    const offer = known.update;
    // A stage belongs to one version; a later check offering another one supersedes it.
    const staged = stage !== null && offer?.version === stage.version ? stage : null;
    return {
      phase: derivePhase(status, staged?.kind ?? null),
      status,
      supported,
      disabledReason: supported ? null : disabledReason,
      distribution: options.distribution,
      currentVersion: options.currentVersion,
      ...known,
      progress: staged?.kind === 'downloading' ? staged.progress : null,
      dismissed,
      downloadError,
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

  /** Never rejects and never outlasts `timeoutMs`; a late answer after a timeout is ignored. */
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
      if (result.kind !== 'failed' && known.update?.version !== downloadErrorVersion) {
        downloadError = null;
        downloadErrorVersion = null;
      }
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

  function settleDownload(
    current: Extract<Stage, { kind: 'downloading' }>,
    outcome: DownloadOutcome,
  ): UpdateActionResult {
    const cancelled = current.controller.signal.aborted;
    if (outcome.kind === 'done' && !cancelled) {
      stage = { kind: 'downloaded', version: current.version };
      backend.autoInstallOnAppQuit = false;
      return { ok: true, state: publish() };
    }
    stage = null;
    downloadErrorVersion = current.version;
    downloadError = `update.error.download.${cancelled || outcome.kind === 'done' ? 'cancelled' : outcome.reason}`;
    return refuse(downloadError);
  }

  /* Deliberately not a work-queue task: it holds no vault state, and the
     restart guard must not count the very download it is about to install. */
  async function startDownload(): Promise<UpdateActionResult> {
    if (options.isSupported().supported) await ensureRestored();
    if (options.distribution === 'portable') return refuse('update.error.notInstallable');
    const version = known.update?.version;
    if (version === undefined || compose().phase !== 'available') {
      return refuse('update.error.notAvailable');
    }
    backend.autoInstallOnAppQuit = false;
    downloadError = null;
    const controller = new AbortController();
    const current: Extract<Stage, { kind: 'downloading' }> = {
      kind: 'downloading',
      version,
      progress: { ratio: null, bytesDone: 0, bytesTotal: null },
      controller,
      settled: Promise.resolve({ ok: true, state: compose() }),
    };
    stage = current;
    publish();
    current.settled = Promise.resolve()
      .then(() =>
        backend.download(controller.signal, (progress) => {
          if (stage !== current || controller.signal.aborted) return;
          current.progress = progress;
          publish();
        }),
      )
      .catch((): DownloadOutcome => ({ kind: 'failed', reason: 'unknown' }))
      .then((outcome) => settleDownload(current, outcome));
    return current.settled;
  }

  async function cancelDownload(): Promise<UpdateActionResult> {
    const running = stage;
    if (running?.kind !== 'downloading') return { ok: true, state: compose() };
    running.controller.abort();
    await running.settled;
    return { ok: true, state: compose() };
  }

  async function installAndRestart(): Promise<UpdateActionResult> {
    if (compose().phase !== 'downloaded') return refuse('update.error.notReady');
    const blocker = restartBlocker();
    if (blocker !== null) return refuse(BLOCKER_ERRORS[blocker]);
    try {
      backend.quitAndInstall();
    } catch (error) {
      console.warn('[update] quitAndInstall failed:', error);
      return refuse('update.error.installFailed');
    }
    return { ok: true, state: compose() };
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
    startDownload,
    cancelDownload,
    installAndRestart,
    dismiss,
  };
}
