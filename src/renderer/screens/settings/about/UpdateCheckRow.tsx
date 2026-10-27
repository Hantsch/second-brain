/* The manual update check: when the last one ran, a button for the next, and
   what the state says about the outcome. The outcome is read from the update
   state, not from the click's result, so it stays correct after a reload or a
   background check. A failed check is only ever shown here, on request. */

import type { UpdateState } from '@shared/types';
import { Button } from '../../../atoms/Button';
import { RelativeTime } from '../../../components/RelativeTime';
import { useT } from '../../../i18n';
import { useCheckForUpdates } from '../../../lib/queries/update';

type Translate = ReturnType<typeof useT>;

function outcomeLine(state: UpdateState, callFailed: boolean, t: Translate): string {
  if (!state.supported) {
    return t(`settings.about.updates.status.disabled.${state.disabledReason ?? 'unpackaged'}`);
  }
  // A rejected call never reaches main's state, so the state alone would stay silent.
  if (callFailed && state.status !== 'checking') {
    return t('settings.about.updates.status.error', {
      reason: t('settings.about.updates.error.unknown'),
    });
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

export function UpdateCheckRow({ state }: { state: UpdateState }) {
  const t = useT();
  const check = useCheckForUpdates();
  // `isPending` covers the gap before main reports `checking`, so a double click is one call.
  const busy = state.status === 'checking' || check.isPending;

  return (
    <>
      <div data-testid="about-update-outcome">
        <p role="status" data-testid="update-status">
          {outcomeLine(state, check.isError, t)}
        </p>
        {state.status === 'available' && state.update ? (
          <p className="sb-mono" data-testid="update-version">
            {state.update.version}
          </p>
        ) : null}
      </div>
      <dl className="sb-kv">
        <div>
          <dt>{t('settings.about.updates.lastChecked')}</dt>
          <dd className="sb-mono">
            {state.lastCheckedAt ? (
              <RelativeTime at={state.lastCheckedAt} className="sb-mono" />
            ) : (
              t('settings.about.update.never')
            )}
          </dd>
        </div>
      </dl>
      <div>
        <Button
          variant="secondary"
          size="sm"
          icon="refresh-cw"
          disabled={!state.supported || busy}
          aria-busy={busy}
          onClick={() => check.mutate()}
        >
          {busy ? t('settings.about.updates.checking') : t('settings.about.updates.check')}
        </Button>
      </div>
    </>
  );
}
