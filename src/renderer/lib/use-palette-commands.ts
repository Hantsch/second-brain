/* What the command palette can do: the fixed destinations and actions, plus
   whatever a screen registered. Separate from `CommandPalette` because that
   one answers a different question — how the palette looks and reacts.
   The registry itself lives in `commands.ts`. */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import type { CommandDef } from './commands';
import { useRegisteredCommands } from './commands';
import { SCREENS } from './screens';
import { useShellOverlays } from './shell-overlays';

/** What the palette itself has to do — it cannot be expressed as a command. */
export interface PaletteHandlers {
  /** Switches the palette into ask mode; it stays open. */
  onAsk: () => void;
}

/** Every command the palette offers, in display order. */
export function usePaletteCommands({ onAsk }: PaletteHandlers): CommandDef[] {
  const navigate = useNavigate();
  /* Outside a provider this hands back no-ops, so the palette still renders
     standalone in a test that has no overlay host. */
  const overlays = useShellOverlays();
  const registered = useRegisteredCommands();

  return useMemo<CommandDef[]>(() => {
    /* Sources stopped being a screen of its own and became a tab under
       knowledge, so it is no longer in SCREENS. It is still a destination, not
       an action — hence the "screens" group, listed right below the screen that
       now hosts it. */
    const sources: CommandDef = {
      id: 'screen:knowledge-sources',
      group: 'screens',
      labelKey: 'palette.screen.sources',
      icon: 'download',
      run: () => void navigate('/knowledge?tab=sources'),
    };
    /* Same story for the agent sessions since story 008: they stopped being a
       screen of their own and hang under projects (`/projects/sessions`), so
       they are not in SCREENS either. Still a destination — hence the
       "screens" group, listed right below the screen that now hosts them. */
    const agentSessions: CommandDef = {
      id: 'screen:project-sessions',
      group: 'screens',
      labelKey: 'palette.screen.agentSessions',
      icon: 'workflow',
      run: () => void navigate('/projects/sessions'),
    };
    /* Inbox stopped being a screen of its own (story 006): it is now the
       unfiled filter on Notes, not tied to one SCREENS entry the rail entry
       used to point at. Still a destination — the icon that used to live on
       the rail now shows up here instead. */
    const unfiled: CommandDef = {
      id: 'screen:unfiled',
      group: 'screens',
      labelKey: 'palette.screen.unfiled',
      icon: 'inbox',
      run: () => void navigate('/notes?filter=unfiled'),
    };
    const screens: CommandDef[] = SCREENS.flatMap((screen) => {
      const entry: CommandDef = {
        id: `screen:${screen.id}`,
        group: 'screens',
        labelKey: screen.labelKey,
        icon: screen.icon,
        run: () => void navigate(screen.path),
      };
      if (screen.id === 'knowledge') return [entry, sources];
      if (screen.id === 'projects') return [entry, agentSessions];
      return [entry];
    });
    const actions: CommandDef[] = [
      {
        id: 'action:capture',
        group: 'actions',
        labelKey: 'palette.action.capture',
        icon: 'zap',
        /* Capturing happens in the shell now: the overlay lies over the screen
           the user came from, instead of taking over a second window. */
        run: () => overlays.openCapture(),
      },
      {
        id: 'action:captureWindow',
        group: 'actions',
        labelKey: 'palette.action.captureWindow',
        icon: 'external-link',
        /* The separate window stays reachable — it is the only way to capture
           without the whole app having to come to the front. */
        run: () => void api.capture.window(true).catch(() => undefined),
      },
      {
        id: 'action:ask',
        group: 'actions',
        labelKey: 'palette.action.ask',
        icon: 'message-square',
        /* Listed in KEEP_OPEN over there: it changes the palette, it does not
           leave it. */
        run: onAsk,
      },
    ];
    return [...screens, unfiled, ...actions, ...registered];
  }, [navigate, onAsk, overlays, registered]);
}
