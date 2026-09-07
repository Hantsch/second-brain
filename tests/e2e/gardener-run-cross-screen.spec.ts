/* Proves 042/AC5: a maintenance run started on the garden screen keeps
   running — and stays controllable — once the user has navigated away from
   it. `RunStrip` (src/renderer/components/RunStrip.tsx) is mounted once in
   `AppShell`, not on the garden screen itself, specifically so this holds;
   this spec is what actually walks the app across a navigation and checks it.

   No model is configured in this harness (fixtures/app.ts), so the stage plan
   is just the ten mechanical checks (see `gardener-run.ts`) — normally over
   before a spec could ever navigate away and back. `SB_E2E_STAGE_DELAY_MS`
   (066, D4) pauses between checks so the run stays observable; this spec is
   the one place in the suite that opts into it, via `test.use({ stageDelayMs
   })` on the worker-scoped `app` fixture (fixtures/app.ts) — the fixture
   itself defaults it to 0 (no delay, no env var) everywhere else. */

import { expect, test } from './fixtures/app';

test.use({ specId: 'gardener-run-cross-screen', stageDelayMs: 300 });

test('a run started in the garden stays visible on another screen and can be stopped there', async ({
  app,
}) => {
  const { page } = app;

  await test.step('cross-screen run — start a run on the garden screen', async () => {
    await page.locator('.sb-rail a[href="#/garden"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/garden');
    /* Two identical "Check now" actions exist before a first report: the
       header's own button and the empty state's — `.first()` is enough since
       both fire the same `start()` mutation. */
    await page
      .getByRole('button', { name: /^Check (now|again)$/ })
      .first()
      .click();
    /* The strip only renders once the first progress event lands — waiting for
       it here (still on /garden) keeps the next step's navigation from racing
       the run's very first tick. */
    await expect(page.getByRole('progressbar', { name: 'Check running' })).toBeVisible();
  });

  const stepText = page.locator('.sb-runstrip-text > span.sb-mono:not(.sb-runstrip-elapsed)');
  const firstStep = await stepText.textContent();

  await test.step('cross-screen run — navigate to another screen', async () => {
    await page.locator('.sb-rail a[href="#/dashboard"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/dashboard');
  });

  await test.step('cross-screen run — still visible and progressing on the other screen', async () => {
    await expect(page.getByRole('progressbar', { name: 'Check running' })).toBeVisible();
    await expect(
      page.getByRole('status').filter({ has: page.locator('.sb-runstrip-track') }),
    ).toBeVisible();
    /* Progress advancing, not just present: the step count ("N of 10") moves
       on from what it was before the navigation. Playwright's own polling
       retries this until it's true (or times out) — never a fixed sleep. */
    await expect.poll(() => stepText.textContent()).not.toBe(firstStep);
  });

  await test.step('cross-screen run — cancel from the other screen', async () => {
    await page.getByRole('button', { name: 'Cancel check' }).click();
  });

  await test.step('cross-screen run — the run has ended', async () => {
    await expect(page.getByRole('progressbar', { name: 'Check running' })).toBeHidden();
    /* Cancelling from off-screen leaves the "stopped partway" offer behind
       (RunStrip.tsx) rather than the strip vanishing outright — the run has
       demonstrably ended either way, since the progress bar and its "Cancel
       check" action are gone. */
    await expect(page.getByRole('button', { name: 'Cancel check' })).toBeHidden();
  });
});
