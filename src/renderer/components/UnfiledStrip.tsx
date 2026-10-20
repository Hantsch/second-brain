/* How much sits unfiled, above the tile grid on Today.

   The count comes from `dashboard:data`'s `inboxCount` — the same field
   `InboxTile` and Notes' own filter link already read, so all three agree.
   At zero this renders nothing: unlike `DaySummary`, there is no "nothing
   unfiled" sentence — a permanent entry point that's absent when there's
   nothing to file, not a notification. */

import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';

export interface UnfiledStripProps {
  count: number;
}

export function UnfiledStrip({ count }: UnfiledStripProps) {
  const t = useT();
  const navigate = useNavigate();

  if (count === 0) return null;

  return (
    <p className="sb-unfiledstrip">
      <button
        type="button"
        className="sb-textlink sb-unfiledstrip-link"
        onClick={() => void navigate('/notes?filter=unfiled')}
      >
        {t('dashboard.unfiled.strip', { count })}
      </button>
    </p>
  );
}
