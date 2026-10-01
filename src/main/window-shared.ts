/* What every BrowserWindow shares: the secure renderer preferences and the
   verification-run flags (ui-verify, "An invisible run").

   A UI verification run (`npm run shot`, `npm run a11y`, `npm run test:e2e`)
   sets `SB_UI_HARNESS=1`. Its windows then stay off the desktop and out of the
   keyboard focus, so the developer can keep working while a run goes. Every
   window takes these flags from here — the one that forgot is the one that
   pops up. Without the variable every launch is unchanged.

   `SB_UI_VISIBLE=1` puts a harness window back on screen for debugging; it
   stays unfocusable either way. */

import { app, screen } from 'electron';
import type { BrowserWindow, WebPreferences } from 'electron';
import { preloadPath } from './renderer-entry';

export const HARNESS = process.env['SB_UI_HARNESS'] === '1';
export const OFFSCREEN = HARNESS && process.env['SB_UI_VISIBLE'] !== '1';

/** Gap between the offscreen window's right edge and the leftmost display. */
export const OFFSCREEN_MARGIN = 100;

/**
 * Must run at module load, before `ready`: Windows occlusion tracking treats a
 * window left of every display as hidden and stops painting it, which stalls
 * every screenshot.
 */
export function applyHarnessSwitches(): void {
  if (OFFSCREEN) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

/** Left of every display, at the window's own size — the layout stays the one that ships. */
export function offscreenPosition(width: number): { x: number; y: number } {
  const left = Math.min(...screen.getAllDisplays().map((display) => display.bounds.x));
  return { x: left - width - OFFSCREEN_MARGIN, y: 0 };
}

/**
 * Re-places a window left of every display from the size it actually has. On a
 * mixed-DPI desktop a window offscreen comes out larger than asked (measured:
 * 560 → 787 px wide), so a position derived from the requested width would let
 * its right edge reach back onto the leftmost display. The move itself can
 * rescale the window again, hence the few rounds.
 */
export function keepOffscreen(window: BrowserWindow): void {
  if (!OFFSCREEN) return;
  for (let round = 0; round < 3; round += 1) {
    const [width = 0] = window.getSize();
    const target = offscreenPosition(width);
    const [x = 0] = window.getPosition();
    if (x === target.x) return;
    window.setPosition(target.x, target.y);
  }
}

/** Constructor options a harness window needs on top of its own. */
export function harnessWindowOptions(): { focusable?: boolean } {
  /* `focusable: false` also keeps the window off the Windows taskbar. */
  return HARNESS ? { focusable: false } : {};
}

export function rendererWebPreferences(): WebPreferences {
  return {
    preload: preloadPath(),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webviewTag: false,
    spellcheck: false,
    /* A window nobody can see would otherwise be throttled and paint unreliably. */
    ...(OFFSCREEN ? { backgroundThrottling: false } : {}),
  };
}

/**
 * Shows a window and brings it forward — except under the harness, where it is
 * painted without asking for activation. `focusable: false` alone would leave
 * Electron requesting a focus the window then refuses.
 */
export function revealWindow(window: BrowserWindow): void {
  if (HARNESS) {
    keepOffscreen(window);
    window.showInactive();
    return;
  }
  window.show();
  window.focus();
}
