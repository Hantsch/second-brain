/* Which module renders which tile — the only place that knows this.

   `Record<DashboardModuleId, …>` enforces completeness: a new module in the
   contract has a tile here, otherwise the compiler won't build it. No
   `default` case that silently shows a blank surface.

   `memo` is not decoration here: during a drag, the grid re-renders on
   every pointer movement. The tiles receive no props, so React skips their
   body — only the frame keeps up, because it reads the grid's state from
   the context. Without this, thirteen lists would be rebuilt per frame. */

import { memo } from 'react';
import type { ComponentType } from 'react';
import type { DashboardModuleId } from '@shared/types';
import { ActiveProjectsTile } from '../../components/tiles/ActiveProjectsTile';
import { AskTile } from '../../components/tiles/AskTile';
import { ClaudeSessionsTile } from '../../components/tiles/ClaudeSessionsTile';
import { DeadlinesTile } from '../../components/tiles/DeadlinesTile';
import { GardenerTile } from '../../components/tiles/GardenerTile';
import { InboxTile } from '../../components/tiles/InboxTile';
import { JournalStreakTile } from '../../components/tiles/JournalStreakTile';
import { LooseEndsTile } from '../../components/tiles/LooseEndsTile';
import { QuickCaptureTile } from '../../components/tiles/QuickCaptureTile';
import { RecentWorkTile } from '../../components/tiles/RecentWorkTile';
import { StaleProjectsTile } from '../../components/tiles/StaleProjectsTile';
import { TodosTile } from '../../components/tiles/TodosTile';
import { WaitingOnTile } from '../../components/tiles/WaitingOnTile';

const TodosWork = memo(() => <TodosTile scope="work" />);
TodosWork.displayName = 'TodosWorkTile';
const TodosPrivate = memo(() => <TodosTile scope="private" />);
TodosPrivate.displayName = 'TodosPrivateTile';

const TILES: Record<DashboardModuleId, ComponentType> = {
  'quick-capture': memo(QuickCaptureTile),
  ask: memo(AskTile),
  'recent-work': memo(RecentWorkTile),
  deadlines: memo(DeadlinesTile),
  'waiting-on': memo(WaitingOnTile),
  'todos-work': TodosWork,
  'todos-private': TodosPrivate,
  'active-projects': memo(ActiveProjectsTile),
  inbox: memo(InboxTile),
  'stale-projects': memo(StaleProjectsTile),
  'journal-streak': memo(JournalStreakTile),
  'claude-sessions': memo(ClaudeSessionsTile),
  gardener: memo(GardenerTile),
  'loose-ends': memo(LooseEndsTile),
};

export function renderTile(id: DashboardModuleId): React.JSX.Element {
  const Tile = TILES[id];
  return <Tile />;
}
