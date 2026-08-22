/* 021a, D5: a maintenance run is visible from any screen, not just from the
   maintenance screen itself — a busy dot plus a short label in the rail foot,
   next to the vault indicator. Reuses `useGardenerProgress` (the same hook
   `RunBar` uses), so it is correct on mount, not just after the next
   `event:gardener-progress` tick. Renders nothing while no run is going —
   an idle dot with nothing to report would only be noise in the rail. */

import { useNavigate } from 'react-router-dom';
import { useGardenerProgress } from '../lib/queries/gardener';
import { useT } from '../i18n';

export function GardenerIndicator() {
  const t = useT();
  const navigate = useNavigate();
  const progress = useGardenerProgress();

  if (progress === null) return null;

  return (
    <button
      type="button"
      className="sb-vault"
      aria-label={t('garden.run.railIndicator')}
      onClick={() => void navigate('/garden')}
    >
      <span className="sb-vault-meta">
        {/* The dot is the same busy idiom as `VaultIndicator`'s index dot;
            its meaning is carried by the label next to it and by the
            button's accessible name. */}
        <span className="sb-dot sb-dot--busy" role="img" aria-hidden="true" />
        <span>{t('garden.run.railIndicator')}</span>
      </span>
    </button>
  );
}
