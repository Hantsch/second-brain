/* Local runtime card (019c D6): what the models tab shows about Ollama
   without the user doing anything — installed? running? — plus the guided
   path to get one, start it, and pull a model. Mirrors `MachineCard`'s shape
   (a `Panel` with its own busy/error state) and opens `LocalRuntimeInstallDialog`
   (mirroring `ProviderDialog`) rather than downloading on the first click —
   nothing here acts before the user confirms it (guardrail 2).

   Always rendered in the models tab, not gated behind `empty`: a user who
   already has a cloud provider configured may still want a local runtime for
   the sensitive tasks that recommend one (see the acceptance criterion "from
   the models tab I see... whether a local runtime is installed", which names
   no onboarding-only condition). */

import { useState } from 'react';
import type { RuntimeBlockedReason } from '@shared/types';
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
import { LocalRuntimeInstallDialog } from './LocalRuntimeInstallDialog';
import { LocalRuntimePullList } from './LocalRuntimePullList';

/** Mirrors `StartCard`'s constant of the same address — duplicated rather
    than shared, since a one-line URL isn't worth a constants module and
    `StartCard` already imports `LOCAL_RUNTIME_CARD_ID` from this file (the
    other direction would create a cycle). */
const OLLAMA_URL = 'https://ollama.com';

/** DOM id `StartCard`'s "go to the local runtime card" link scrolls to. */
export const LOCAL_RUNTIME_CARD_ID = 'local-runtime-card';

interface StartResult {
  ok: boolean;
  text: string;
}

export function LocalRuntimeCard() {
  const t = useT();
  const status = useRuntimeStatus();
  const plan = useRuntimeInstallPlan();
  const { start } = useRuntimeMutations();
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
            ? { ok: true, text: t('settings.runtime.start.ok') }
            : {
                ok: false,
                text: t(`settings.runtime.start.failed.${result.reason ?? 'timeout'}`),
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
    <div id={LOCAL_RUNTIME_CARD_ID}>
      <Panel
        title={t('settings.runtime.title')}
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
          {statusErrorText ? <p className="sb-note-detail sb-note-bad">{statusErrorText}</p> : null}

          {status.data === 'running' ? (
            <p className="sb-runtime-status">
              <span className="sb-dot sb-dot--ok" aria-hidden="true" />
              {t('settings.runtime.status.running')}
            </p>
          ) : null}

          {status.data === 'installed-stopped' ? (
            <>
              <p className="sb-runtime-status">
                <span className="sb-dot" aria-hidden="true" />
                {t('settings.runtime.status.installedStopped')}
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
                  {t(`settings.runtime.blocked.${blockedReason}`)}
                </p>
              ) : planErrorText ? (
                <p className="sb-note-detail sb-note-bad">{planErrorText}</p>
              ) : null}
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

          {status.data === 'running' ? <LocalRuntimePullList /> : null}
        </div>
      </Panel>

      {installOpen && plan.data && plan.data.canInstall ? (
        <LocalRuntimeInstallDialog plan={plan.data} onClose={() => setInstallOpen(false)} />
      ) : null}
    </div>
  );
}
