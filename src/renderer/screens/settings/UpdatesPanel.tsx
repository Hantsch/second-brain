/* The "Updates" panel in the About tab: what the last check found, and a
   button to run one. A failed check is only ever shown here, on request —
   nothing in the app announces it by itself. */

import type { UpdateState } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Panel } from '../../components/Panel';
import { Skeleton } from '../../components/Skeleton';
import { useLanguage, useT } from '../../i18n';
import { formatDateTime } from '../../lib/format';
import { useCheckForUpdates, useUpdateState } from '../../lib/queries/update';

type Translate = ReturnType<typeof useT>;

function statusLine(state: UpdateState, t: Translate): string {
  if (!state.supported) {
    return t(`settings.about.updates.status.disabled.${state.disabledReason ?? 'unpackaged'}`);
  }
  switch (state.status) {
    case 'checking':
      return t('settings.about.updates.status.checking');
    case 'up-to-date':
      return t('settings.about.updates.status.upToDate');
    case 'available':
      return t('settings.about.updates.status.available', {
        version: state.update?.version ?? '',
      });
    case 'error':
      return t('settings.about.updates.status.error', {
        reason: t(`settings.about.updates.error.${state.error ?? 'unknown'}`),
      });
    case 'idle':
      return t('settings.about.updates.status.idle');
  }
}

export function UpdatesPanel() {
  const t = useT();
  const language = useLanguage();
  const state = useUpdateState();
  const check = useCheckForUpdates();
  const data = state.data;
  const busy = data?.status === 'checking' || check.isPending;

  return (
    <Panel title={t('settings.about.updates.title')}>
      {data ? (
        <div className="sb-setting-block">
          <p role="status" data-testid="update-status">
            {statusLine(data, t)}
          </p>
          {data.status === 'available' && data.update ? (
            <p className="sb-mono" data-testid="update-version">
              {data.update.version}
            </p>
          ) : null}
          <dl className="sb-kv">
            <div>
              <dt>{t('settings.about.updates.lastChecked')}</dt>
              <dd className="sb-mono">
                {formatDateTime(data.lastCheckedAt, language) || t('settings.about.updates.never')}
              </dd>
            </div>
            <div>
              <dt>{t('settings.about.updates.distribution')}</dt>
              <dd>{t(`settings.about.updates.distribution.${data.distribution}`)}</dd>
            </div>
          </dl>
          <div>
            <Button
              variant="secondary"
              size="sm"
              icon="refresh-cw"
              disabled={!data.supported || busy}
              aria-busy={busy}
              onClick={() => check.mutate()}
            >
              {busy ? t('settings.about.updates.checking') : t('settings.about.updates.check')}
            </Button>
          </div>
        </div>
      ) : (
        <Skeleton lines={3} height={20} />
      )}
    </Panel>
  );
}
