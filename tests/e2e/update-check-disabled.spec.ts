/* Without the fixture the e2e app is an unpackaged demo build: it never checks,
   and the panel says so. The suite-wide network guard stays active, so a check
   that reached the network would fail this test. The startup timer itself is
   proven by tests/main/update/service.test.ts ("no check runs, automatic or
   manual, when the build is unpackaged or in demo mode"); this spec proves the
   built app's gate by calling the same check() entry point and reading state. */

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
  await test.step('a check through the same gate as the startup check leaves the state untouched', async () => {
    const idle = {
      supported: false,
      disabledReason: 'unpackaged',
      status: 'idle',
      lastCheckedAt: null,
      update: null,
    };
    expect(await page.evaluate("window.sb.invoke('update:check')")).toMatchObject(idle);
    expect(await page.evaluate("window.sb.invoke('update:state')")).toMatchObject(idle);
    await expect(page.locator('[data-testid="update-status"]')).toContainText(
      'Update checks are off in this build',
    );
  });
});
