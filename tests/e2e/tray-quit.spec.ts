/* Quitting from the tray ends the app, so this test owns its app: every other
 * tray test would otherwise share a process that is gone after it. */

import { test } from './fixtures/app';
import { clickTrayItem } from './fixtures/tray';

test.use({ specId: 'tray-quit' });

test('quit from the tray ends the app', async ({ app }) => {
  const exited = app.app.waitForEvent('close');

  await test.step('click the tray item "quit"', async () => {
    /* Deferred: nothing is running, so this quit is not vetoed and the process
       ends — the evaluate has to return before it does. */
    await clickTrayItem(app, 'quit', { deferred: true });
  });

  await test.step('the app process ends', async () => {
    await exited;
  });
});
