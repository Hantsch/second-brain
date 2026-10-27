/* Download, cancel and install staging for the update service.

   Lives in memory only: a failed or cancelled download changes nothing on disk,
   so the offer stays offerable. The install never cancels anything — it reads
   the injected restart blocker and refuses while work is in flight. */

import type {
  UpdateActionErrorKey,
  UpdateActionResult,
  UpdateDistribution,
  UpdateDownloadErrorKey,
  UpdateProgress,
  UpdateState,
} from '@shared/types';
import type { DownloadOutcome, UpdateBackend } from './backend';
import type { RestartBlocker } from './restart-blocker';
import { BLOCKER_ERRORS } from './state';

type DownloadingStage = {
  kind: 'downloading';
  version: string;
  progress: UpdateProgress;
  controller: AbortController;
  settled: Promise<UpdateActionResult>;
};

type Stage = DownloadingStage | { kind: 'downloaded'; version: string };

export interface UpdateStagingDeps {
  backend: UpdateBackend;
  distribution: UpdateDistribution;
  restartBlocker: () => RestartBlocker | null;
  /** Authorises the installer's quit past the close guard; returns its revoke. */
  authoriseQuit: () => () => void;
  /** Resolves once the remembered check is loaded, so the offer is current. */
  ready: () => Promise<void>;
  offerVersion: () => string | undefined;
  phase: () => UpdateState['phase'];
  publish: () => UpdateState;
  refuse: (error: UpdateActionErrorKey) => UpdateActionResult;
  /** A manual check; resolves to the state after it. */
  recheck: () => Promise<UpdateState>;
}

export interface UpdateStaging {
  /** The stage, only while the offer still names its version. */
  stagedFor(offerVersion: string | undefined): {
    kind: Stage['kind'] | null;
    progress: UpdateProgress | null;
  };
  downloadError(): UpdateDownloadErrorKey | null;
  /** A download reason describes one version; once a check offers another (or none) it is stale. */
  forgetErrorUnless(offerVersion: string | undefined): void;
  startDownload(): Promise<UpdateActionResult>;
  cancelDownload(): Promise<UpdateActionResult>;
  installAndRestart(): Promise<UpdateActionResult>;
}

export function createUpdateStaging(deps: UpdateStagingDeps): UpdateStaging {
  const { backend } = deps;
  let stage: Stage | null = null;
  let downloadError: UpdateDownloadErrorKey | null = null;
  let downloadErrorVersion: string | null = null;

  function stagedFor(offerVersion: string | undefined): ReturnType<UpdateStaging['stagedFor']> {
    // A stage belongs to one version; a later check offering another one supersedes it.
    const staged = stage !== null && offerVersion === stage.version ? stage : null;
    return {
      kind: staged?.kind ?? null,
      progress: staged?.kind === 'downloading' ? staged.progress : null,
    };
  }

  function forgetErrorUnless(offerVersion: string | undefined): void {
    if (offerVersion === downloadErrorVersion) return;
    downloadError = null;
    downloadErrorVersion = null;
  }

  async function settleDownload(
    current: DownloadingStage,
    outcome: DownloadOutcome,
  ): Promise<UpdateActionResult> {
    const cancelled = current.controller.signal.aborted;
    if (outcome.kind === 'done' && !cancelled) {
      stage = { kind: 'downloaded', version: current.version };
      backend.autoInstallOnAppQuit = false;
      return { ok: true, state: deps.publish() };
    }
    stage = null;
    if (outcome.kind === 'superseded' && !cancelled) {
      // Nothing was fetched; the feed names another version, so the offer must follow it.
      downloadError = null;
      downloadErrorVersion = null;
      return { ok: true, state: await deps.recheck() };
    }
    downloadErrorVersion = current.version;
    downloadError = `update.error.download.${cancelled || outcome.kind !== 'failed' ? 'cancelled' : outcome.reason}`;
    return deps.refuse(downloadError);
  }

  /* Deliberately not a work-queue task: it holds no vault state, and the
     restart guard must not count the very download it is about to install. */
  async function startDownload(): Promise<UpdateActionResult> {
    await deps.ready();
    if (deps.distribution === 'portable') return deps.refuse('update.error.notInstallable');
    const version = deps.offerVersion();
    if (version === undefined || deps.phase() !== 'available') {
      return deps.refuse('update.error.notAvailable');
    }
    backend.autoInstallOnAppQuit = false;
    downloadError = null;
    const controller = new AbortController();
    const current: DownloadingStage = {
      kind: 'downloading',
      version,
      progress: { ratio: null, bytesDone: 0, bytesTotal: null },
      controller,
      settled: Promise.resolve({ ok: true, state: deps.publish() }),
    };
    stage = current;
    deps.publish();
    current.settled = Promise.resolve()
      .then(() =>
        backend.download(
          controller.signal,
          (progress) => {
            if (stage !== current || controller.signal.aborted) return;
            current.progress = progress;
            deps.publish();
          },
          version,
        ),
      )
      .catch((): DownloadOutcome => ({ kind: 'failed', reason: 'unknown' }))
      .then((outcome) => settleDownload(current, outcome));
    return current.settled;
  }

  async function cancelDownload(): Promise<UpdateActionResult> {
    const running = stage;
    if (running?.kind !== 'downloading') return { ok: true, state: deps.publish() };
    running.controller.abort();
    await running.settled;
    return { ok: true, state: deps.publish() };
  }

  async function installAndRestart(): Promise<UpdateActionResult> {
    if (deps.phase() !== 'downloaded') return deps.refuse('update.error.notReady');
    const blocker = deps.restartBlocker();
    if (blocker !== null) return deps.refuse(BLOCKER_ERRORS[blocker]);
    /* The blocker check above is the question the close guard would ask; a task
       that starts between here and the quit must not veto an installer that is
       already on its way. Granted only now, so a refusal above authorises nothing. */
    const revoke = deps.authoriseQuit();
    try {
      backend.quitAndInstall();
    } catch (error) {
      // Nothing quits, so the next close must be guarded again.
      revoke();
      console.warn('[update] quitAndInstall failed:', error);
      return deps.refuse('update.error.installFailed');
    }
    return { ok: true, state: deps.publish() };
  }

  return {
    stagedFor,
    downloadError: () => downloadError,
    forgetErrorUnless,
    startDownload,
    cancelDownload,
    installAndRestart,
  };
}
