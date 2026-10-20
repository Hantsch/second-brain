/* The single source of truth for "which navigation stays inside the app, which
   goes to the browser, and which is refused outright". `navigationVerdict` is
   pure — no Electron import — so the three cases can be unit-tested directly;
   `attachNavigationGuards` is the Electron-facing wiring that acts on it. */

import { dirname } from 'node:path';
import { shell } from 'electron';
import type { BrowserWindow } from 'electron';

/** Schemes that leave the app for the user's browser/mail client. Also the
    allowlist `shell:openExternal` checks against (src/main/ipc/shell.ts) —
    one list, so the two can never drift apart. */
export const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** The app's own entry pages. Any other `file://` path is refused, even one
    that happens to live inside the app's install directory. */
const APP_ENTRY_PAGES = new Set(['index.html', 'quick-capture.html']);

export type NavigationVerdict = 'allow' | 'external' | 'block';

/**
 * Decides what to do with a navigation attempt (`will-navigate` target or a
 * `window.open()` target), given the page it originates from.
 *
 * - `'allow'`: a `file://` URL naming an app entry page in the same directory
 *   as the current page, or (dev server) same-origin as the current page.
 * - `'external'`: protocol is in `EXTERNAL_PROTOCOLS` — handed to the browser.
 * - `'block'`: everything else — any other `file://` path, any other scheme
 *   (ftp:, javascript:, data:, ...).
 */
export function navigationVerdict(url: string, currentUrl: string): NavigationVerdict {
  let target: URL;
  let current: URL;
  try {
    target = new URL(url);
    current = new URL(currentUrl);
  } catch {
    return 'block';
  }

  if (target.protocol === 'file:') {
    if (current.protocol !== 'file:') return 'block';
    const fileName = target.pathname.split('/').pop() ?? '';
    const sameHost = target.host === current.host;
    const sameDirectory = dirname(target.pathname) === dirname(current.pathname);
    return sameHost && sameDirectory && APP_ENTRY_PAGES.has(fileName) ? 'allow' : 'block';
  }

  /* Dev-server mode: the renderer is served from http://localhost:<port>, not
     from disk. Same-origin navigation there is the equivalent of "own entry
     page" above — checked before the external-protocol case below, since
     both use http(s). Opaque origins (javascript:, data:, about:blank) all
     report the literal origin "null" and must never match each other. */
  if (current.protocol !== 'file:' && target.origin === current.origin && target.origin !== 'null')
    return 'allow';

  if (EXTERNAL_PROTOCOLS.has(target.protocol)) return 'external';

  return 'block';
}

/** Kein Fenster, das die App nicht selbst geöffnet hat; Links gehen in den
    Browser, alles andere wird verworfen. */
export function attachNavigationGuards(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    const verdict = navigationVerdict(url, window.webContents.getURL());
    if (verdict === 'external') void shell.openExternal(url);
    else if (verdict === 'block') console.warn(`blocked window-open to ${url}`);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const verdict = navigationVerdict(url, window.webContents.getURL());
    if (verdict === 'allow') return;
    event.preventDefault();
    if (verdict === 'external') void shell.openExternal(url);
    else console.warn(`blocked navigation to ${url}`);
  });
}
