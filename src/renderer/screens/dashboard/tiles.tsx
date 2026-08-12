/* Welches Modul welche Kachel rendert — die einzige Stelle, die das weiß.

   `Record<DashboardModuleId, …>` erzwingt Vollständigkeit: ein neues Modul im
   Vertrag hat hier eine Kachel, sonst übersetzt der Compiler das nicht. Kein
   `default`-Fall, der still eine leere Fläche zeigt.

   `memo` ist hier kein Zierrat: während eines Zugs rendert das Gitter mit jeder
   Zeigerbewegung neu. Die Kacheln bekommen keine Eigenschaften, also überspringt
   React ihren Rumpf — nur der Rahmen zieht nach, weil er den Zustand des Gitters
   aus dem Kontext liest. Ohne das würden dreizehn Listen pro Bild neu gebaut. */

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
};

export function renderTile(id: DashboardModuleId): React.JSX.Element {
  const Tile = TILES[id];
  return <Tile />;
}
