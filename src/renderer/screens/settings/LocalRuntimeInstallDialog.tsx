/* Confirm dialog for getting the local runtime (019c D6; 033, D10 adds the
   build select for llama.cpp). Mirrors `ProviderDialog`'s shape: a `Dialog`
   atom, local `busy`/`error`/`result` state, a footer that switches with the
   phase.

   Every fact the plan carries is named before the download starts —
   size, installer path, model directory, and the no-uninstall caveat — so
   confirming here is an informed proposal, not a blind "yes" (guardrail 2).
   While a download is running the dialog can only be closed via the explicit
   cancel button: closing any other way would leave main's download running
   unseen, so the `X`/scrim/Escape paths are disabled for that phase by
   passing no `onClose` to the `Dialog` atom.

   `plan.build` (033, D10) is set only for llama.cpp — Ollama has no build
   variants, so every branch below that reads it is simply inert for
   `runtime: 'ollama'` and that card's dialog renders exactly as it did
   before this story. */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { EngineBuildId, EngineBuildReason, RuntimeId, RuntimePlan } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { ProgressBar } from '../../atoms/ProgressBar';
import { Select } from '../../atoms/Select';
import { useLanguage, useT } from '../../i18n';
import { bridge } from '../../lib/bridge';
import { formatBytes } from '../../lib/format';
import { decodeIpcError } from '../../lib/ipc-error';
import { qk } from '../../lib/queries/keys';
import { useRuntimeMutations } from '../../lib/queries/llm';
import { runtimeKey } from './LocalRuntimeCard';

export interface LocalRuntimeInstallDialogProps {
  runtime: RuntimeId;
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

/** The build's own translated select-option label — reused so the reason
    sentence names a build the same way the select above it does. */
function buildLabel(t: ReturnType<typeof useT>, id: EngineBuildId): string {
  return t(`settings.runtime.dialog.build.option.${id}`);
}

/**
 * `EngineBuildReason` (033, D2) is a structured fact, not a composed
 * sentence, so this is where it becomes one sentence in the UI language —
 * `gpuName` is the only piece of free text, interpolated as data (a proper
 * noun) rather than translated. Keeping this composition in the renderer
 * instead of core is what makes the reason honour `languages.ui` the same
 * way every other string on this screen does (CLAUDE.md guardrail 7).
 */
function buildReasonText(t: ReturnType<typeof useT>, reason: EngineBuildReason): string {
  if (reason.kind === 'no-gpu') return t('settings.runtime.dialog.build.reason.noGpu');
  if (reason.kind === 'macos') return t('settings.runtime.dialog.build.reason.macos');
  const confidenceKey = reason.confident
    ? 'settings.runtime.dialog.build.reason.gpuDetected'
    : 'settings.runtime.dialog.build.reason.gpuUnsure';
  if (reason.requestedBuild === reason.actualBuild) {
    return t(confidenceKey, { gpuName: reason.gpuName, build: buildLabel(t, reason.actualBuild) });
  }
  const fallbackKey = reason.confident
    ? 'settings.runtime.dialog.build.reason.fallback'
    : 'settings.runtime.dialog.build.reason.fallbackUnsure';
  return t(fallbackKey, {
    gpuName: reason.gpuName,
    requested: buildLabel(t, reason.requestedBuild),
    actual: buildLabel(t, reason.actualBuild),
  });
}

export function LocalRuntimeInstallDialog({
  runtime,
  plan,
  onClose,
}: LocalRuntimeInstallDialogProps) {
  const t = useT();
  const language = useLanguage();
  const client = useQueryClient();
  const { download, cancelDownload, openInstaller, replan } = useRuntimeMutations(runtime);
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [replanError, setReplanError] = useState<string | null>(null);
  const [installerResult, setInstallerResult] = useState<{
    opened: boolean;
    reason?: string;
  } | null>(null);
  /* The plan shown/confirmed against — starts as the prop (the GPU scan's
     preselected build), replaced by a fresh plan whenever the build select
     below picks a different option (guardrail 2: the app proposes, the user
     confirms; changing the proposal re-plans rather than only re-labelling
     the same numbers). `buildId` tracks the select's current value
     separately so it survives even while `replan` is still in flight. */
  const [currentPlan, setCurrentPlan] = useState<RuntimePlan>(plan);
  const [buildId, setBuildId] = useState<EngineBuildId | undefined>(plan.build?.id);

  /* Holds the *known* download id for the `on()` callback below to filter
     by. A ref, not the `downloadId` state: the subscription must exist
     before `confirm()` even runs (see the effect below — its deps are
     `client`/`runtime`, both stable for the dialog's whole lifetime, so it
     still only (re-)subscribes once in practice), and the id must become
     filterable the instant it's known — a state update only takes effect on
     the next render, one tick later, which is exactly the gap a fast
     failure's only `done: true` event could fall into and be lost forever
     (F2). Setting a ref is synchronous, closing that gap. */
  const knownDownloadId = useRef<string | null>(null);

  useEffect(() => {
    // Subscribed once, unconditionally, for the dialog's whole lifetime —
    // not gated on `downloadId` being set. By the time the user can press
    // "confirm" the dialog has already mounted, so this listener is already
    // in place before any download (and its events) can possibly start.
    return bridge().on('event:install-progress', (chunk) => {
      if (chunk.downloadId !== knownDownloadId.current) return;
      setProgress(chunk);
      /* A finished, error-free download of llama.cpp's engine (D6) really is
         the install completing — the binary is in place — so the card's
         status query is refreshed here instead of leaving the user to press
         "recheck" by hand (guardrail 3 adjacent: never keep claiming
         "not installed" once it demonstrably is). Harmless for Ollama, whose
         download only produces an installer: invalidating a query that
         refetches the same "absent" status is a no-op in effect. */
      if (chunk.done && !chunk.error) {
        void client.invalidateQueries({ queryKey: qk.llm.runtimeStatus(runtime) });
      }
    });
  }, [client, runtime]);

  const phase = phaseOf(downloadId, progress);

  const confirm = async (): Promise<void> => {
    setConfirmError(null);
    try {
      // `buildId` is `undefined` for Ollama the whole time (no `plan.build`,
      // so the select below never renders and never sets it) — the same call
      // `download.mutateAsync()` used to make.
      const { downloadId: id } = await download.mutateAsync(buildId);
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

  /* The build select's `onChange` (033, D10): re-plans against the newly
     picked build so the shown size/target reflect it, rather than only
     swapping a label next to numbers that still describe the old build. */
  const changeBuild = (nextBuildId: EngineBuildId): void => {
    setReplanError(null);
    setBuildId(nextBuildId);
    replan.mutate(nextBuildId, {
      onSuccess: setCurrentPlan,
      // A failed replan must not leave the user thinking their pick simply
      // took effect — the select already shows `nextBuildId` (via `buildId`
      // below), but nothing else about the plan (size, target, block state)
      // has moved, so that has to be said out loud.
      onError: (failure) => setReplanError(t(`error.code.${decodeIpcError(failure).code}`)),
    });
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
              disabled={!currentPlan.canInstall}
              onClick={() => void confirm()}
            >
              {t(runtimeKey('settings.runtime.dialog.confirm', runtime))}
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

            {currentPlan.build ? (
              <div className="sb-setting-block">
                <Select
                  label={t('settings.runtime.dialog.build.label')}
                  value={buildId ?? currentPlan.build.id}
                  disabled={replan.isPending}
                  onChange={(event) => changeBuild(event.target.value as EngineBuildId)}
                  options={currentPlan.build.options.map((id) => ({
                    value: id,
                    label: t(`settings.runtime.dialog.build.option.${id}`),
                  }))}
                />
                <p className="sb-routing-hint">{buildReasonText(t, currentPlan.build.reason)}</p>
                {replanError ? <p className="sb-note-detail sb-note-bad">{replanError}</p> : null}
              </div>
            ) : null}

            {!currentPlan.canInstall && currentPlan.blockedReason ? (
              <p className="sb-note-detail sb-note-bad">
                {t(runtimeKey(`settings.runtime.blocked.${currentPlan.blockedReason}`, runtime))}
              </p>
            ) : null}

            <p>
              {t('settings.runtime.dialog.size', {
                mb: formatBytes(currentPlan.downloadMb * 1024 * 1024, language),
              })}
            </p>
            <p>
              {t(runtimeKey('settings.runtime.dialog.installerPath', runtime), {
                path: currentPlan.installerPath,
              })}
            </p>
            <p>
              {t(runtimeKey('settings.runtime.dialog.modelDir', runtime), {
                path: currentPlan.modelDirHint,
              })}
            </p>
            <p>{t(runtimeKey('settings.runtime.dialog.noUninstall', runtime))}</p>
            {confirmError ? <p className="sb-note-detail sb-note-bad">{confirmError}</p> : null}
          </>
        ) : null}

        {phase === 'downloading' ? (
          <>
            <p>{t(runtimeKey('settings.runtime.dialog.downloading', runtime))}</p>
            <div className="sb-progress">
              <ProgressBar
                value={pct}
                label={t(runtimeKey('settings.runtime.dialog.downloading', runtime))}
                className="sb-progress-track"
                fillClassName="sb-progress-fill"
              />
            </div>
            <p className="sb-mono">
              {t('settings.runtime.dialog.progress', {
                downloaded: formatBytes((progress?.downloadedMb ?? 0) * 1024 * 1024, language),
                total: formatBytes(
                  (progress?.totalMb ?? currentPlan.downloadMb) * 1024 * 1024,
                  language,
                ),
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
                {t(runtimeKey('settings.runtime.dialog.openInstaller', runtime))}
              </Button>
            ) : installerResult.opened ? (
              <p>{t(runtimeKey('settings.runtime.dialog.yourTurn', runtime))}</p>
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
