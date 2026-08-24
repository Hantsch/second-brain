/* Local runtime card (019c D6; 033, D10 makes it per-runtime): what the
   models tab shows about a local runtime without the user doing anything —
   installed? running? — plus the guided path to get one, start it, and pull
   a model. Mirrors `MachineCard`'s shape (a `Panel` with its own busy/error
   state) and opens `LocalRuntimeInstallDialog` (mirroring `ProviderDialog`)
   rather than downloading on the first click — nothing here acts before the
   user confirms it (guardrail 2).

   Always rendered in the models tab, not gated behind `empty`: a user who
   already has a cloud provider configured may still want a local runtime for
   the sensitive tasks that recommend one (see the acceptance criterion "from
   the models tab I see... whether a local runtime is installed", which names
   no onboarding-only condition). */

import { useState } from 'react';
import type { RuntimeBlockedReason, RuntimeId } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Panel } from '../../components/Panel';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { decodeIpcError } from '../../lib/ipc-error';
import {
  useRuntimeInstallPlan,
  useRuntimeMutations,
  useRuntimeStatus,
} from '../../lib/queries/llm';
import { LlamaCppModelPanel } from './LlamaCppModelPanel';
import { LlamaEngineDetails } from './LlamaEngineDetails';
import { LocalRuntimeInstallDialog } from './LocalRuntimeInstallDialog';
import { LocalRuntimePullList } from './LocalRuntimePullList';

/** Mirrors `StartCard`'s constant of the same address — duplicated rather
    than shared, since a one-line URL isn't worth a constants module and
    `StartCard` already imports `LOCAL_RUNTIME_CARD_ID` from this file (the
    other direction would create a cycle). Ollama-only: llama.cpp has no
    equivalent manual-install page (Decisions, Q4 — all platforms are
    handled in-app), so its card never shows this link. */
const OLLAMA_URL = 'https://ollama.com';

/** DOM id `StartCard`'s "go to the local runtime card" link scrolls to —
    always the Ollama card, since that is the one the onboarding guide talks
    about (Ollama stays the recommended default, Decisions Q5). */
export const LOCAL_RUNTIME_CARD_ID = 'local-runtime-card';

interface StartResult {
  ok: boolean;
  text: string;
}

/** Picks the runtime-specific i18n key when one exists (`.llamacpp` suffix),
    falling back to the shared/Ollama-shaped key otherwise — this is what
    keeps the Ollama card's copy byte-for-byte what it was before D10.
    Exported so `LocalRuntimeInstallDialog` (same runtime-vs-shared-copy
    problem) doesn't duplicate it. */
export function runtimeKey(base: string, runtime: RuntimeId): string {
  return runtime === 'llamacpp' ? `${base}.llamacpp` : base;
}

export interface LocalRuntimeCardProps {
  runtime: RuntimeId;
}

export function LocalRuntimeCard({ runtime }: LocalRuntimeCardProps) {
  const t = useT();
  const status = useRuntimeStatus(runtime);
  const plan = useRuntimeInstallPlan(runtime);
  const { start } = useRuntimeMutations(runtime);
  const [installOpen, setInstallOpen] = useState(false);
  const [startResult, setStartResult] = useState<StartResult | null>(null);

  const openOllamaExternally = (): void => {
    void api.shell.openExternal(OLLAMA_URL).catch(() => undefined);
  };

  /* The plan is re-read fresh every time "get it" is pressed (`refetch`
     ignores the query's own `enabled: false`), so the dialog it may open
     always shows this moment's disk/platform facts rather than a cached
     answer from an earlier visit. */
  const getIt = async (): Promise<void> => {
    const result = await plan.refetch();
    if (result.data?.canInstall) setInstallOpen(true);
  };

  const startIt = (): void => {
    setStartResult(null);
    start.mutate(undefined, {
      onSuccess: (result) => {
        setStartResult(
          result.started
            ? { ok: true, text: t(runtimeKey('settings.runtime.start.ok', runtime)) }
            : {
                ok: false,
                text: t(
                  runtimeKey(
                    `settings.runtime.start.failed.${result.reason ?? 'timeout'}`,
                    runtime,
                  ),
                ),
              },
        );
      },
    });
  };

  const statusErrorText = status.error
    ? t(`error.code.${decodeIpcError(status.error).code}`)
    : null;
  /* Same pattern as `statusErrorText` above: a rejected read gets a sentence,
     not silence. Without this, a failed `llm:runtimeInstallPlan` left "get
     it" doing nothing once its spinner cleared — no reason shown, no
     retry hint, exactly the "never a spinner that never ends" guardrail
     this card otherwise honours for `status.error`. */
  const planErrorText = plan.error ? t(`error.code.${decodeIpcError(plan.error).code}`) : null;
  const blockedReason: RuntimeBlockedReason | null =
    plan.data && !plan.data.canInstall ? plan.data.blockedReason : null;

  return (
    <div id={runtime === 'ollama' ? LOCAL_RUNTIME_CARD_ID : undefined}>
      <Panel
        title={t(runtimeKey('settings.runtime.title', runtime))}
        action={
          <Button
            variant="ghost"
            size="sm"
            icon="refresh-cw"
            loading={status.isFetching}
            onClick={() => void status.refetch()}
          >
            {t('settings.runtime.recheck')}
          </Button>
        }
        note={t('settings.runtime.note')}
      >
        <div className="sb-setting-block">
          {/* AC 1: llama.cpp's card names what it is for, not just a URL to
              configure by hand — the same sentence D9's preset already uses
              for its own hint. */}
          {runtime === 'llamacpp' ? (
            <p className="sb-routing-hint">{t('llm.preset.llamacpp.hint')}</p>
          ) : null}

          {statusErrorText ? <p className="sb-note-detail sb-note-bad">{statusErrorText}</p> : null}

          {status.data === 'running' ? (
            <p className="sb-runtime-status">
              <span className="sb-dot sb-dot--ok" aria-hidden="true" />
              {t(runtimeKey('settings.runtime.status.running', runtime))}
            </p>
          ) : null}

          {status.data === 'installed-stopped' ? (
            <>
              <p className="sb-runtime-status">
                <span className="sb-dot" aria-hidden="true" />
                {t(runtimeKey('settings.runtime.status.installedStopped', runtime))}
              </p>
              <div className="sb-setting-actions">
                <Button icon="zap" loading={start.isPending} onClick={startIt}>
                  {t('settings.runtime.startIt')}
                </Button>
              </div>
              {startResult ? (
                <p className={startResult.ok ? 'sb-setting-readout' : 'sb-note-detail sb-note-bad'}>
                  {startResult.text}
                </p>
              ) : null}
            </>
          ) : null}

          {status.data === 'absent' ? (
            <>
              <p className="sb-runtime-status">
                <span className="sb-dot" aria-hidden="true" />
                {t('settings.runtime.status.absent')}
              </p>
              <div className="sb-setting-actions">
                <Button icon="download" loading={plan.isFetching} onClick={() => void getIt()}>
                  {t('settings.runtime.getIt')}
                </Button>
              </div>
              {blockedReason ? (
                <p className="sb-note-detail sb-note-bad">
                  {t(runtimeKey(`settings.runtime.blocked.${blockedReason}`, runtime))}
                </p>
              ) : planErrorText ? (
                <p className="sb-note-detail sb-note-bad">{planErrorText}</p>
              ) : null}
              {/* Ollama's only: llama.cpp has no manual-install page to send
                  the user to (see `OLLAMA_URL`'s own comment above). */}
              {runtime === 'ollama' ? (
                <>
                  <p className="sb-routing-hint">{t('settings.runtime.manualPath')}</p>
                  <div className="sb-setting-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="external-link"
                      onClick={openOllamaExternally}
                    >
                      {t('settings.detect.guideLink')}
                    </Button>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {/* The pull list is Ollama's model catalogue browser (recommendations
              → `ollama pull`); llama.cpp's model source is Hugging Face
              search (033, D11's `LlamaCppModelPanel`) instead. */}
          {status.data === 'running' && runtime === 'ollama' ? <LocalRuntimePullList /> : null}
          {/* Shown once the engine is installed, not only once it's running —
              a model file downloads straight from Hugging Face onto disk and
              needs no running server, so gating it on `installed-stopped`
              too (rather than `running` alone, as Ollama's list does) avoids
              forcing a start just to fetch a file first. */}
          {runtime === 'llamacpp' &&
          (status.data === 'installed-stopped' || status.data === 'running') ? (
            <LlamaCppModelPanel />
          ) : null}
          {/* The derived start plan, its warnings, and the stop button (034,
              D4) — same gating as the model panel above: nothing to plan or
              stop before the engine is at least installed. */}
          {runtime === 'llamacpp' &&
          (status.data === 'installed-stopped' || status.data === 'running') ? (
            <LlamaEngineDetails />
          ) : null}
        </div>
      </Panel>

      {installOpen && plan.data && plan.data.canInstall ? (
        <LocalRuntimeInstallDialog
          runtime={runtime}
          plan={plan.data}
          onClose={() => setInstallOpen(false)}
        />
      ) : null}
    </div>
  );
}
