/* The shell: title bar on top, rail on the left, content on the right.
   The overlays that need to be reachable from anywhere also hang off here. */

import { useCallback, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AppBackground, AppIcon } from '@shared/types';
import { api } from '../lib/api';
import { qk } from '../lib/queries/keys';
import { backgroundImage } from '../lib/customization-assets';
import { useShellHotkeys } from '../lib/use-shell-hotkeys';
import { CommandPalette } from './CommandPalette';
import { Rail } from './Rail';
import { TitleBar } from './TitleBar';
import { ToastHost } from './ToastHost';

export interface AppShellProps {
  children: ReactNode;
  background: AppBackground;
  appIcon: AppIcon;
}

export function AppShell({ children, background, appIcon }: AppShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { data: status } = useQuery({ queryKey: qk.vault.status(), queryFn: api.vault.status });

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closeOverlays = useCallback(() => setPaletteOpen(false), []);
  useShellHotkeys({ onPalette: openPalette, onEscape: closeOverlays });

  return (
    <div className="sb-app">
      <TitleBar context={status?.name ?? null} onSearch={openPalette} appIcon={appIcon} />
      <div
        className={background === 'none' ? 'sb-body' : 'sb-body sb-body--custom-background'}
        style={{ '--sb-custom-background': backgroundImage(background) } as CSSProperties}
      >
        <Rail />
        <main className="sb-content">{children}</main>
      </div>
      {paletteOpen ? <CommandPalette onClose={closeOverlays} /> : null}
      <ToastHost />
    </div>
  );
}
