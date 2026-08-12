/* Fenstergeometrie auf einen sichtbaren Bildschirm klemmen.
   Reine Funktionen, damit sie ohne Electron prüfbar sind: der Bildschirm wird
   als Liste von Arbeitsflächen hereingegeben. */

import type { WindowBounds } from '@shared/types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Sorgt dafür, dass ein gespeichertes Fenster wieder sichtbar aufgeht: es
 * landet auf dem Bildschirm, mit dem es sich am meisten überschneidet, und wird
 * dort auf die Arbeitsfläche geklemmt. Ohne gespeicherte Position bleibt die
 * Position offen — dann zentriert Electron selbst.
 */
export function clampBounds(saved: WindowBounds, areas: readonly Rect[], min: Size): WindowBounds {
  const width = Math.max(min.width, Math.round(saved.width));
  const height = Math.max(min.height, Math.round(saved.height));
  const first = areas[0];
  if (!first) return { ...saved, width, height };

  if (saved.x === undefined || saved.y === undefined) {
    return {
      ...saved,
      width: Math.min(width, first.width),
      height: Math.min(height, first.height),
    };
  }

  const wanted: Rect = { x: Math.round(saved.x), y: Math.round(saved.y), width, height };
  let target = first;
  let best = 0;
  for (const area of areas) {
    const score = overlap(wanted, area);
    if (score > best) {
      best = score;
      target = area;
    }
  }

  const fitWidth = Math.min(wanted.width, target.width);
  const fitHeight = Math.min(wanted.height, target.height);
  return {
    ...saved,
    width: fitWidth,
    height: fitHeight,
    x: Math.min(Math.max(wanted.x, target.x), target.x + target.width - fitWidth),
    y: Math.min(Math.max(wanted.y, target.y), target.y + target.height - fitHeight),
  };
}
