/* Without the fixture the e2e app is an unpackaged demo build: it never checks,
   and the panel says so. The suite-wide network guard stays active, so a check
   that reached the network would fail this test. */

import { expect, test } from './fixtures/app';

test.use({ specId: 'update-check-disabled' });

test('an unpackaged demo build never checks and says so', async ({ app }) => {
  const { page } = app;
  await test.step('the About panel says checks are off and disables the button', async () => {
    await page.evaluate('location.hash = "#/settings?tab=about"');
    await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
    await expect(page.locator('[data-testid="update-status"]')).toContainText(
      'Update checks are off in this build',
    );
    await expect(page.getByRole('button', { name: 'Check now' })).toBeDisabled();
  });
  await test.step('it still says so past the point a startup check would fire', async () => {
    await page.waitForTimeout(4000);
    await expect(page.locator('[data-testid="update-status"]')).toContainText(
      'Update checks are off in this build',
    );
  });
});
