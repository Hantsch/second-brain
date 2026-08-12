/* Das Verschieben der Kacheln — der ganze Zustand an einem Ort, ohne Markup.

   Zwei Wege, ein Zustand:
   - **Zeigergerät**: `pointerdown` auf dem Griff, `pointermove` am Fenster (der
     Zeiger verlässt die Kachel sofort), `pointerup` legt ab. Die gezogene Kachel
     ist im Rendering `position: fixed` und folgt dem Zeiger; die Zielstelle ist
     eine Lücke. Weil die Kachel nicht im Raster liegt, springt sie nicht, wenn
     die Lücke wandert.
   - **Tastatur**: Leertaste/Enter hebt an, Pfeiltasten verschieben, Enter legt
     ab, Esc stellt die Reihenfolge von vor dem Anheben wieder her. Links und
     rechts ist ein Schritt, oben und unten sind so viele, wie in der Reihe
     stehen (`verticalStep`) — sonst schöbe `ArrowDown` seitwärts.

   Der angehobene Zustand ist ein Modus, und ein Modus braucht einen Fluchtweg,
   der überall gilt: `Esc` hängt am Fenster, nicht am Griff. Verlässt der Fokus
   den Griff (Tab, ein Klick woanders), ist der Zug abgebrochen — eine Vorschau,
   die stehen bleibt, während niemand sie mehr bedienen kann, behauptet eine
   Anordnung, die es nicht gibt. Und ein Zug mit der Maus beendet den
   Tastaturmodus, statt blockiert zu werden.

   Gespeichert wird beim Ablegen — nicht bei jeder Bewegung. Bis dahin gilt die
   Vorschau; danach gilt, was der Hauptprozess bestätigt.

   Angesagt wird jeder Schritt: ohne `aria-live` wäre das Verschieben per Tastatur
   stumm, und ein stummer Modus ist kein Modus. */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { DashboardLayout, DashboardModuleId, DashboardTile, ModuleSize } from '@shared/types';
import type { TileControls } from '../../components/TileFrame';
import { useT } from '../../i18n';
import { pushToast } from '../../lib/toast';
import {
  dropIndex,
  gridColumns,
  moveTile,
  positionOf,
  resizeTile,
  setTileHidden,
  shiftTile,
  verticalStep,
  visibleTiles,
} from './layout';

/** Was während des Ziehens gilt. */
export interface DragState {
  id: DashboardModuleId;
  /** Abstand Zeiger → linke obere Ecke beim Anfassen; hält die Kachel am Zeiger. */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  x: number;
  y: number;
  /** Zielposition, gezählt in der Liste ohne die gezogene Kachel. */
  over: number;
}

export interface TileMove {
  /** Die Anordnung, die gerade gilt: Vorschau, sonst die gespeicherte. */
  effective: DashboardLayout;
  visible: DashboardTile[];
  drag: DragState | null;
  lifted: DashboardModuleId | null;
  announcement: string;
  /** Sichtbare Leiste, solange eine Kachel angehoben ist; sonst `null`. */
  moveBar: string | null;
  controls: TileControls;
  /** Meldet das Element einer Kachel — für Trefferprüfung und Sprünge. */
  registerTile: (id: DashboardModuleId, element: HTMLLIElement | null) => void;
  /** Holt eine Kachel in den Blick und den Fokus auf ihren Griff. */
  jumpTo: (id: DashboardModuleId) => void;
  sizeOf: (id: DashboardModuleId) => ModuleSize;
}

export function useTileMove(
  layout: DashboardLayout,
  onSave: (layout: DashboardLayout) => void,
): TileMove {
  const t = useT();
  const [preview, setPreview] = useState<DashboardLayout | null>(null);
  const [lifted, setLifted] = useState<DashboardModuleId | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const beforeLift = useRef<DashboardLayout | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const tiles = useRef(new Map<DashboardModuleId, HTMLLIElement>());
  const handles = useRef(new Map<DashboardModuleId, HTMLButtonElement>());

  const effective = preview ?? layout;
  const visible = visibleTiles(effective);
  const total = visible.length;

  const sizeOf = useCallback(
    (id: DashboardModuleId): ModuleSize =>
      effective.tiles.find((tile) => tile.id === id)?.size ?? 'md',
    [effective],
  );

  const announce = useCallback(
    (key: string, id: DashboardModuleId, index: number, count: number): void => {
      setAnnouncement(t(key, { title: t(`module.${id}.name`), position: index + 1, total: count }));
    },
    [t],
  );

  const commit = useCallback(
    (next: DashboardLayout): void => {
      setPreview(null);
      if (next !== layout) onSave(next);
    },
    [layout, onSave],
  );

  const registerTile = useCallback((id: DashboardModuleId, element: HTMLLIElement | null): void => {
    if (element === null) tiles.current.delete(id);
    else tiles.current.set(id, element);
  }, []);

  const jumpTo = useCallback((id: DashboardModuleId): void => {
    /* Optional gerufen: eine Umgebung ohne Layout (jsdom) kennt `scrollIntoView`
       nicht — der Fokus ist der Teil, auf den es ankommt. */
    tiles.current.get(id)?.scrollIntoView?.({ block: 'nearest' });
    handles.current.get(id)?.focus();
  }, []);

  // ── Zeigergerät ───────────────────────────────────────────────────────────

  /** Die Rechtecke der übrigen Kacheln — Grundlage der Zielposition. */
  const rectsWithout = useCallback(
    (id: DashboardModuleId) => {
      const rects: { top: number; bottom: number; left: number; width: number }[] = [];
      for (const tile of visibleTiles(effective)) {
        if (tile.id === id) continue;
        const element = tiles.current.get(tile.id);
        if (element === undefined) continue;
        const rect = element.getBoundingClientRect();
        rects.push({ top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width });
      }
      return rects;
    },
    [effective],
  );

  /**
   * Den Tastaturmodus beenden und die Vorschau zurücknehmen. `announce` sagt es
   * an; nur beim Übergang in einen Mauszug bleibt es still, weil der Zug selbst
   * die Aussage ist.
   */
  const cancelLift = useCallback(
    (id: DashboardModuleId, speak: boolean): void => {
      const restored = beforeLift.current ?? layout;
      setPreview(null);
      setLifted(null);
      beforeLift.current = null;
      if (!speak) return;
      setAnnouncement(
        t('dashboard.move.cancelled', {
          title: t(`module.${id}.name`),
          position: Math.max(0, positionOf(restored, id)) + 1,
        }),
      );
    },
    [layout, t],
  );

  const onGrabPointer = useCallback(
    (id: DashboardModuleId, event: PointerEvent<HTMLElement>): void => {
      if (event.button !== 0) return;
      /* Ein Mauszug bei angehobener Kachel blockiert nicht, er übernimmt: der
         Tastaturmodus endet, die Vorschau geht zurück, der Zug beginnt. Gezählt
         wird deshalb in der Anordnung, die danach gilt. */
      const base = lifted === null ? effective : (beforeLift.current ?? layout);
      if (lifted !== null) cancelLift(lifted, false);
      const element = tiles.current.get(id);
      if (element === undefined) return;
      const rect = element.getBoundingClientRect();
      const started: DragState = {
        id,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        width: rect.width,
        height: rect.height,
        x: event.clientX,
        y: event.clientY,
        over: Math.max(0, positionOf(base, id)),
      };
      dragRef.current = started;
      setDrag(started);
      /* Kein Textmarkieren beim Ziehen — und der Griff behält den Fokus. */
      event.preventDefault();
    },
    [cancelLift, effective, layout, lifted],
  );

  /* Nur an- und abgemeldet, wenn ein Zug beginnt oder endet — nicht bei jeder
     Zeigerbewegung. Der laufende Zustand steht in `dragRef`, nicht im Zustand,
     genau deshalb. */
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return undefined;

    const move = (event: globalThis.PointerEvent): void => {
      const current = dragRef.current;
      if (current === null) return;
      const next = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        over: dropIndex(rectsWithout(current.id), event.clientX, event.clientY),
      };
      dragRef.current = next;
      setDrag(next);
    };

    const drop = (): void => {
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (current === null) return;
      const next = moveTile(effective, current.id, current.over);
      commit(next);
      announce(
        'dashboard.move.dropped',
        current.id,
        Math.max(0, positionOf(next, current.id)),
        visibleTiles(next).length,
      );
    };

    const cancel = (): void => {
      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', drop);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', drop);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [announce, commit, dragging, effective, rectsWithout]);

  // ── Tastatur ──────────────────────────────────────────────────────────────

  const onGrabKey = useCallback(
    (id: DashboardModuleId, event: KeyboardEvent<HTMLElement>): void => {
      const key = event.key;
      if (key === ' ' || key === 'Spacebar' || key === 'Enter') {
        event.preventDefault();
        if (lifted === id) {
          const index = Math.max(0, positionOf(effective, id));
          commit(effective);
          setLifted(null);
          beforeLift.current = null;
          announce('dashboard.move.dropped', id, index, total);
          return;
        }
        if (lifted !== null) return;
        beforeLift.current = effective;
        setLifted(id);
        announce('dashboard.move.lifted', id, Math.max(0, positionOf(effective, id)), total);
        return;
      }
      if (key === 'Escape' && lifted === id) {
        event.preventDefault();
        cancelLift(id, true);
        return;
      }
      if (lifted !== id) return;
      /* Tab verlässt den Griff — dann endet der Modus, statt als Vorschau ohne
         Bedienung stehen zu bleiben. Nicht abgefangen: der Fokus soll wandern. */
      if (key === 'Tab') {
        cancelLift(id, true);
        return;
      }
      const columns = gridColumns(typeof window === 'undefined' ? 1440 : window.innerWidth);
      const offset =
        key === 'ArrowRight'
          ? 1
          : key === 'ArrowLeft'
            ? -1
            : key === 'ArrowDown'
              ? verticalStep(effective, id, columns, 1)
              : key === 'ArrowUp'
                ? verticalStep(effective, id, columns, -1)
                : 0;
      if (offset === 0) return;
      event.preventDefault();
      const next = shiftTile(effective, id, offset);
      setPreview(next);
      announce('dashboard.move.moved', id, Math.max(0, positionOf(next, id)), total);
    },
    [announce, cancelLift, commit, effective, lifted, total],
  );

  /* Esc gilt überall, solange etwas angehoben ist: der Handler am Griff greift
     nicht mehr, sobald der Fokus woanders steht — und genau dann braucht man ihn. */
  useEffect(() => {
    if (lifted === null) return undefined;
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancelLift(lifted, true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelLift, lifted]);

  /**
   * Der Fokus verlässt den Griff (Klick woanders, Tab) — der Zug ist zu Ende.
   * Geprüft wird im nächsten Takt, weil das Neuordnen der Liste den Griff kurz
   * aus dem Baum nimmt: dabei blinkt der Fokus, ohne dass jemand etwas bedient.
   */
  const onGrabBlur = useCallback(
    (id: DashboardModuleId): void => {
      if (lifted !== id) return;
      window.setTimeout(() => {
        if (handles.current.get(id) === document.activeElement) return;
        cancelLift(id, true);
      }, 0);
    },
    [cancelLift, lifted],
  );

  const controls: TileControls = {
    lifted,
    size: sizeOf,
    position: (id) => ({ index: Math.max(0, positionOf(effective, id)), total }),
    onGrabPointer,
    onGrabKey,
    onGrabBlur,
    onResize: (id, size) => commit(resizeTile(effective, id, size)),
    /* Ausblenden ist eine Aktion mit Rückweg: die Meldung sagt, was verschwand,
       und nimmt es auf Wunsch zurück — genau die Anordnung von vorher. */
    onHide: (id) => {
      const before = effective;
      commit(setTileHidden(before, id, true));
      pushToast('info', {
        message: 'dashboard.tile.hidden',
        values: { title: t(`module.${id}.name`) },
        description: 'dashboard.tile.hiddenWhere',
        action: { label: 'common.undo', run: () => onSave(before) },
      });
    },
    registerHandle: (id, element) => {
      if (element === null) handles.current.delete(id);
      else handles.current.set(id, element);
    },
  };

  /* Dieselbe Zeichenkette wie die Ansage, nur sichtbar: ein Modus, den nur der
     Screenreader erfährt, ist für die Mehrheit der Tastaturnutzer nicht da. */
  const moveBar =
    lifted === null
      ? null
      : t('dashboard.move.bar', {
          title: t(`module.${lifted}.name`),
          position: Math.max(0, positionOf(effective, lifted)) + 1,
          total,
        });

  return {
    effective,
    visible,
    drag,
    lifted,
    announcement,
    moveBar,
    controls,
    registerTile,
    jumpTo,
    sizeOf,
  };
}
