/* The scan-meta line (035, D7): when the shown scan was taken, plus the
   always-available rescan action. Always rendered, in every state of the
   card — before a first scan there is no date yet, but the button to run
   one is never gated on anything having happened before. */

import type { UiLanguage } from '@shared/types';
import { Button } from '../../../atoms/Button';
import type { Vars } from '../../../i18n';
import { formatAge } from '../../../lib/format';

interface MachineScanMetaProps {
  /** `null` before the machine has ever been scanned — no invented date. */
  scannedAt: string | null;
  language: UiLanguage;
  t: (key: string, vars?: Vars) => string;
  pending: boolean;
  /** Swaps the button's label between "scan" and "rescan" (035, D2) — the
      wording admits whether this machine has a result already. */
  hasFacts: boolean;
  onRescan: () => void;
}

export function MachineScanMeta({
  scannedAt,
  language,
  t,
  pending,
  hasFacts,
  onRescan,
}: MachineScanMetaProps) {
  return (
    <div className="sb-setting-actions">
      {scannedAt ? (
        <span className="sb-note-detail">
          {t('settings.machine.scannedAt', { when: formatAge(scannedAt, language) })}
        </span>
      ) : null}
      <Button variant="secondary" size="sm" icon="search" loading={pending} onClick={onRescan}>
        {t(hasFacts ? 'settings.machine.rescan' : 'settings.machine.scan')}
      </Button>
    </div>
  );
}
