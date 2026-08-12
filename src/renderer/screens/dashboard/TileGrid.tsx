/* The grid: four columns, movable tiles — built by hand, without a new
   dependency. A drag-and-drop library brings its own keyboard handling, or
   none at all; here both are the same state (`use-tile-move.ts`).

   This file is only the view: order in the DOM, the gap at the target, the
   dragged tile at the pointer, and the two invisible paragraphs — the hint
   that every handle points to, and the announcement that speaks each step. */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { DashboardLayout, DashboardModuleId, ModuleSize } from '@shared/types';
import { TileControlsProvider } from '../../components/TileFrame';
import { useT } from '../../i18n';
import { gridColumns, spanOf } from './layout';
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

  const items: ReactNode[] = [];
  let placed = 0;
  for (const tile of move.visible) {
    const dragged = drag !== null && drag.id === tile.id;
    if (drag !== null && !dragged) {
      if (placed === drag.over) {
        items.push(<Gap key="gap" size={move.sizeOf(drag.id)} columns={columns} />);
      }
      placed += 1;
    }
    items.push(
      <li
        key={tile.id}
        ref={(element) => move.registerTile(tile.id, element)}
        className={[
          'sb-tile',
          `sb-tile--${tile.size}`,
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
            : undefined
        }
      >
        {render(tile.id)}
      </li>,
    );
  }
  if (drag !== null && placed === drag.over) {
    items.push(<Gap key="gap" size={move.sizeOf(drag.id)} columns={columns} />);
  }

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
function Gap({ size, columns }: { size: ModuleSize; columns: number }) {
  return (
    <li
      className="sb-tile sb-tile-gap"
      style={{ gridColumn: `span ${spanOf(size, columns)}` }}
      aria-hidden="true"
    />
  );
}
