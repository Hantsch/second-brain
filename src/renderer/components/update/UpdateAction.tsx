/* The one primary update action for the current phase, plus the reason a
   refused action gave. Main decides what is allowed; this only shows the
   answer, so a refusal is kept as the key main sent and translated here. */

import { useState } from 'react';
import type { UpdateActionResult, UpdateState } from '@shared/types';
import { Button } from '../../atoms/Button';
import { ProgressBar } from '../../atoms/ProgressBar';
import { useT } from '../../i18n';
import { api } from '../../lib/api';

type Refusal = Extract<UpdateActionResult, { ok: false }>['error'];

export interface UpdateActionProps {
  state: UpdateState;
}

export function UpdateAction({ state }: UpdateActionProps) {
  const t = useT();
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);

  // The download call resolves only when the download ends, so it must not hold `busy`:
  // that would keep Cancel disabled for the whole transfer.
  const run = (action: () => Promise<UpdateActionResult>, onReject: Refusal, hold = true): void => {
    if (hold) setBusy(true);
    action()
      .then((result) => setRefusal(result.ok ? null : result.error))
      .catch(() => setRefusal(onReject))
      .finally(() => setBusy(false));
  };

  // A portable build has no installer: it opens the release page and never downloads.
  const openRelease = (): void => {
    if (state.releaseUrl) void api.shell.openExternal(state.releaseUrl).catch(() => undefined);
  };

  const reason = refusal ?? state.downloadError;
  const ratio = state.progress?.ratio ?? null;

  return (
    <div className="sb-update-action" data-testid="update-action">
      {state.phase === 'available' ? (
        state.distribution === 'portable' ? (
          <Button icon="external-link" onClick={openRelease}>
            {t('update.action.openRelease')}
          </Button>
        ) : (
          <Button
            icon="download"
            disabled={busy}
            onClick={() => run(api.update.download, 'update.error.download.unknown', false)}
          >
            {t('update.action.download')}
          </Button>
        )
      ) : null}
      {state.phase === 'downloading' ? (
        <>
          <ProgressBar
            className="sb-progress-track"
            fillClassName="sb-progress-fill"
            label={t('update.action.downloading')}
            value={ratio === null ? null : Math.round(ratio * 100)}
          />
          <Button
            variant="secondary"
            icon="x"
            disabled={busy}
            onClick={() => run(api.update.cancelDownload, 'update.error.download.unknown')}
          >
            {t('update.action.cancel')}
          </Button>
        </>
      ) : null}
      {state.phase === 'downloaded' ? (
        <Button
          icon="refresh-cw"
          disabled={busy}
          onClick={() => run(api.update.installAndRestart, 'update.error.installFailed')}
        >
          {t('update.action.install')}
        </Button>
      ) : null}
      {reason ? (
        <p role="alert" className="sb-update-reason" data-testid="update-reason">
          {t(reason)}
        </p>
      ) : null}
    </div>
  );
}
