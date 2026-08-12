/* Das Gitter: vier Spalten, verschiebbare Kacheln — von Hand gebaut, ohne neue
   Abhängigkeit. Eine Bibliothek für Drag-and-drop bringt ihre eigene
   Tastaturbedienung mit, oder keine; hier ist beides derselbe Zustand
   (`use-tile-move.ts`).

   Diese Datei ist nur die Ansicht: Reihenfolge im DOM, die Lücke am Ziel, die
   gezogene Kachel am Zeiger und die zwei unsichtbaren Absätze — der Hinweis, auf
   den jeder Griff zeigt, und die Ansage, die jeden Schritt mitspricht. */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { DashboardLayout, DashboardModuleId, ModuleSize } from '@shared/types';
import { TileControlsProvider } from '../../components/TileFrame';
import { useT } from '../../i18n';
import { gridColumns, spanOf } from './layout';
import { useTileMove } from './use-tile-move';

/**
 * Spalten des Gitters bei der aktuellen Fensterbreite, mitgeführt.
 *
 * Die Lücke am Ziel wird daraus bemessen. Ohne die Breite rechnete sie im
 * vierspaltigen Maß weiter: bei 1152 px belegt eine `md`-Kachel eine Spalte, die
 * Lücke wäre zwei breit — eine Vorschau, die einen Platz zeigt, den die Kachel
 * nie einnimmt.
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
  /** Speichert eine geänderte Anordnung — optimistisch, mit Rücknahme im Hook. */
  onSave: (layout: DashboardLayout) => void;
  /** Rendert die Kachel eines Moduls. */
  render: (id: DashboardModuleId) => ReactNode;
  /** Kachel, auf die gesprungen werden soll. `nonce` löst den Sprung erneut aus. */
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
      {/* Sichtbar, solange etwas angehoben ist: dieselbe Zeile, die `aria-live`
          ansagt. `aria-hidden`, damit sie nicht zweimal vorgelesen wird. */}
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
 * Die Lücke am Ziel — in der Breite, die die Kachel **hier** einnimmt.
 *
 * Gerechnet wird mit `spanOf`, derselben Fassung, die auch die Pfeiltasten
 * benutzen und die die Media-Queries in `styles/app/dashboard.css` abbildet.
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
