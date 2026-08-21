/* Confirm dialog for getting the local runtime (019c D6). Mirrors
   `ProviderDialog`'s shape: a `Dialog` atom, local `busy`/`error`/`result`
   state, a footer that switches with the phase.

   Every fact the plan carries is named before the download starts —
   size, installer path, model directory, and the no-uninstall caveat — so
   confirming here is an informed proposal, not a blind "yes" (guardrail 2).
   While a download is running the dialog can only be closed via the explicit
   cancel button: closing any other way would leave main's download running
   unseen, so the `X`/scrim/Escape paths are disabled for that phase by
   passing no `onClose` to the `Dialog` atom. */

import { useEffect, useRef, useState } from 'react';
import type { RuntimePlan } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { useLanguage, useT } from '../../i18n';
import { bridge } from '../../lib/bridge';
import { formatBytes } from '../../lib/format';
import { decodeIpcError } from '../../lib/ipc-error';
import { useRuntimeMutations } from '../../lib/queries/llm';

export interface LocalRuntimeInstallDialogProps {
  plan: RuntimePlan;
  onClose: () => void;
}

interface InstallProgress {
  downloadedMb: number;
  totalMb: number;
  done: boolean;
  error?: string;
}

type Phase = 'confirm' | 'downloading' | 'failed' | 'done';

function phaseOf(downloadId: string | null, progress: InstallProgress | null): Phase {
  if (downloadId === null) return 'confirm';
  if (!progress?.done) return 'downloading';
  return progress.error ? 'failed' : 'done';
}

export function LocalRuntimeInstallDialog({ plan, onClose }: LocalRuntimeInstallDialogProps) {
  const t = useT();
  const language = useLanguage();
  const { download, cancelDownload, openInstaller } = useRuntimeMutations();
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [installerResult, setInstallerResult] = useState<{
    opened: boolean;
    reason?: string;
  } | null>(null);

  /* Holds the *known* download id for the `on()` callback below to filter
     by. A ref, not the `downloadId` state: the subscription must exist
     before `confirm()` even runs (see the effect's empty deps below), and
     the id must become filterable the instant it's known — a state update
     only takes effect on the next render, one tick later, which is exactly
     the gap a fast failure's only `done: true` event could fall into and be
     lost forever (F2). Setting a ref is synchronous, closing that gap. */
  const knownDownloadId = useRef<string | null>(null);

  useEffect(() => {
    // Subscribed once, unconditionally, for the dialog's whole lifetime —
    // not gated on `downloadId` being set. By the time the user can press
    // "confirm" the dialog has already mounted, so this listener is already
    // in place before any download (and its events) can possibly start.
    return bridge().on('event:install-progress', (chunk) => {
      if (chunk.downloadId !== knownDownloadId.current) return;
      setProgress(chunk);
    });
  }, []);

  const phase = phaseOf(downloadId, progress);

  const confirm = async (): Promise<void> => {
    setConfirmError(null);
    try {
      const { downloadId: id } = await download.mutateAsync();
      // Set synchronously, as the very first thing after learning the id —
      // before any `await` yields control back to the event loop where a
      // just-arrived progress event could otherwise be filtered out.
      knownDownloadId.current = id;
      setProgress(null);
      setDownloadId(id);
    } catch (failure) {
      setConfirmError(t(`error.code.${decodeIpcError(failure).code}`));
    }
  };

  const cancel = (): void => {
    if (downloadId === null) return;
    cancelDownload.mutate(downloadId, { onSuccess: onClose });
  };

  const tryAgain = (): void => {
    knownDownloadId.current = null;
    setDownloadId(null);
    setProgress(null);
  };

  const openTheInstaller = async (): Promise<void> => {
    setInstallerResult(await openInstaller.mutateAsync());
  };

  const pct =
    progress && progress.totalMb > 0
      ? Math.min(100, Math.round((progress.downloadedMb / progress.totalMb) * 100))
      : 0;

  return (
    <Dialog
      open
      title={t('settings.runtime.dialog.title')}
      onClose={phase === 'downloading' ? undefined : onClose}
      closeLabel={t('common.close')}
      size="md"
      footer={
        phase === 'confirm' ? (
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              icon="download"
              loading={download.isPending}
              onClick={() => void confirm()}
            >
              {t('settings.runtime.dialog.confirm')}
            </Button>
          </>
        ) : phase === 'downloading' ? (
          <Button
            variant="ghost"
            size="sm"
            icon="x"
            loading={cancelDownload.isPending}
            onClick={cancel}
          >
            {t('settings.runtime.dialog.cancelDownload')}
          </Button>
        ) : phase === 'failed' ? (
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button size="sm" icon="refresh-cw" onClick={tryAgain}>
              {t('common.retry')}
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
        )
      }
    >
      <div className="sb-setting-block">
        {phase === 'confirm' ? (
          <>
            <p className="sb-dialog-lead">{t('settings.runtime.dialog.intro')}</p>
            <p>
              {t('settings.runtime.dialog.size', {
                mb: formatBytes(plan.downloadMb * 1024 * 1024, language),
              })}
            </p>
            <p>{t('settings.runtime.dialog.installerPath', { path: plan.installerPath })}</p>
            <p>{t('settings.runtime.dialog.modelDir', { path: plan.modelDirHint })}</p>
            <p>{t('settings.runtime.dialog.noUninstall')}</p>
            {confirmError ? <p className="sb-note-detail sb-note-bad">{confirmError}</p> : null}
          </>
        ) : null}

        {phase === 'downloading' ? (
          <>
            <p>{t('settings.runtime.dialog.downloading')}</p>
            <div
              className="sb-progress"
              role="progressbar"
              aria-label={t('settings.runtime.dialog.downloading')}
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="sb-progress-track">
                <div className="sb-progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <p className="sb-mono">
              {t('settings.runtime.dialog.progress', {
                downloaded: formatBytes((progress?.downloadedMb ?? 0) * 1024 * 1024, language),
                total: formatBytes((progress?.totalMb ?? plan.downloadMb) * 1024 * 1024, language),
              })}
            </p>
          </>
        ) : null}

        {phase === 'failed' && progress?.error ? (
          <p className="sb-note-detail sb-note-bad">{t(`error.code.${progress.error}`)}</p>
        ) : null}

        {phase === 'done' ? (
          <>
            <p>{t('settings.runtime.dialog.done')}</p>
            {!installerResult ? (
              <Button
                icon="external-link"
                loading={openInstaller.isPending}
                onClick={() => void openTheInstaller()}
              >
                {t('settings.runtime.dialog.openInstaller')}
              </Button>
            ) : installerResult.opened ? (
              <p>{t('settings.runtime.dialog.yourTurn')}</p>
            ) : (
              <p className="sb-note-detail sb-note-bad">
                {installerResult.reason === 'no-installer-downloaded'
                  ? t('settings.runtime.dialog.openFailed.no-installer-downloaded')
                  : installerResult.reason}
              </p>
            )}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
