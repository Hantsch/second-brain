/* The rail on the left: place screens in the main list, system screens
   (Maintenance, Settings) in the foot above the vault indicator, each with
   icon, label, keyboard shortcut, and active state. */

import { NavLink } from 'react-router-dom';
import { Badge } from '../atoms/Badge';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { useGardenerProgress } from '../lib/gardener-progress';
import { countOpenDays } from '../lib/journal-open';
import { useJournalDays } from '../lib/queries/data';
import { useWorkTasks } from '../lib/queries/tasks';
import { SCREENS, type ScreenDef, type ScreenId } from '../lib/screens';
import { tasksBadgeCount } from '../lib/tasks-view';
import { todayIso } from './DayList';
import { RailAgentButton } from './RailAgentButton';
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

  /* 072, D3: running + waiting tasks from the registry, plus the maintenance
     row whenever a gardener run is going — the same combined count the tasks
     screen's own header will show, read off the one store (`tasks-store.ts`)
     and the one gardener snapshot (`gardener-progress.ts`) both surfaces use. */
  const workTasks = useWorkTasks();
  const gardenerProgress = useGardenerProgress();
  const tasksCount = tasksBadgeCount(workTasks, gardenerProgress);

  /* Per-screen badge count — a lookup, not a hardcoded branch per screen.
     Story 072, D1 generalises what used to be a single `isJournal` special
     case: every screen id maps to a count here, and a screen with nothing to
     report is simply absent from the map (`?? 0`). */
  const badgeCounts: Partial<Record<ScreenId, number>> = {
    journal: openDaysCount,
    tasks: tasksCount,
  };

  /* 072 review, finding 2: one sentence per screen that carries a count, not
     a single `journal`-only special case — `tasks` now has a live count too
     (the same `tasksCount` the visible badge shows), and any future screen
     that starts showing one gets its own entry here instead of a second
     hardcoded branch. */
  const ariaLabelWithCount: Partial<Record<ScreenId, (count: number) => string>> = {
    journal: (count) => t('rail.journalOpenDays', { count }),
    tasks: (count) => t('rail.tasksRunningAndWaiting', { count }),
  };

  const renderItem = (screen: ScreenDef) => {
    const label = t(screen.labelKey);
    const count = badgeCounts[screen.id] ?? 0;
    const showCount = count > 0;
    /* A pill that disappears at zero is a notification, not a permanent
       part of the item (see NotesScreen's unfiled filter for the same
       distinction) — so the aria-label carries the count only when the
       pill itself is there to back it up: a screen-reader user must hear
       the same "N in flight" a sighted user sees, not silence (072 review,
       finding 2 — the badge itself stays `aria-hidden`, this is how its
       number reaches assistive tech instead). */
    const ariaLabel = showCount ? (ariaLabelWithCount[screen.id]?.(count) ?? label) : label;
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
        {showCount ? (
          <Badge variant="accent" className="sb-rail-count" aria-hidden="true">
            {count}
          </Badge>
        ) : null}
      </NavLink>
    );
  };

  return (
    <nav className="sb-rail" aria-label={t('rail.region')}>
      <div className="sb-rail-nav">{placeScreens.map(renderItem)}</div>
      <div className="sb-rail-foot">
        <div className="sb-rail-nav">
          {/* The agent entry is an action, not a route, so it is not in SCREENS;
              it sits right after Tasks, where the work it picks up is listed. */}
          {systemScreens.flatMap((screen) =>
            screen.id === 'tasks'
              ? [renderItem(screen), <RailAgentButton key="agent" />]
              : [renderItem(screen)],
          )}
        </div>
        <VaultIndicator />
      </div>
    </nav>
  );
}
