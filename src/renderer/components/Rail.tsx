/* The rail on the left: place screens in the main list, system screens
   (Maintenance, Settings) in the foot above the vault indicator, each with
   icon, label, keyboard shortcut, and active state. */

import { NavLink } from 'react-router-dom';
import { Badge } from '../atoms/Badge';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { countOpenDays } from '../lib/journal-open';
import { useJournalDays } from '../lib/queries/data';
import { SCREENS, type ScreenDef } from '../lib/screens';
import { todayIso } from './DayList';
import { GardenerIndicator } from './GardenerIndicator';
import { VaultIndicator } from './VaultIndicator';

/* No tooltip on the rail entries: the label and key are already visibly next
   to them, a tooltip would only repeat them — and because it expands
   absolutely to the right, it would force a horizontal scrollbar in the
   scrollable rail. */
export function Rail() {
  const t = useT();
  const placeScreens = SCREENS.filter((screen) => screen.group === 'place');
  const systemScreens = SCREENS.filter((screen) => screen.group === 'system');

  /* 009, D7: how many journal days are still unfinished — derived client-side
     from the same days list and rule the journal screen itself uses
     (`countOpenDays`), no dedicated IPC channel. */
  const journalDays = useJournalDays();
  const openDaysCount = countOpenDays(journalDays.data ?? [], todayIso());

  const renderItem = (screen: ScreenDef) => {
    const label = t(screen.labelKey);
    const isJournal = screen.id === 'journal';
    const showOpenCount = isJournal && openDaysCount > 0;
    /* A pill that disappears at zero is a notification, not a permanent
       part of the item (see NotesScreen's unfiled filter for the same
       distinction) — so the aria-label carries the count only when the
       pill itself is there to back it up. */
    const ariaLabel = showOpenCount ? t('rail.journalOpenDays', { count: openDaysCount }) : label;
    return (
      <NavLink
        key={screen.id}
        to={screen.path}
        className="sb-rail-item"
        aria-label={ariaLabel}
        {...(screen.hotkey === undefined ? {} : { 'aria-keyshortcuts': screen.hotkey })}
      >
        <Icon name={screen.icon} size={16} />
        <span>{label}</span>
        {screen.hotkey === undefined ? null : (
          <span className="sb-rail-key" aria-hidden="true">
            {screen.hotkey}
          </span>
        )}
        {showOpenCount ? (
          <Badge variant="accent" className="sb-rail-count" aria-hidden="true">
            {openDaysCount}
          </Badge>
        ) : null}
      </NavLink>
    );
  };

  return (
    <nav className="sb-rail" aria-label={t('rail.region')}>
      <div className="sb-rail-nav">{placeScreens.map(renderItem)}</div>
      <div className="sb-rail-foot">
        <div className="sb-rail-nav">{systemScreens.map(renderItem)}</div>
        <GardenerIndicator />
        <VaultIndicator />
      </div>
    </nav>
  );
}
