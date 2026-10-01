/* Proves 072/AC9: a maintenance run reads the same in `RunStrip` (mounted
   once in `AppShell`, visible on every route) and in the tasks screen's
   running group (the `maintenanceTaskRow` pseudo-row from `tasks-view.ts`).
   Both read the very same `gardener-progress.ts` snapshot — this spec is
   what actually walks the app to both surfaces and checks the numbers agree.

   Mirrors `gardener-run-cross-screen.spec.ts`'s seam: no model is configured
   in this harness (fixtures/app.ts), so the stage plan is just the ten
   mechanical checks, and `SB_E2E_STAGE_DELAY_MS` (066, D4) pauses between
   them so the run stays observable long enough to visit a second screen. */

import { expect, test } from './fixtures/app';

test.use({ specId: 'tasks-runstrip', stageDelayMs: 300 });

test('a maintenance run shows the same progress in the run strip and on the tasks screen', async ({
  app,
}) => {
  const { page } = app;

  await test.step('start a run on the garden screen', async () => {
    await page.locator('.sb-rail a[href="#/garden"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/garden');
    await page
      .getByRole('button', { name: /^Check (now|again)$/ })
      .first()
      .click();
    await expect(page.getByRole('progressbar', { name: 'Check running' })).toBeVisible();
  });

  await test.step('open the tasks screen while the run keeps going', async () => {
    await page.locator('.sb-rail a[href="#/tasks"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/tasks');
    await expect(page.getByRole('heading', { name: 'Running' })).toBeVisible();
  });

  await test.step('the strip stays one line and the screen keeps the window', async () => {
    /* Regression: `.sb-app` had two grid rows, so a mounted strip took the
       `1fr` row, grew to most of the window and pushed the screen below it. */
    const strip = await page.locator('.sb-runstrip').boundingBox();
    const body = await page.locator('.sb-body').boundingBox();
    // A string, not a function: tsconfig.node.json has no DOM library.
    const windowHeight = (await page.evaluate('window.innerHeight')) as number;
    expect(strip).not.toBeNull();
    expect(body).not.toBeNull();
    if (strip === null || body === null) return;
    expect(strip.height).toBeLessThan(120);
    // Sub-pixel layout under display scaling: equal to the pixel, not to the bit.
    expect(body.y).toBeCloseTo(strip.y + strip.height, 0);
    expect(body.y + body.height).toBeCloseTo(windowHeight, 0);
  });

  const runStripBar = page.getByRole('progressbar', { name: 'Check running' });
  const taskRowBar = page.locator('.sb-trow-track[role="progressbar"]');

  await test.step('the maintenance row is present, read-only, and agrees with the strip', async () => {
    await expect(taskRowBar).toBeVisible();
    /* Read-only here (072's decision): a stopped gardener run has no finished
       record until story 074, so the row offers no stop action of its own —
       the gardener's own control stays in the strip, already visible above. */
    await expect(page.locator('.sb-trow').getByRole('button', { name: 'Stop' })).toHaveCount(0);

    /* Both bars are driven by the same `gardener-progress.ts` snapshot, so a
       read right after the heading above appeared must already agree — this
       is not two independent polls that could catch two different ticks. */
    const stripPercent = await runStripBar.getAttribute('aria-valuenow');
    const rowPercent = await taskRowBar.getAttribute('aria-valuenow');
    expect(rowPercent).toBe(stripPercent);
  });

  await test.step('progress advances, and the two surfaces keep agreeing', async () => {
    const before = await taskRowBar.getAttribute('aria-valuenow');
    await expect.poll(async () => taskRowBar.getAttribute('aria-valuenow')).not.toBe(before);
    const stripPercent = await runStripBar.getAttribute('aria-valuenow');
    const rowPercent = await taskRowBar.getAttribute('aria-valuenow');
    expect(rowPercent).toBe(stripPercent);
  });

  await test.step('cancel from the run strip — both surfaces show the run has ended', async () => {
    await page.getByRole('button', { name: 'Cancel check' }).click();
    await expect(runStripBar).toBeHidden();
    await expect(taskRowBar).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Running' })).toBeHidden();
  });
});
