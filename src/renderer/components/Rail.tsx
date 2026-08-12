/* Die Rail links: zehn Screens in der Reihenfolge aus docs/ARCHITECTURE.md,
   jeder mit Icon, Label, Tastaturweg und aktivem Zustand. Unten der Vault. */

import { NavLink } from 'react-router-dom';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { SCREENS } from '../lib/screens';
import { VaultIndicator } from './VaultIndicator';

/* Kein Tooltip an den Rail-Einträgen: Label und Taste stehen sichtbar daneben,
   ein Tooltip würde sie nur wiederholen — und weil er absolut nach rechts
   ausklappt, erzwingt er in der scrollbaren Rail einen Querbalken. */
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
