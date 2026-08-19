/* The rail on the left: place screens in the main list, system screens
   (Maintenance, Settings) in the foot above the vault indicator, each with
   icon, label, keyboard shortcut, and active state. */

import { NavLink } from 'react-router-dom';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { SCREENS, type ScreenDef } from '../lib/screens';
import { VaultIndicator } from './VaultIndicator';

/* No tooltip on the rail entries: the label and key are already visibly next
   to them, a tooltip would only repeat them — and because it expands
   absolutely to the right, it would force a horizontal scrollbar in the
   scrollable rail. */
export function Rail() {
  const t = useT();
  const placeScreens = SCREENS.filter((screen) => screen.group === 'place');
  const systemScreens = SCREENS.filter((screen) => screen.group === 'system');

  const renderItem = (screen: ScreenDef) => {
    const label = t(screen.labelKey);
    return (
      <NavLink
        key={screen.id}
        to={screen.path}
        className="sb-rail-item"
        aria-label={label}
        {...(screen.hotkey === undefined ? {} : { 'aria-keyshortcuts': screen.hotkey })}
      >
        <Icon name={screen.icon} size={16} />
        <span>{label}</span>
        {screen.hotkey === undefined ? null : (
          <span className="sb-rail-key" aria-hidden="true">
            {screen.hotkey}
          </span>
        )}
      </NavLink>
    );
  };

  return (
    <nav className="sb-rail" aria-label={t('rail.region')}>
      <div className="sb-rail-nav">{placeScreens.map(renderItem)}</div>
      <div className="sb-rail-foot">
        <div className="sb-rail-nav">{systemScreens.map(renderItem)}</div>
        <VaultIndicator />
      </div>
    </nav>
  );
}
