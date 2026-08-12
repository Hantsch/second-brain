/* The rail on the left: ten screens in the order from docs/ARCHITECTURE.md,
   each with icon, label, keyboard shortcut, and active state. The vault at
   the bottom. */

import { NavLink } from 'react-router-dom';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { SCREENS } from '../lib/screens';
import { VaultIndicator } from './VaultIndicator';

/* No tooltip on the rail entries: the label and key are already visibly next
   to them, a tooltip would only repeat them — and because it expands
   absolutely to the right, it would force a horizontal scrollbar in the
   scrollable rail. */
export function Rail() {
  const t = useT();
  return (
    <nav className="sb-rail" aria-label={t('rail.region')}>
      <div className="sb-rail-nav">
        {SCREENS.map((screen) => {
          const label = t(screen.labelKey);
          return (
            <NavLink
              key={screen.id}
              to={screen.path}
              className="sb-rail-item"
              aria-label={label}
              aria-keyshortcuts={screen.hotkey}
            >
              <Icon name={screen.icon} size={16} />
              <span>{label}</span>
              <span className="sb-rail-key" aria-hidden="true">
                {screen.hotkey}
              </span>
            </NavLink>
          );
        })}
      </div>
      <div className="sb-rail-foot">
        <VaultIndicator />
      </div>
    </nav>
  );
}
