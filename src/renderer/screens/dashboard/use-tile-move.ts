/* Moving tiles — all the state in one place, without markup.

   Two paths, one state:
   - **Pointer device**: `pointerdown` on the handle, `pointermove` on the
     window (the pointer leaves the tile immediately), `pointerup` drops it.
     The dragged tile is rendered `position: fixed` and follows the
     pointer; the target spot is a gap. Because the tile no longer sits in
     the grid, it doesn't jump when the gap moves.
   - **Keyboard**: space/Enter lifts it, arrow keys move it, Enter drops it,
     Esc restores the order from before the lift. Left and right are one
     step, up and down are as many as stand in the row (`verticalStep`) —
     otherwise `ArrowDown` would push sideways.

   The lifted state is a mode, and a mode needs an escape route that works
   everywhere: `Esc` is bound to the window, not the handle. If focus leaves
   the handle (Tab, a click elsewhere), the move is cancelled — a preview
   that stays on screen while nobody can operate it anymore would claim an
   arrangement that doesn't exist. And a drag with the mouse ends keyboard
   mode instead of being blocked by it.

   Saving happens on drop — not on every movement. Until then the preview
   applies; afterward, whatever the main process confirms applies.

   Every step is announced: without `aria-live`, moving via keyboard would
   be silent, and a silent mode is no mode at all. */

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

/** What applies while dragging. */
export interface DragState {
  id: DashboardModuleId;
  /** Distance pointer -> top-left corner at grab time; keeps the tile at the pointer. */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  x: number;
  y: number;
  /** Target position, counted in the list without the dragged tile. */
  over: number;
}

export interface TileMove {
  /** The arrangement that currently applies: preview, otherwise the saved one. */
  effective: DashboardLayout;
  visible: DashboardTile[];
  drag: DragState | null;
  lifted: DashboardModuleId | null;
  announcement: string;
  /** Visible bar as long as a tile is lifted; `null` otherwise. */
  moveBar: string | null;
  controls: TileControls;
  /** Registers a tile's element — for hit testing and jumps. */
  registerTile: (id: DashboardModuleId, element: HTMLLIElement | null) => void;
  /** Brings a tile into view and focuses its handle. */
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
    /* Called optionally: an environment without layout (jsdom) doesn't
       know `scrollIntoView` — the focus is the part that actually matters. */
    tiles.current.get(id)?.scrollIntoView?.({ block: 'nearest' });
    handles.current.get(id)?.focus();
  }, []);

  // ── Pointer device ────────────────────────────────────────────────────────

  /** The rectangles of the remaining tiles — basis for the target position. */
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
   * End keyboard mode and revert the preview. `announce` reports it; only
   * when transitioning into a mouse drag does it stay silent, because the
   * drag itself is the statement.
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
      /* A mouse drag while a tile is lifted doesn't block, it takes over:
         keyboard mode ends, the preview reverts, the drag begins. That's
         why counting happens in the arrangement that applies afterward. */
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
      /* No text selection while dragging — and the handle keeps focus. */
      event.preventDefault();
    },
    [cancelLift, effective, layout, lifted],
  );

  /* Only subscribed and unsubscribed when a drag starts or ends — not on
     every pointer movement. That's exactly why the running state lives in
     `dragRef`, not in React state. */
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

  // ── Keyboard ──────────────────────────────────────────────────────────────

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
      /* Tab leaves the handle — then the mode ends instead of staying as a
         preview nobody can operate. Not intercepted: focus is meant to move on. */
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

  /* Esc applies everywhere as long as something is lifted: the handler on
     the handle no longer fires once focus is elsewhere — and that's
     exactly when it's needed. */
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
   * Focus leaves the handle (click elsewhere, Tab) — the drag is over.
   * Checked on the next tick, because reordering the list briefly removes
   * the handle from the tree: focus flickers during that, without anyone
   * actually operating anything.
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
    /* Hiding is an action with a way back: the toast says what disappeared,
       and undoes it on request — exactly the arrangement from before. */
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

  /* The same string as the announcement, only visible: a mode that only
     the screen reader learns about doesn't exist for the majority of
     keyboard users. */
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
