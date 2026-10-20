/* Story 072, D1: the place and an honest empty screen. Proves what the unit
   tests can't — that the real rail, built off the real app, answers a click
   and a keyboard activation, sits where the story says, carries no badge,
   and that the screen itself says plainly that nothing has ever started.

   No IPC channel or task data source exists yet (that's D2/D3) — this spec
   only proves the shell, against the same throwaway vault every other e2e
   spec uses (see fixtures/app.ts). */

import { expect, test } from './fixtures/app';

test.use({ specId: 'tasks-screen' });

test('the rail opens tasks directly above maintenance, by click and by key', async ({ app }) => {
  const { page } = app;

  await test.step('by click', async () => {
    const tasksLink = page.locator('.sb-rail a[href="#/tasks"]');
    await expect(tasksLink).toBeVisible();
    await tasksLink.click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/tasks');
    await expect(page.locator('.sb-screen h1').first()).toHaveText('Tasks');
  });

  await test.step('directly above maintenance', async () => {
    /* Same rail-foot list as garden — adjacency is a DOM fact, not a claim
       about the fixture's screen list. */
    const systemItems = await page.locator('.sb-rail-foot .sb-rail-item').all();
    const hrefs = await Promise.all(systemItems.map((item) => item.getAttribute('href')));
    const tasksIndex = hrefs.indexOf('#/tasks');
    expect(tasksIndex).toBeGreaterThanOrEqual(0);
    expect(hrefs[tasksIndex + 1]).toBe('#/garden');
  });

  await test.step('by keyboard', async () => {
    /* Navigate elsewhere first so the click above doesn't make this a no-op. */
    await page.locator('.sb-rail a[href="#/dashboard"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/dashboard');

    const tasksLink = page.locator('.sb-rail a[href="#/tasks"]');
    await tasksLink.focus();
    await expect(tasksLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/tasks');
  });
});

test('with nothing started the rail carries no badge', async ({ app }) => {
  const { page } = app;

  await test.step('no badge on the tasks entry', async () => {
    const tasksLink = page.locator('.sb-rail a[href="#/tasks"]');
    await expect(tasksLink).toBeVisible();
    await expect(tasksLink.locator('.sb-rail-count')).toHaveCount(0);
  });
});

test('with nothing ever started the screen says so', async ({ app }) => {
  const { page } = app;

  await test.step('the empty state, no spinner and no action', async () => {
    await page.locator('.sb-rail a[href="#/tasks"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/tasks');

    /* No spinner, no skeleton — D1 has nothing to load, so the empty state
       is the first and only thing that ever renders here. */
    await expect(page.locator('.sb-skeleton')).toHaveCount(0);
    await expect(page.locator('.sb-empty-title')).toHaveText('No task in sight yet');
    await expect(page.locator('.sb-empty-body')).toBeVisible();
    /* AC7's decision: no action button in the empty state. */
    await expect(page.locator('.sb-empty-card button')).toHaveCount(0);
  });
});
