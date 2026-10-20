/* A portable build cannot update itself: the offer leads to the release page and
   nothing is downloaded. `shell.openExternal` is stubbed so no browser opens. */

import { expect, test } from './fixtures/app';

const VERSION = '99.0.0';

test.use({
  specId: 'update-portable',
  updateFixture: {
    distribution: 'portable',
    latest: { version: VERSION, notes: '### Added\n- Fixture release' },
    download: { ticks: 5, tickMs: 200, outcome: 'ok' },
  },
});

test('the portable build opens the release page and downloads nothing', async ({ app }) => {
  const { page } = app;
  await app.app.evaluate(({ shell }) => {
    const store = globalThis as typeof globalThis & { sbOpenedUrls?: string[] };
    store.sbOpenedUrls = [];
    shell.openExternal = (url: string) => {
      store.sbOpenedUrls?.push(url);
      return Promise.resolve();
    };
  });

  await page.evaluate("window.sb.invoke('update:check')");
  await page.locator('[data-testid="update-control"]').click();
  await expect(page.getByRole('button', { name: 'Download update' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open release page' }).click();

  await expect
    .poll(() =>
      app.app.evaluate(
        () => (globalThis as typeof globalThis & { sbOpenedUrls?: string[] }).sbOpenedUrls,
      ),
    )
    .toEqual([`https://github.com/Hantsch/second-brain/releases/tag/v${VERSION}`]);

  await expect(page.getByRole('progressbar')).toHaveCount(0);
  const state = (await page.evaluate("window.sb.invoke('update:state')")) as { phase: string };
  expect(state.phase).toBe('available');
});
