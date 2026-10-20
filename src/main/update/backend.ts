/* The download-and-install half of `electron-updater`, behind `UpdateBackend` so
   the service stays Electron-free and tests never load the library.

   `autoInstallOnAppQuit` is the dangerous switch: left `true`, a downloaded
   update installs itself on the next ordinary quit, without the restart guard
   ever being asked. The library only consults it when the download finishes and
   again at quit, so the service sets it to `false` before every download and
   this adapter forces it once more on load. */

import type { UpdateDownloadFailure, UpdateProgress } from '../../shared/types/update';
import type { AutoUpdaterLike } from './checker';
import { classifyError, configureAutoUpdater, importUpdaterExport } from './checker';

export type DownloadOutcome = { kind: 'done' } | { kind: 'failed'; reason: UpdateDownloadFailure };

export interface UpdateBackend {
  /** Never rejects; an aborted `signal` ends in `cancelled`. */
  download(
    signal: AbortSignal,
    onProgress: (progress: UpdateProgress) => void,
  ): Promise<DownloadOutcome>;
  /** Quits through `app.quit()`, so `before-quit` and the close guard see it like any quit. */
  quitAndInstall(): void;
  autoInstallOnAppQuit: boolean;
}

/** Used when no real backend may run (the e2e fixture, unit tests): nothing downloads, nothing installs. */
export const UNAVAILABLE_UPDATE_BACKEND: UpdateBackend = {
  download: () => Promise.resolve({ kind: 'failed', reason: 'unknown' }),
  quitAndInstall: () => {
    throw new Error('no update backend');
  },
  autoInstallOnAppQuit: false,
};

interface ProgressInfo {
  total?: number;
  transferred?: number;
}

interface CancellationTokenLike {
  cancel(): void;
}

interface DownloadingUpdaterLike extends AutoUpdaterLike {
  downloadUpdate(token?: CancellationTokenLike): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: 'download-progress', listener: (info: ProgressInfo) => void): unknown;
  removeListener(event: 'download-progress', listener: (info: ProgressInfo) => void): unknown;
}

function downloadFailure(error: unknown, signal: AbortSignal): UpdateDownloadFailure {
  if (signal.aborted) return 'cancelled';
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'ERR_CHECKSUM_MISMATCH') return 'checksum';
  if (error instanceof Error && error.message === 'cancelled') return 'cancelled';
  return classifyError(error) === 'network' ? 'offline' : 'unknown';
}

function toProgress(info: ProgressInfo): UpdateProgress {
  const bytesDone = typeof info.transferred === 'number' ? info.transferred : 0;
  const bytesTotal = typeof info.total === 'number' && info.total > 0 ? info.total : null;
  return {
    ratio: bytesTotal === null ? null : Math.min(1, bytesDone / bytesTotal),
    bytesDone,
    bytesTotal,
  };
}

export function createUpdateBackend(): UpdateBackend {
  let loaded: DownloadingUpdaterLike | undefined;
  let autoInstall = false;

  async function resolve(): Promise<DownloadingUpdaterLike> {
    if (loaded !== undefined) return loaded;
    const updater = (await importUpdaterExport('autoUpdater')) as DownloadingUpdaterLike;
    configureAutoUpdater(updater);
    updater.autoInstallOnAppQuit = autoInstall;
    loaded = updater;
    return updater;
  }

  async function download(
    signal: AbortSignal,
    onProgress: (progress: UpdateProgress) => void,
  ): Promise<DownloadOutcome> {
    const listener = (info: ProgressInfo): void => onProgress(toProgress(info));
    let updater: DownloadingUpdaterLike | undefined;
    try {
      updater = await resolve();
      const Token = (await importUpdaterExport(
        'CancellationToken',
      )) as new () => CancellationTokenLike;
      /* The update info a download needs lives in this process only; an offer
         restored from disk had no check here yet. Asking again also confirms
         the release is still there. It may therefore fetch a newer version than
         the one announced; the service does not detect that, the staged version
         stays the announced one until the next check replaces the offer. */
      const checked = (await updater.checkForUpdates()) as { isUpdateAvailable?: boolean } | null;
      if (signal.aborted) return { kind: 'failed', reason: 'cancelled' };
      if (checked === null || checked.isUpdateAvailable !== true) {
        return { kind: 'failed', reason: 'unknown' };
      }
      const token = new Token();
      signal.addEventListener('abort', () => token.cancel(), { once: true });
      updater.on('download-progress', listener);
      await updater.downloadUpdate(token);
      if (signal.aborted) return { kind: 'failed', reason: 'cancelled' };
      return { kind: 'done' };
    } catch (error) {
      return { kind: 'failed', reason: downloadFailure(error, signal) };
    } finally {
      updater?.removeListener('download-progress', listener);
    }
  }

  return {
    download,
    quitAndInstall() {
      if (loaded === undefined) throw new Error('nothing was downloaded in this process');
      loaded.quitAndInstall();
    },
    get autoInstallOnAppQuit() {
      return autoInstall;
    },
    set autoInstallOnAppQuit(value: boolean) {
      autoInstall = value;
      if (loaded !== undefined) loaded.autoInstallOnAppQuit = value;
    },
  };
}
