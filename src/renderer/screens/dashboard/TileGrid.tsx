/* The grid: four columns, movable tiles — built by hand, without a new
   dependency. A drag-and-drop library brings its own keyboard handling, or
   none at all; here both are the same state (`use-tile-move.ts`).

   This file is only the view: order in the DOM, the gap at the target, the
   dragged tile at the pointer, and the two invisible paragraphs — the hint
   that every handle points to, and the announcement that speaks each step. */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { DashboardLayout, DashboardModuleId, DashboardTile, ModuleSize } from '@shared/types';
import { TileControlsProvider } from '../../components/TileFrame';
import { useT } from '../../i18n';
import { gridColumns, gridPlacements, spanOf } from './layout';
import type { GridPlacement } from './layout';
import { useTileMove } from './use-tile-move';

/**
 * Columns of the grid at the current window width, kept in sync.
 *
 * The gap at the target is sized from this. Without the width it would keep
 * calculating in the four-column measure: at 1152 px an `md` tile occupies one
 * column, but the gap would be two wide — a preview that shows a spot the tile
 * never actually occupies.
 */
function useGridColumns(): number {
  const [columns, setColumns] = useState(() =>
    gridColumns(typeof window === 'undefined' ? 1440 : window.innerWidth),
  );
  useEffect(() => {
    const update = (): void => setColumns(gridColumns(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return columns;
}

export interface TileGridProps {
  layout: DashboardLayout;
  /** Saves a changed arrangement — optimistically, with rollback in the hook. */
  onSave: (layout: DashboardLayout) => void;
  /** Renders the tile of a module. */
  render: (id: DashboardModuleId) => ReactNode;
  /** Tile to jump to. `nonce` re-triggers the jump. */
  focus?: { id: DashboardModuleId; nonce: number } | null;
}

export function TileGrid({ layout, onSave, render, focus = null }: TileGridProps) {
  const t = useT();
  const move = useTileMove(layout, onSave);
  const columns = useGridColumns();
  const { drag, jumpTo } = move;

  useEffect(() => {
    if (focus === null) return;
    jumpTo(focus.id);
  }, [focus, jumpTo]);

  /* Grid order as the DOM gets it: the dragged tile is `position: fixed` and
     out of the flow, the gap stands where it would land. The placements are
     computed over exactly this sequence, so the preview stacks like the result. */
  const entries: ({ kind: 'tile'; tile: DashboardTile } | { kind: 'gap'; size: ModuleSize })[] = [];
  let placed = 0;
  for (const tile of move.visible) {
    const dragged = drag !== null && drag.id === tile.id;
    if (drag !== null && !dragged) {
      if (placed === drag.over) entries.push({ kind: 'gap', size: move.sizeOf(drag.id) });
      placed += 1;
    }
    entries.push({ kind: 'tile', tile });
  }
  if (drag !== null && placed === drag.over) {
    entries.push({ kind: 'gap', size: move.sizeOf(drag.id) });
  }
  const inFlow = entries.filter(
    (entry) => entry.kind === 'gap' || drag === null || entry.tile.id !== drag.id,
  );
  const placements = gridPlacements(
    inFlow.map((entry) => (entry.kind === 'gap' ? entry.size : entry.tile.size)),
    columns,
  );
  const placementOf = (entry: (typeof entries)[number]): GridPlacement =>
    placements[inFlow.indexOf(entry)] ?? { rows: 1, stacked: false };

  const items: ReactNode[] = entries.map((entry) => {
    if (entry.kind === 'gap') {
      return <Gap key="gap" size={entry.size} columns={columns} placement={placementOf(entry)} />;
    }
    const { tile } = entry;
    const dragged = drag !== null && drag.id === tile.id;
    const { rows, stacked } = placementOf(entry);
    return (
      <li
        key={tile.id}
        ref={(element) => move.registerTile(tile.id, element)}
        className={[
          'sb-tile',
          `sb-tile--${tile.size}`,
          stacked ? 'sb-tile--stacked' : '',
          dragged ? 'sb-tile--dragging' : '',
          move.lifted === tile.id ? 'sb-tile--lifted' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={
          dragged && drag !== null
            ? {
                position: 'fixed',
                left: drag.x - drag.offsetX,
                top: drag.y - drag.offsetY,
                width: drag.width,
                height: drag.height,
              }
            : rows > 1
              ? { gridRow: `span ${rows}` }
              : undefined
        }
      >
        {render(tile.id)}
      </li>
    );
  });

  return (
    <TileControlsProvider value={move.controls}>
      <p className="sb-visually-hidden" id="sb-tile-movehint">
        {t('dashboard.move.hint')}
      </p>
      <ul className="sb-tiles" aria-label={t('dashboard.tiles.label')}>
        {items}
      </ul>
      {/* Visible as long as something is lifted: the same line that `aria-live`
          announces. `aria-hidden` so it isn't read out twice. */}
      {move.moveBar === null ? null : (
        <p className="sb-movebar" aria-hidden="true">
          <span className="sb-movebar-mark" />
          {move.moveBar}
        </p>
      )}
      <p className="sb-visually-hidden" role="status" aria-live="polite">
        {move.announcement}
      </p>
    </TileControlsProvider>
  );
}

/**
 * The gap at the target — in the width the tile would occupy **here**.
 *
 * Calculated with `spanOf`, the same version the arrow keys use and which
 * mirrors the media queries in `styles/app/dashboard.css`.
 */
function Gap({
  size,
  columns,
  placement,
}: {
  size: ModuleSize;
  columns: number;
  placement: GridPlacement;
}) {
  return (
    <li
      className={`sb-tile sb-tile-gap${placement.stacked ? ' sb-tile--stacked' : ''}`}
      style={{
        gridColumn: `span ${spanOf(size, columns)}`,
        ...(placement.rows > 1 ? { gridRow: `span ${placement.rows}` } : {}),
      }}
      aria-hidden="true"
    />
  );
}
