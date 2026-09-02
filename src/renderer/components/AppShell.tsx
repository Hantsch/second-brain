/* The shell: title bar on top, rail on the left, content on the right.
   The overlays that need to be reachable from anywhere also hang off here. */

import { useCallback, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AppBackground, AppIcon } from '@shared/types';
import { api } from '../lib/api';
import { qk } from '../lib/queries/keys';
import { backgroundImage } from '../lib/customization-assets';
import { useSeedGardenerProgress } from '../lib/queries/gardener';
import { ShellOverlaysProvider, useShellOverlays } from '../lib/shell-overlays';
import { useShellHotkeys } from '../lib/use-shell-hotkeys';
import { AskOverlay } from './AskOverlay';
import { CaptureOverlay } from './CaptureOverlay';
import { CommandPalette } from './CommandPalette';
import { QuitDuringRunDialog } from './QuitDuringRunDialog';
import { Rail } from './Rail';
import { RunStrip } from './RunStrip';
import { TitleBar } from './TitleBar';
import { ToastHost } from './ToastHost';

export interface AppShellProps {
  children: ReactNode;
  background: AppBackground;
  appIcon: AppIcon;
}

/* The provider sits above the entire shell body, not just around the routed
   children: the title bar opens the capture overlay too, and it lives here. */
export function AppShell(props: AppShellProps) {
  return (
    <ShellOverlaysProvider>
      <ShellBody {...props} />
    </ShellOverlaysProvider>
  );
}

function ShellBody({ children, background, appIcon }: AppShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const overlays = useShellOverlays();
  const { data: status } = useQuery({ queryKey: qk.vault.status(), queryFn: api.vault.status });
  /* AppShell is the one place mounted for the app's whole life — the natural
     spot to seed the progress store once per vault-ready transition (042, D2/D3),
     so a run started before anything was listening still shows up here. */
  useSeedGardenerProgress();

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeOverlay = overlays.close;
  /* Escape closes the topmost surface only — the palette lies over the overlay. */
  const onEscape = useCallback(() => {
    if (paletteOpen) setPaletteOpen(false);
    else closeOverlay();
  }, [paletteOpen, closeOverlay]);
  useShellHotkeys({ onPalette: openPalette, onEscape });

  return (
    <div className="sb-app">
      <TitleBar
        context={status?.name ?? null}
        onSearch={openPalette}
        onCapture={overlays.openCapture}
        appIcon={appIcon}
      />
      <RunStrip />
      <div
        className={background === 'none' ? 'sb-body' : 'sb-body sb-body--custom-background'}
        style={{ '--sb-custom-background': backgroundImage(background) } as CSSProperties}
      >
        <Rail />
        <main className="sb-content">{children}</main>
      </div>
      {paletteOpen ? <CommandPalette onClose={closePalette} /> : null}
      {overlays.open === 'capture' ? <CaptureOverlay onClose={closeOverlay} /> : null}
      {overlays.open === 'ask' ? (
        <AskOverlay prefill={overlays.askPrefill} onClose={closeOverlay} />
      ) : null}
      <ToastHost />
      <QuitDuringRunDialog />
    </div>
  );
}
