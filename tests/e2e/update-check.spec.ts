/* The update check as a user meets it: a startup check that fails stays silent,
   and the About panel reports on request. Outcomes are scripted through
   SB_E2E_UPDATE_FIXTURE — no request leaves the app. The three tests share one
   app and run in order: the startup check consumes outcome 1, "Check now"
   outcomes 2 and 3. */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

test.use({ specId: 'update-check', updateFixture: 'offline,offline,available' });
test.describe.configure({ mode: 'serial' });

const STATUS = '[data-testid="update-status"]';

async function openAbout(page: Page): Promise<void> {
  await page.evaluate('location.hash = "#/settings?tab=about"');
  await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
}

test('a failed startup check shows nothing by itself', async ({ app }) => {
  const { page } = app;
  await test.step('open the About panel after the startup check has fired', async () => {
    /* The startup check fires a few seconds after start; boot the window quietly
       past that point before asserting anything is absent. */
    await openAbout(page);
    await expect(page.locator(STATUS)).not.toHaveText('Not checked yet.', { timeout: 15_000 });
  });
  await test.step('nothing announced the failure by itself', async () => {
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.sb-toast, [data-toast]')).toHaveCount(0);
  });
  await test.step('the panel, opened on purpose, carries the failure', async () => {
    await expect(page.locator(STATUS)).toContainText('Check failed');
  });
});

test('check now reports a failure reason', async ({ app }) => {
  const { page } = app;
  await test.step('open the About panel and run a check', async () => {
    await openAbout(page);
    await page.getByRole('button', { name: 'Check now' }).click();
  });
  await test.step('the panel names the failure reason', async () => {
    await expect(page.locator(STATUS)).toHaveText(
      'Check failed: The release server could not be reached.',
    );
  });
});

test('check now finds the release and names its version', async ({ app }) => {
  const { page } = app;
  await test.step('open the About panel and run a check', async () => {
    await openAbout(page);
    await page.getByRole('button', { name: 'Check now' }).click();
  });
  await test.step('the panel names the available version', async () => {
    await expect(page.locator(STATUS)).toHaveText('Version 99.0.0 is available.');
    await expect(page.locator('[data-testid="update-version"]')).toHaveText('99.0.0');
  });
});
