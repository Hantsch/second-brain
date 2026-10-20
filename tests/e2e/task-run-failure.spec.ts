/* AC8: a run that fails says why — in the panel it was started from, and on
 * the tasks screen, and it never gets stuck showing "running".
 *
 * `failEverything` makes the offline `fake` provider (073, D1) throw for every
 * call, so the condensation fails inside the queued task rather than while
 * being queued: the two are different failures on purpose (a run that cannot
 * even be queued — no model routed — is the dead end AC7 covers, and it never
 * creates a task). The sentence below is what has to survive the whole way
 * from the provider to the panel, so it is asserted as itself, not as a code.
 */

import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

const REASON = 'The model refused this request.';

test.use({ specId: 'task-run-failure', fakeProvider: { failEverything: REASON } });

const AREA = { slug: 'gesundheit', title: 'Gesundheit' };

function areaPanel(page: Page, title: string): Locator {
  return page
    .locator('.sb-panel')
    .filter({ has: page.locator('.sb-panel-title', { hasText: title }) });
}

function rowsFor(page: Page, label: string): Locator {
  return page
    .locator('.sb-trow')
    .filter({ has: page.locator('.sb-trow-subject', { hasText: label }) });
}

function groupPanel(page: Page, heading: string): Locator {
  return page
    .locator('.sb-panel')
    .filter({ has: page.locator('.sb-panel-title', { hasText: heading }) });
}

test('a failed condensation states its reason in the panel and in the task list', async ({
  app,
}) => {
  const { page } = app;

  await test.step('failure — start a condensation that the model refuses', async () => {
    await page.evaluate(`location.hash = "#/notes?a=${AREA.slug}&tab=condensed"`);
    const panel = areaPanel(page, AREA.title);
    await panel.getByRole('button', { name: 'Condense again' }).click();
  });

  await test.step('failure — the panel names the reason where the run was started', async () => {
    const panel = areaPanel(page, AREA.title);
    await expect(panel.getByText(REASON)).toBeVisible({ timeout: 30_000 });
    /* Not a panel stuck mid-run, and not a blank one: the trigger is back. */
    await expect(panel.getByText('Condensation running')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Condense again' })).toBeEnabled();
  });

  await test.step('failure — the tasks screen files the same run as failed', async () => {
    await page.locator('.sb-rail a[href="#/tasks"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/tasks');
    const row = rowsFor(page, AREA.slug);
    await expect(row).toHaveCount(1);
    await expect(row.getByText('Failed')).toBeVisible();
    /* Under "Finished", not swallowed and not still counted as running. */
    await expect(groupPanel(page, 'Finished').locator('.sb-trow-subject')).toHaveText(AREA.slug);
  });
});
