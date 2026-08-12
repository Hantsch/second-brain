/* Die Hülle: Titelzeile oben, Rail links, Inhalt rechts.
   Hier hängen auch die Overlays, die überall erreichbar sein müssen. */

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { qk } from '../lib/queries/keys';
import { useShellHotkeys } from '../lib/use-shell-hotkeys';
import { CommandPalette } from './CommandPalette';
import { Rail } from './Rail';
import { TitleBar } from './TitleBar';
import { ToastHost } from './ToastHost';

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { data: status } = useQuery({ queryKey: qk.vault.status(), queryFn: api.vault.status });

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closeOverlays = useCallback(() => setPaletteOpen(false), []);
  useShellHotkeys({ onPalette: openPalette, onEscape: closeOverlays });

  return (
    <div className="sb-app">
      <TitleBar context={status?.name ?? null} onSearch={openPalette} />
      <div className="sb-body">
        <Rail />
        <main className="sb-content">{children}</main>
      </div>
      {paletteOpen ? <CommandPalette onClose={closeOverlays} /> : null}
      <ToastHost />
    </div>
  );
}
