/* Der Rahmen jeder Dashboard-Kachel: Griff, Titel, Zahl, Menü — und die vier
   Zustände, die jede Kachel gleich behandelt (lädt, Fehler, leer, gefüllt).

   Die Kachel selbst weiß nichts vom Gitter. Griff und Menü brauchen aber den
   Zustand des Gitters (welche Kachel wird gerade verschoben, welche Breite hat
   sie, an welcher Position steht sie) — der kommt über einen Kontext, den
   `TileGrid` bereitstellt. Ohne Kontext rendert der Rahmen ohne Griff und ohne
   Menü: so lässt sich eine Kachel einzeln testen und einzeln anschauen.

   Der Griff ist ein Knopf, kein Handgriff aus `<div>`: damit ist er im
   Tastaturweg, hat einen Namen und kann `aria-pressed` tragen. Genau daran hängt
   das Verschieben per Tastatur. */

import { createContext, useContext } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { DashboardModuleId, ModuleSize } from '@shared/types';
import { Card } from '../atoms/Card';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { ErrorState } from './ErrorState';
import { Skeleton } from './Skeleton';
import { TileMenu } from './TileMenu';

/** Was der Rahmen vom Gitter braucht. `null` heißt: kein Gitter, kein Griff. */
export interface TileControls {
  /** Welche Kachel ist angehoben (Verschiebemodus)? */
  lifted: DashboardModuleId | null;
  size(id: DashboardModuleId): ModuleSize;
  position(id: DashboardModuleId): { index: number; total: number };
  onGrabPointer(id: DashboardModuleId, event: PointerEvent<HTMLElement>): void;
  onGrabKey(id: DashboardModuleId, event: KeyboardEvent<HTMLElement>): void;
  /** Der Fokus verlässt den Griff — ein angehobener Zug endet damit. */
  onGrabBlur(id: DashboardModuleId): void;
  onResize(id: DashboardModuleId, size: ModuleSize): void;
  onHide(id: DashboardModuleId): void;
  /** Meldet den Griff an, damit das Gitter den Fokus dorthin setzen kann. */
  registerHandle(id: DashboardModuleId, element: HTMLButtonElement | null): void;
}

const TileControlsContext = createContext<TileControls | null>(null);

export const TileControlsProvider = TileControlsContext.Provider;

export interface TileFrameProps {
  id: DashboardModuleId;
  /** Titel, bereits übersetzt. */
  title: string;
  /** Kennzahl rechts im Kopf — Daten, deshalb Mono. */
  count?: number | null;
  /** Ruhige Zusatzangabe im Kopf, bereits übersetzt. */
  meta?: string;
  /** Läuft die Abfrage noch? Dann Platzhalter statt einer Aussage. */
  pending?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Geladen und nichts gefunden — der einzige Fall, in dem `empty` gilt. */
  isEmpty?: boolean;
  /** Was hier erscheinen wird, plus die Aktion, die es füllt. */
  empty?: { body: string; action?: { label: string; onClick: () => void } };
  /** Fußzeile, etwa ein Weg in den zuständigen Screen. */
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

/** Der Griff: anfassen mit dem Zeiger, anheben mit der Tastatur. */
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
