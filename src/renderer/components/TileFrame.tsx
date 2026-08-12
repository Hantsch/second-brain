/* The frame of every dashboard tile: handle, title, count, menu — and the
   four states every tile treats alike (loading, error, empty, filled).

   The tile itself knows nothing about the grid. But the handle and menu
   need the grid's state (which tile is currently being moved, what width
   does it have, at what position does it sit) — that arrives via a context
   that `TileGrid` provides. Without a context, the frame renders without a
   handle and without a menu: that way a tile can be tested and viewed on
   its own.

   The handle is a button, not a hand-rolled `<div>`: that puts it in the
   keyboard path, gives it a name, and lets it carry `aria-pressed`. Moving
   via keyboard depends on exactly that. */

import { createContext, useContext } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { DashboardModuleId, ModuleSize } from '@shared/types';
import { Card } from '../atoms/Card';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { ErrorState } from './ErrorState';
import { Skeleton } from './Skeleton';
import { TileMenu } from './TileMenu';

/** What the frame needs from the grid. `null` means: no grid, no handle. */
export interface TileControls {
  /** Which tile is lifted (move mode)? */
  lifted: DashboardModuleId | null;
  size(id: DashboardModuleId): ModuleSize;
  position(id: DashboardModuleId): { index: number; total: number };
  onGrabPointer(id: DashboardModuleId, event: PointerEvent<HTMLElement>): void;
  onGrabKey(id: DashboardModuleId, event: KeyboardEvent<HTMLElement>): void;
  /** Focus leaves the handle — that ends a lifted move. */
  onGrabBlur(id: DashboardModuleId): void;
  onResize(id: DashboardModuleId, size: ModuleSize): void;
  onHide(id: DashboardModuleId): void;
  /** Registers the handle so the grid can move focus to it. */
  registerHandle(id: DashboardModuleId, element: HTMLButtonElement | null): void;
}

const TileControlsContext = createContext<TileControls | null>(null);

export const TileControlsProvider = TileControlsContext.Provider;

export interface TileFrameProps {
  id: DashboardModuleId;
  /** Title, already translated. */
  title: string;
  /** Number on the right of the header — data, hence mono. */
  count?: number | null;
  /** Calm additional info in the header, already translated. */
  meta?: string;
  /** Is the query still running? Then a placeholder instead of a statement. */
  pending?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Loaded and nothing found — the only case where `empty` applies. */
  isEmpty?: boolean;
  /** What will appear here, plus the action that fills it. */
  empty?: { body: string; action?: { label: string; onClick: () => void } };
  /** Footer, e.g. a path into the responsible screen. */
  foot?: ReactNode;
  children?: ReactNode;
}

export function TileFrame({
  id,
  title,
  count,
  meta,
  pending = false,
  error,
  onRetry,
  isEmpty = false,
  empty,
  foot,
  children,
}: TileFrameProps) {
  const controls = useContext(TileControlsContext);

  return (
    <Card padded={false} className="sb-tile-card">
      <div className="sb-tile-head">
        {controls === null ? null : <TileHandle id={id} title={title} controls={controls} />}
        <h2 className="sb-tile-title">{title}</h2>
        {typeof count === 'number' ? <span className="sb-tile-count">{count}</span> : null}
        {meta === undefined ? null : <span className="sb-tile-meta">{meta}</span>}
        {controls === null ? null : (
          <TileMenu
            id={id}
            title={title}
            size={controls.size(id)}
            onResize={controls.onResize}
            onHide={controls.onHide}
          />
        )}
      </div>
      <div className="sb-tile-body">
        {pending ? (
          <Skeleton lines={3} height={28} />
        ) : error !== undefined && error !== null ? (
          <ErrorState error={error} variant="secondary" {...(onRetry ? { onRetry } : {})} />
        ) : isEmpty && empty !== undefined ? (
          <div className="sb-tile-empty">
            <p className="sb-tile-emptytext">{empty.body}</p>
            {empty.action === undefined ? null : (
              <button type="button" className="sb-textlink" onClick={empty.action.onClick}>
                {empty.action.label}
              </button>
            )}
          </div>
        ) : (
          children
        )}
      </div>
      {foot === undefined || pending ? null : <div className="sb-tile-foot">{foot}</div>}
    </Card>
  );
}

interface HandleProps {
  id: DashboardModuleId;
  title: string;
  controls: TileControls;
}

/** The handle: grab with the pointer, lift with the keyboard. */
function TileHandle({ id, title, controls }: HandleProps) {
  const t = useT();
  const lifted = controls.lifted === id;
  const { index, total } = controls.position(id);

  return (
    <button
      type="button"
      ref={(element) => controls.registerHandle(id, element)}
      className={`sb-tile-handle${lifted ? ' sb-tile-handle--lifted' : ''}`}
      aria-label={t('dashboard.tile.grab', { title })}
      aria-pressed={lifted}
      aria-describedby="sb-tile-movehint"
      title={t('dashboard.tile.position', { position: index + 1, total })}
      onPointerDown={(event) => controls.onGrabPointer(id, event)}
      onKeyDown={(event) => controls.onGrabKey(id, event)}
      onBlur={() => controls.onGrabBlur(id)}
    >
      <Icon name="grip-vertical" size={15} />
    </button>
  );
}
