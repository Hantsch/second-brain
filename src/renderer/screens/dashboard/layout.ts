/* The arrangement as a calculation — without React, without the DOM, so that
   it's testable.

   One principle runs through all of it: **the order of the visible modules
   is the truth.** Hidden modules have no position; they sit at the back and
   wait to be checked on again. That's why every change produces a list
   `[visible in new order, hidden as before]` — and not a list with holes,
   where a position means something different than what you see. */

import { DEFAULT_DASHBOARD_TILES } from '@shared/types';
import type { DashboardLayout, DashboardModuleId, DashboardTile, ModuleSize } from '@shared/types';

/** Column width per size in the four-column grid. */
export const SPANS: Record<ModuleSize, number> = { sm: 1, md: 2, lg: 3, xl: 4 };

/** The visible modules in their order — that's the grid. */
export function visibleTiles(layout: DashboardLayout): DashboardTile[] {
  return layout.tiles.filter((tile) => tile.hidden !== true);
}

function hiddenTiles(layout: DashboardLayout): DashboardTile[] {
  return layout.tiles.filter((tile) => tile.hidden === true);
}

function rebuild(layout: DashboardLayout, visible: readonly DashboardTile[]): DashboardLayout {
  return { tiles: [...visible, ...hiddenTiles(layout)], updated: layout.updated };
}

/** Position of a module among the visible ones; -1 if it's hidden. */
export function positionOf(layout: DashboardLayout, id: DashboardModuleId): number {
  return visibleTiles(layout).findIndex((tile) => tile.id === id);
}

/**
 * Set a module to a different position. `to` counts in the list **without**
 * the moved module — exactly what a gap in the grid indicates. Out-of-range
 * values are clamped, not rejected: a drag past the edge should land at the
 * edge, not into nothing.
 */
export function moveTile(
  layout: DashboardLayout,
  id: DashboardModuleId,
  to: number,
): DashboardLayout {
  const visible = visibleTiles(layout);
  const from = visible.findIndex((tile) => tile.id === id);
  if (from < 0) return layout;
  const rest = visible.filter((tile) => tile.id !== id);
  const target = Math.min(Math.max(0, to), rest.length);
  if (target === from) return layout;
  const moved = visible[from]!;
  return rebuild(layout, [...rest.slice(0, target), moved, ...rest.slice(target)]);
}

/**
 * Columns of the grid at this window width — the same thresholds as the
 * media queries in `styles/app/dashboard.css`. If one side deviates, the
 * arrow key pushes in a direction that doesn't exist on screen.
 */
export function gridColumns(width: number): number {
  if (width <= 900) return 1;
  if (width <= 1152) return 2;
  return 4;
}

/**
 * Width of a module in columns — halved in the narrow grid, as in the CSS.
 *
 * The target gap while dragging also calculates with this (`TileGrid`): a gap
 * that is `SPANS[size]` wide would, at two columns, show a spot the tile never
 * occupies — a preview that promises something different than the result.
 */
export function spanOf(size: ModuleSize, columns: number): number {
  if (columns <= 1) return 1;
  if (columns <= 2) return size === 'sm' || size === 'md' ? 1 : 2;
  return SPANS[size];
}

/** Where a tile sits in the grid beyond its column span. */
export interface GridPlacement {
  /** Grid rows the tile spans. */
  rows: number;
  /** Part of a stack: fills its cell, so the stack's gaps stay even. */
  stacked: boolean;
}

/**
 * How each tile is placed, in grid order (gap included).
 *
 * Only the two-column grid stacks: when a row ends with an `sm` tile and the
 * next tile is `sm` too, the row's first tile spans two rows, and the grid's
 * own auto-placement puts the second `sm` tile under the first. Without this
 * a short tile next to a tall one leaves a hole, and the next short tile
 * opens a row of its own. At 1152×720 that row is what pushed the default
 * grid past its two-screen budget (`MAX_DASHBOARD_SCREENS`, scripts/verify.mjs).
 *
 * The three tiles of a stack fill their cells: the grid spreads the tall
 * tile's extra height over both rows, which would otherwise open a wider gap
 * between the two short ones than anywhere else in the grid.
 *
 * Pure, and fed the same sequence the DOM gets — the drag preview's gap
 * included — so the preview stacks exactly like the result will.
 */
export function gridPlacements(sizes: readonly ModuleSize[], columns: number): GridPlacement[] {
  const placements = sizes.map(() => ({ rows: 1, stacked: false }));
  if (columns !== 2) return placements;
  let index = 0;
  while (index < sizes.length) {
    const first = sizes[index]!;
    const second = sizes[index + 1];
    const next = sizes[index + 2];
    const pair = spanOf(first, columns) === 1 && second !== undefined;
    if (pair && second === 'sm' && next === 'sm') {
      placements[index] = { rows: 2, stacked: true };
      placements[index + 1] = { rows: 1, stacked: true };
      placements[index + 2] = { rows: 1, stacked: true };
      /* first + second fill this row, next fills the cell under second. */
      index += 3;
    } else {
      index += pair && spanOf(second, columns) === 1 ? 2 : 1;
    }
  }
  return placements;
}

/**
 * The rows as the grid fills them: row by row, a tile wraps when it no
 * longer fits. Basis for the vertical arrow keys.
 */
export function tileRows(layout: DashboardLayout, columns: number): DashboardModuleId[][] {
  const rows: DashboardModuleId[][] = [];
  let current: DashboardModuleId[] = [];
  let used = 0;
  for (const tile of visibleTiles(layout)) {
    const span = spanOf(tile.size, columns);
    if (used > 0 && used + span > columns) {
      rows.push(current);
      current = [];
      used = 0;
    }
    current.push(tile.id);
    used += span;
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

/**
 * How many positions a vertical step means: downward as many as stand in the
 * current row; upward as many as stand in the row above. Without this
 * calculation `ArrowDown` would be the same as `ArrowRight` — and an arrow
 * key that shifts sideways makes exploring by feel impossible.
 */
export function verticalStep(
  layout: DashboardLayout,
  id: DashboardModuleId,
  columns: number,
  direction: 1 | -1,
): number {
  const rows = tileRows(layout, columns);
  const at = rows.findIndex((row) => row.includes(id));
  if (at < 0) return direction;
  if (direction === 1) return rows[at]?.length ?? 1;
  return -(rows[at - 1]?.length ?? rows[at]?.length ?? 1);
}

/** Move a module by `offset` positions — the path taken by the arrow keys. */
export function shiftTile(
  layout: DashboardLayout,
  id: DashboardModuleId,
  offset: number,
): DashboardLayout {
  const from = positionOf(layout, id);
  if (from < 0) return layout;
  /* `moveTile` counts without the module itself: a step to the right is
     therefore `from + 1`, a step to the left `from - 1`. */
  return moveTile(layout, id, from + offset);
}

export function resizeTile(
  layout: DashboardLayout,
  id: DashboardModuleId,
  size: ModuleSize,
): DashboardLayout {
  /* Choosing the same width again is not a change — and therefore must not
     be a write either. */
  if (layout.tiles.find((tile) => tile.id === id)?.size === size) return layout;
  return {
    tiles: layout.tiles.map((tile) => (tile.id === id ? { ...tile, size } : tile)),
    updated: layout.updated,
  };
}

/**
 * Show or hide a module. When shown, it becomes visible at the back — that's
 * where you find it, and from there you move it to where it belongs.
 */
export function setTileHidden(
  layout: DashboardLayout,
  id: DashboardModuleId,
  hidden: boolean,
): DashboardLayout {
  const found = layout.tiles.find((tile) => tile.id === id);
  if (found === undefined || (found.hidden === true) === hidden) return layout;
  const next: DashboardTile = { ...found };
  if (hidden) next.hidden = true;
  else delete next.hidden;
  const others = layout.tiles.filter((tile) => tile.id !== id);
  /* The same spot for both directions: the module lands as the last visible
     one or as the first hidden one — and thus always at the boundary between
     the two groups. */
  return {
    tiles: [
      ...others.filter((tile) => tile.hidden !== true),
      next,
      ...others.filter((tile) => tile.hidden === true),
    ],
    updated: layout.updated,
  };
}

/** The starting arrangement — the same one a fresh vault gets. */
export function defaultLayout(updated: string): DashboardLayout {
  return { tiles: DEFAULT_DASHBOARD_TILES.map((tile) => ({ ...tile })), updated };
}

/**
 * Target position while dragging: how many of the remaining tiles lie before
 * the pointer?
 *
 * Read row by row, because the grid flows row by row: what lies above the
 * pointer comes first; in the same row, the center of the tile decides.
 * This keeps the gap from jumping when the mouse wobbles within a tile.
 */
export function dropIndex(
  rects: readonly { top: number; bottom: number; left: number; width: number }[],
  x: number,
  y: number,
): number {
  let before = 0;
  for (const rect of rects) {
    if (y > rect.bottom) {
      before += 1;
      continue;
    }
    if (y < rect.top) continue;
    if (x > rect.left + rect.width / 2) before += 1;
  }
  return before;
}
