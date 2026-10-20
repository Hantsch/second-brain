/* A tile's card menu: choose a width, hide the tile.

   Fully operable with the keyboard, because a menu that only knows the
   mouse hides half its function: Enter or space opens it, the arrow keys
   move through it, Enter selects, Esc closes it and returns focus to the
   button. On open, focus jumps to the first entry — otherwise a screen
   reader wouldn't know that something opened.

   The widths are `menuitemradio` with `aria-checked`: a selection where
   exactly one applies. "Hide" is an ordinary `menuitem` — an action. */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { MODULE_SIZES } from '@shared/types';
import type { DashboardModuleId, ModuleSize } from '@shared/types';
import { Icon } from '../atoms/Icon';
import { IconButton } from '../atoms/IconButton';
import { useT } from '../i18n';

export interface TileMenuProps {
  id: DashboardModuleId;
  /** Title of the tile, already translated — it's part of the button's name. */
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

  /* The button is the first child of the wrapper — the atom doesn't accept
     a ref, and threading one through the atom would cost more than this line. */
  const focusTrigger = (): void => {
    box.current?.querySelector<HTMLButtonElement>(':scope > button')?.focus();
  };

  const close = (backToTrigger: boolean): void => {
    setOpen(false);
    if (backToTrigger) focusTrigger();
  };

  /* There's no such thing as a menu without an escape route: Esc closes it,
     and so does a click outside it. */
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: globalThis.MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  /* Focus moves along: opened means the first entry is up. */
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
      /* Tabbing onward leaves the menu — then it's closed. */
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
