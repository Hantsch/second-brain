/* A verification run stays off the desktop and out of the keyboard focus
 * (ui-verify, "An invisible run"; src/main/window-shared.ts). This spec is the
 * regression that would otherwise surface as a window in the developer's face
 * or as blank screenshots: every window — the main one and quick capture —
 * lies outside every display, never holds the focus, is shown and keeps
 * painting.
 *
 * With `SB_UI_VISIBLE=1` (the debugging opt-out) the windows are on screen on
 * purpose; only the bounds check is skipped then, the rest still holds.
 */

import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

test.use({ specId: 'harness-offscreen' });

const VISIBLE_OPT_OUT = process.env['SB_UI_VISIBLE'] === '1';

interface WindowFacts {
  onAnyDisplay: boolean;
  focused: boolean;
  visible: boolean;
}

function windowFacts(app: ElectronApplication, id: number): Promise<WindowFacts | null> {
  return app.evaluate(({ BrowserWindow, screen }, windowId) => {
    const window = BrowserWindow.fromId(windowId);
    if (!window || window.isDestroyed()) return null;
    const bounds = window.getBounds();
    const onAnyDisplay = screen.getAllDisplays().some(({ bounds: display }) => {
      const overlapX = bounds.x < display.x + display.width && bounds.x + bounds.width > display.x;
      const overlapY =
        bounds.y < display.y + display.height && bounds.y + bounds.height > display.y;
      return overlapX && overlapY;
    });
    return { onAnyDisplay, focused: window.isFocused(), visible: window.isVisible() };
  }, id);
}

/** Ten animation frames within two seconds — a window that stopped painting never gets there.
 * A string, like the other specs' renderer-side calls: the e2e tsconfig has no DOM lib. */
function paintsFrames(page: Page): Promise<boolean> {
  return page.evaluate(`new Promise((resolve) => {
    let frames = 0;
    const timeout = setTimeout(() => resolve(false), 2000);
    const tick = () => {
      frames += 1;
      if (frames >= 10) {
        clearTimeout(timeout);
        resolve(true);
      } else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })`);
}

async function expectInvisibleRun(app: ElectronApplication, id: number, page: Page): Promise<void> {
  await expect.poll(async () => (await windowFacts(app, id))?.visible).toBe(true);
  const facts = await windowFacts(app, id);
  if (!VISIBLE_OPT_OUT) expect(facts?.onAnyDisplay, 'window intersects a display').toBe(false);
  expect(facts?.focused, 'window holds the keyboard focus').toBe(false);
  expect(await paintsFrames(page), 'window stopped painting').toBe(true);
}

test('a verification run keeps every window off the desktop, unfocused and painting', async ({
  app,
}) => {
  await test.step('invisible run — the main window is offscreen, unfocused and paints', async () => {
    const id = app.mainWindowId;
    if (id === undefined) throw new Error('no main window id from the harness');
    await expectInvisibleRun(app.app, id, app.page);
  });

  await test.step('invisible run — quick capture is offscreen, unfocused and paints', async () => {
    const [captureWindow] = await Promise.all([
      app.app.waitForEvent('window'),
      app.page.evaluate("window.sb.invoke('capture:window', { show: true })"),
    ]);
    await captureWindow.waitForLoadState('domcontentloaded');
    const id = await app.app.evaluate(
      ({ BrowserWindow }, mainId) =>
        BrowserWindow.getAllWindows().find((window) => window.id !== mainId)?.id,
      app.mainWindowId,
    );
    if (id === undefined) throw new Error('quick capture window did not open');
    await expectInvisibleRun(app.app, id, captureWindow);
    await app.page.evaluate("window.sb.invoke('capture:window', { show: false })");
  });
});
