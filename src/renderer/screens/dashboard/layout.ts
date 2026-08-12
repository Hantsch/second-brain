/* Die Anordnung als Rechnung — ohne React, ohne DOM, damit sie prüfbar ist.

   Ein Grundsatz durchzieht alles hier: **die Reihenfolge der sichtbaren Module
   ist die Wahrheit.** Ausgeblendete Module haben keine Position; sie stehen
   hinten und warten darauf, wieder angehakt zu werden. Deshalb ergibt jede
   Änderung eine Liste `[sichtbar in neuer Reihenfolge, ausgeblendet wie gehabt]`
   — und nicht eine Liste mit Löchern, in der eine Position etwas anderes
   bedeutet als das, was man sieht. */

import { DEFAULT_DASHBOARD_TILES } from '@shared/types';
import type { DashboardLayout, DashboardModuleId, DashboardTile, ModuleSize } from '@shared/types';

/** Spaltenbreite je Größe im vierspaltigen Raster. */
export const SPANS: Record<ModuleSize, number> = { sm: 1, md: 2, lg: 3, xl: 4 };

/** Die sichtbaren Module in ihrer Reihenfolge — das ist das Gitter. */
export function visibleTiles(layout: DashboardLayout): DashboardTile[] {
  return layout.tiles.filter((tile) => tile.hidden !== true);
}

function hiddenTiles(layout: DashboardLayout): DashboardTile[] {
  return layout.tiles.filter((tile) => tile.hidden === true);
}

function rebuild(layout: DashboardLayout, visible: readonly DashboardTile[]): DashboardLayout {
  return { tiles: [...visible, ...hiddenTiles(layout)], updated: layout.updated };
}

/** Position eines Moduls unter den sichtbaren; -1, wenn es ausgeblendet ist. */
export function positionOf(layout: DashboardLayout, id: DashboardModuleId): number {
  return visibleTiles(layout).findIndex((tile) => tile.id === id);
}

/**
 * Ein Modul an eine andere Position setzen. `to` zählt in der Liste **ohne** das
 * verschobene Modul — genau das, was eine Lücke im Gitter anzeigt. Werte
 * außerhalb werden geklemmt, nicht abgelehnt: ein Zug über den Rand hinaus soll
 * am Rand landen, nicht ins Leere.
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
 * Spalten des Gitters bei dieser Fensterbreite — dieselben Schwellen wie die
 * Media-Queries in `styles/app/dashboard.css`. Weicht eine Seite ab, schiebt die
 * Pfeiltaste in eine Richtung, die es auf dem Bildschirm nicht gibt.
 */
export function gridColumns(width: number): number {
  if (width <= 900) return 1;
  if (width <= 1152) return 2;
  return 4;
}

/**
 * Breite eines Moduls in Spalten — im engen Gitter halbiert, wie im CSS.
 *
 * Auch die Ziellücke beim Ziehen rechnet damit (`TileGrid`): eine Lücke, die
 * `SPANS[size]` breit ist, zeigt bei zwei Spalten einen Platz, den die Kachel nie
 * einnimmt — eine Vorschau, die etwas anderes verspricht als das Ergebnis.
 */
export function spanOf(size: ModuleSize, columns: number): number {
  if (columns <= 1) return 1;
  if (columns <= 2) return size === 'sm' || size === 'md' ? 1 : 2;
  return SPANS[size];
}

/**
 * Die Reihen, wie sie das Gitter füllt: zeilenweise, eine Kachel bricht um, wenn
 * sie nicht mehr passt. Grundlage der senkrechten Pfeiltasten.
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
 * Wie viele Positionen ein senkrechter Schritt bedeutet: nach unten so viele,
 * wie in der eigenen Reihe stehen; nach oben so viele, wie in der Reihe darüber
 * stehen. Ohne diese Rechnung wäre `ArrowDown` dasselbe wie `ArrowRight` — und
 * eine Pfeiltaste, die seitwärts schiebt, macht das Ausprobieren unmöglich.
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

/** Ein Modul um `offset` Positionen verschieben — der Weg der Pfeiltasten. */
export function shiftTile(
  layout: DashboardLayout,
  id: DashboardModuleId,
  offset: number,
): DashboardLayout {
  const from = positionOf(layout, id);
  if (from < 0) return layout;
  /* `moveTile` zählt ohne das Modul selbst: ein Schritt nach rechts ist deshalb
     `from + 1`, ein Schritt nach links `from - 1`. */
  return moveTile(layout, id, from + offset);
}

export function resizeTile(
  layout: DashboardLayout,
  id: DashboardModuleId,
  size: ModuleSize,
): DashboardLayout {
  /* Dieselbe Breite noch einmal wählen ist keine Änderung — und darf deshalb
     auch kein Schreibvorgang sein. */
  if (layout.tiles.find((tile) => tile.id === id)?.size === size) return layout;
  return {
    tiles: layout.tiles.map((tile) => (tile.id === id ? { ...tile, size } : tile)),
    updated: layout.updated,
  };
}

/**
 * Ein Modul aus- oder einblenden. Eingeblendet wird es hinten sichtbar — dort
 * findet man es, und von dort verschiebt man es hin, wo es hingehört.
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
  /* Dieselbe Stelle für beide Richtungen: das Modul landet als letztes Sichtbares
     bzw. als erstes Ausgeblendetes — und damit immer an der Grenze zwischen den
     beiden Gruppen. */
  return {
    tiles: [
      ...others.filter((tile) => tile.hidden !== true),
      next,
      ...others.filter((tile) => tile.hidden === true),
    ],
    updated: layout.updated,
  };
}

/** Die Startanordnung — dieselbe, die ein frischer Vault bekommt. */
export function defaultLayout(updated: string): DashboardLayout {
  return { tiles: DEFAULT_DASHBOARD_TILES.map((tile) => ({ ...tile })), updated };
}

/**
 * Zielposition beim Ziehen: wie viele der übrigen Kacheln liegen vor dem Zeiger?
 *
 * Zeilenweise gelesen, weil das Gitter zeilenweise fließt: was über dem Zeiger
 * liegt, kommt vorher; in derselben Zeile entscheidet die Mitte der Kachel.
 * Damit springt die Lücke nicht, wenn die Maus in einer Kachel wackelt.
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
