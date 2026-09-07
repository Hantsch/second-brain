/* Proves 074/AC1 and AC6 through the real app: a maintenance run is one task
   in the one work queue, and it reads the same everywhere at the same time.

   Since D2 the run is a real `WorkTask` in the shared registry, and since D5
   `gardener-progress.ts` derives its snapshot from exactly that task instead
   of from a channel of its own. That closes the old "two answers" seam — and
   opens a new way to get it wrong, which is what this spec is aimed at: the
   one run now reaches the tasks screen twice (as the registry task, and as the
   synthetic maintenance row built from its snapshot), so the screen and the
   rail badge must still show it exactly once. A count, not just a presence
   check, is what makes that provable.

   `tasks-runstrip.spec.ts` walks the same two surfaces for 072's AC9 (the
   percent agreeing). This spec adds what only became true with 074: the run
   counted once despite arriving twice, and a record left behind in the
   finished group once it has ended — under 072 a stopped run left nothing at
   all.

   No model is configured in this harness (fixtures/app.ts), so the stage plan
   is just the ten mechanical checks — normally over before a spec could visit
   a second screen. `SB_E2E_STAGE_DELAY_MS` (066, D4) pauses between them, via
   `test.use({ stageDelayMs })` on the worker-scoped `app` fixture, so the run
   stays observable. */

import { expect, test } from './fixtures/app';

test.use({ specId: 'maintenance-task-visible', stageDelayMs: 300 });

test('a running maintenance pass is one task: same percent in the strip and on the tasks screen, counted once', async ({
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

  const runningPanel = page
    .locator('.sb-panel')
    .filter({ has: page.getByRole('heading', { name: 'Running' }) });

  /* Both bars read in one turn of the page's own JavaScript, so the two values
     can only come from the same render — two separate round-trips could catch
     two different ticks and prove nothing about them agreeing. Passed as a
     string, the way every other spec here reaches into the page: this file is
     typechecked by tsconfig.node.json, which has no DOM library, so a function
     body mentioning `document` would not compile.

     `.sb-runstrip-track` is `RunStrip`'s bar, `.sb-trow-track` the tasks
     screen's row — the two surfaces AC6 is about. */
  const percentsAtOneInstant = async (): Promise<{ strip: string | null; row: string | null }> =>
    (await page.evaluate(
      `({
         strip: document.querySelector('.sb-runstrip-track[role="progressbar"]')?.getAttribute('aria-valuenow') ?? null,
         row: document.querySelector('.sb-trow-track[role="progressbar"]')?.getAttribute('aria-valuenow') ?? null,
       })`,
    )) as { strip: string | null; row: string | null };

  await test.step('the run shows up once, and both surfaces show the same percent', async () => {
    /* One row, and the group's own count says one too. Before D5's filter the
       registry task and the synthetic row would both be here — the same run,
       listed twice, under two different labels. */
    await expect(runningPanel.locator('.sb-trow')).toHaveCount(1);
    await expect(runningPanel.locator('.sb-panel-meta')).toHaveText('1');

    const percents = await percentsAtOneInstant();
    expect(percents.strip).not.toBeNull();
    expect(percents.row).toBe(percents.strip);
  });

  await test.step('the rail badge counts that one run once', async () => {
    await expect(page.locator('.sb-rail a[href="#/tasks"] .sb-rail-count')).toHaveText('1');
  });

  await test.step('progress advances, and the two surfaces keep agreeing', async () => {
    const before = (await percentsAtOneInstant()).row;
    await expect.poll(async () => (await percentsAtOneInstant()).row).not.toBe(before);

    const percents = await percentsAtOneInstant();
    expect(percents.row).toBe(percents.strip);
  });

  await test.step('stopping the run leaves one settled record behind', async () => {
    await page.getByRole('button', { name: 'Cancel check' }).click();

    /* Gone from both surfaces as a running thing... */
    await expect(page.getByRole('progressbar', { name: 'Check running' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Running' })).toBeHidden();

    /* ...and present as a record of a run that happened: the registry task
       itself, which is what 074 added — under 072 a stopped maintenance run
       left nothing on this screen at all. */
    const finishedPanel = page
      .locator('.sb-panel')
      .filter({ has: page.getByRole('heading', { name: 'Finished' }) });
    await expect(finishedPanel.getByText('Maintenance run')).toHaveCount(1);
    await expect(page.locator('.sb-rail a[href="#/tasks"] .sb-rail-count')).toHaveCount(0);
  });
});
