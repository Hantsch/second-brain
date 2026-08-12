/* Das Kartenmenü einer Kachel: Breite wählen, Kachel ausblenden.

   Vollständig mit der Tastatur bedienbar, weil ein Menü, das nur die Maus kennt,
   die halbe Funktion versteckt: Enter oder Leertaste öffnet, die Pfeiltasten
   wandern, Enter wählt, Esc schließt und gibt den Fokus an den Knopf zurück.
   Beim Öffnen springt der Fokus auf den ersten Eintrag — sonst wüsste ein
   Screenreader nicht, dass sich etwas geöffnet hat.

   Die Breiten sind `menuitemradio` mit `aria-checked`: eine Auswahl, von der
   genau eine gilt. „Ausblenden" ist ein gewöhnlicher `menuitem` — eine Aktion. */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { MODULE_SIZES } from '@shared/types';
import type { DashboardModuleId, ModuleSize } from '@shared/types';
import { Icon } from '../atoms/Icon';
import { IconButton } from '../atoms/IconButton';
import { useT } from '../i18n';

export interface TileMenuProps {
  id: DashboardModuleId;
  /** Titel der Kachel, bereits übersetzt — er steht im Namen des Knopfs. */
  title: string;
  size: ModuleSize;
  onResize: (id: DashboardModuleId, size: ModuleSize) => void;
  onHide: (id: DashboardModuleId) => void;
}

export function TileMenu({ id, title, size, onResize, onHide }: TileMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  /* Der Knopf ist das erste Kind der Hülle — das Atom nimmt keine Referenz, und
     eine Referenz durch das Atom zu ziehen wäre teurer als diese Zeile. */
  const focusTrigger = (): void => {
    box.current?.querySelector<HTMLButtonElement>(':scope > button')?.focus();
  };

  const close = (backToTrigger: boolean): void => {
    setOpen(false);
    if (backToTrigger) focusTrigger();
  };

  /* Ein Menü ohne Fluchtweg gibt es nicht: Esc schließt, ein Klick daneben auch. */
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: globalThis.MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  /* Der Fokus wandert mit: geöffnet heißt, der erste Eintrag ist dran. */
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]')?.focus();
  }, [open]);

  const onPanelKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      /* Weitertabben verlässt das Menü — dann ist es zu. */
      setOpen(false);
      return;
    }
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const items = [
      ...(panel.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? []),
    ];
    const current = items.findIndex((item) => item === document.activeElement);
    const next = items[(current + step + items.length) % items.length];
    next?.focus();
  };

  const label = t('dashboard.tile.menu', { title });

  return (
    <div className="sb-tile-menu" ref={box}>
      <IconButton
        icon="ellipsis"
        size="sm"
        variant="ghost"
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open ? (
        <div
          className="sb-tile-menupanel"
          role="menu"
          aria-label={label}
          ref={panel}
          onKeyDown={onPanelKey}
        >
          <span className="sb-tile-menulabel">{t('dashboard.tile.size')}</span>
          {MODULE_SIZES.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={size === option}
              className="sb-tile-menuitem"
              onClick={() => {
                close(true);
                onResize(id, option);
              }}
            >
              <span className="sb-tile-menucheck" aria-hidden="true">
                {size === option ? <Icon name="check" size={13} /> : null}
              </span>
              {t(`dashboard.tile.size.${option}`)}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className="sb-tile-menuitem sb-tile-menuitem--split"
            onClick={() => {
              close(false);
              onHide(id);
            }}
          >
            <span className="sb-tile-menucheck" aria-hidden="true">
              <Icon name="eye-off" size={13} />
            </span>
            {t('dashboard.tile.hide')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
