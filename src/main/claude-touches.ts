/* Arbeitsspuren von außen — die Brücke zwischen den Claude-Sessions und dem
   Index.

   `IndexService.open({ externalTouches })` nimmt eine `ReadonlyMap` und liest sie
   bei **jedem** Lauf neu. Deshalb ist es dieselbe Karte über die Lebenszeit eines
   Vaults: der erste Sitzungslauf füllt sie, ein `refresh()` danach schreibt
   `lastTouch`, `lastTouchSource` und `stale` fort. Zwei Karten wären zwei
   Wahrheiten — eine im Index, eine im Dashboard.

   Beim Öffnen eines anderen Vaults wird sie geleert: die Slugs des alten Vaults
   würden dort auf Projekte zeigen, die es nicht gibt. */

import type { ExternalTouch } from '@core/index/types';

const touches = new Map<string, ExternalTouch>();

/** Die Karte selbst — nur `core-bridge.ts` gibt sie an den Index. */
export function externalTouches(): Map<string, ExternalTouch> {
  return touches;
}

/** Leert die Karte und gibt sie zurück. Beim Öffnen eines Vaults. */
export function resetExternalTouches(): Map<string, ExternalTouch> {
  touches.clear();
  return touches;
}

/**
 * Übernimmt die Spuren eines Sitzungslaufs. Rückgabe: hat sich etwas geändert?
 * Nur dann muss der Index nachziehen — sonst wäre jeder Dashboard-Aufruf ein
 * vollständiger Indexlauf.
 */
export function applyExternalTouches(next: ReadonlyMap<string, ExternalTouch>): boolean {
  let changed = false;
  for (const [slug, touch] of next) {
    const known = touches.get(slug);
    if (known?.at === touch.at && known.source === touch.source) continue;
    touches.set(slug, touch);
    changed = true;
  }
  /* Was der Lauf nicht mehr kennt, verschwindet: eine gelöschte Verlaufsdatei
     darf kein `lastTouch` behaupten, das es nicht mehr gibt. */
  for (const slug of [...touches.keys()]) {
    if (next.has(slug)) continue;
    touches.delete(slug);
    changed = true;
  }
  return changed;
}
