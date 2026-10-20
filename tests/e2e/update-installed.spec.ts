/* The update flow as an installed build's user meets it, scripted end to end
   through the file-mode SB_E2E_UPDATE_FIXTURE: no request leaves the app and
   nothing is ever really installed (the fake backend only records the call).

   One app serves every test, in order. An offer's download stage belongs to one
   version, so each test offers its own version and never inherits a stage from
   the one before. "Not now" is process-wide, which is why dismissing comes last. */

import type { Page } from '@playwright/test';
import type { UpdateFileFixture } from '../../src/main/update/e2e-fixture';
import { expect, test } from './fixtures/app';

const FAKE_REPLY = 'The fake model answers slowly.';

test.use({
  specId: 'update-installed',
  stageDelayMs: 4000,
  fakeProvider: { replies: { 'answer-question': FAKE_REPLY }, latencyMs: 8000 },
  updateFixture: {
    distribution: 'installed',
    latest: null,
    download: { ticks: 5, tickMs: 300, outcome: 'ok' },
  },
});
test.describe.configure({ mode: 'serial' });

const CONTROL = '[data-testid="update-control"]';
const INSTALL = 'Restart and install';

function fixture(
  version: string | null,
  download: Partial<UpdateFileFixture['download']> = {},
): UpdateFileFixture {
  return {
    distribution: 'installed',
    latest: version === null ? null : { version, notes: '### Added\n- Fixture release' },
    download: { ticks: 5, tickMs: 300, outcome: 'ok', ...download },
  };
}

/** A manual check, the same call "Check now" in Settings makes. */
async function checkNow(page: Page): Promise<void> {
  await page.evaluate("window.sb.invoke('update:check')");
}

async function installCalls(app: { evaluate: <R>(fn: () => R) => Promise<R> }): Promise<unknown[]> {
  const calls = await app.evaluate(
    () =>
      (globalThis as typeof globalThis & { sbUpdateInstallCalls?: unknown[] }).sbUpdateInstallCalls,
  );
  return calls ?? [];
}

/* The startup maintenance run is a real task and would (rightly) block every
   install; stop it once so later tests start from an idle queue. */
async function stopStartupRun(page: Page): Promise<void> {
  const tasks = (): Promise<{ id: string; state: string }[]> =>
    page.evaluate("window.sb.invoke('work:list')") as Promise<{ id: string; state: string }[]>;
  await expect.poll(async () => (await tasks()).length, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.evaluate("window.sb.invoke('gardener:cancel')");
  await expect
    .poll(async () => (await tasks()).filter((task) => task.state === 'running').length)
    .toBe(0);
}

async function openDialog(page: Page): Promise<void> {
  if (!(await page.getByRole('dialog').isVisible())) await page.locator(CONTROL).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function closeDialog(page: Page): Promise<void> {
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function download(page: Page): Promise<void> {
  await openDialog(page);
  await page.getByRole('button', { name: 'Download update' }).click();
}

test('no control while up to date; the control appears once an update is available', async ({
  app,
  writeUpdateFixture,
}) => {
  const { page } = app;
  await stopStartupRun(page);
  await checkNow(page);
  await expect(page.locator('.sb-rail')).toBeVisible();
  await expect(page.locator(CONTROL)).toHaveCount(0);

  writeUpdateFixture(fixture('99.1.0'));
  await checkNow(page);
  await expect(page.locator(CONTROL)).toBeVisible();
});

test('the control names the version and links to what changed', async ({ app }) => {
  const { page } = app;
  await expect(page.locator(CONTROL)).toContainText('99.1.0');
  await openDialog(page);
  await page.getByRole('button', { name: 'What changed' }).click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/settings?tab=about');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('the download shows progress and Gaston stays usable', async ({ app, writeUpdateFixture }) => {
  const { page } = app;
  writeUpdateFixture(fixture('99.2.0', { ticks: 10, tickMs: 500 }));
  await checkNow(page);
  await download(page);
  const bar = page.getByRole('progressbar', { name: 'Downloading update' });
  await expect(bar).toBeVisible();
  const sample = async (): Promise<number> => Number(await bar.getAttribute('aria-valuenow'));
  await expect.poll(sample).toBeGreaterThanOrEqual(0);
  const first = await sample();
  await expect.poll(sample, { timeout: 4000 }).toBeGreaterThan(first);
  await closeDialog(page);

  await page.locator('.sb-rail a[href="#/tasks"]').click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();
  await page.locator('.sb-rail a[href="#/journal"]').click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toContain('/journal');

  await openDialog(page);
  await expect(page.getByRole('button', { name: INSTALL })).toBeVisible();
  await closeDialog(page);
});

test('a running download can be cancelled and installs nothing', async ({
  app,
  writeUpdateFixture,
}) => {
  const { page } = app;
  writeUpdateFixture(fixture('99.3.0', { ticks: 20, tickMs: 500 }));
  await checkNow(page);
  await download(page);
  await expect(page.getByRole('progressbar', { name: 'Downloading update' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download update' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Downloading update' })).toHaveCount(0);
  expect(await installCalls(app.app)).toEqual([]);
  await closeDialog(page);
});

test('a finished download installs nothing until the second confirmation', async ({
  app,
  writeUpdateFixture,
}) => {
  const { page } = app;
  writeUpdateFixture(fixture('99.4.0'));
  await checkNow(page);
  await download(page);
  const install = page.getByRole('button', { name: INSTALL });
  await expect(install).toBeVisible();
  expect(await installCalls(app.app)).toEqual([]);

  await install.click();
  await expect.poll(async () => (await installCalls(app.app)).length).toBe(1);
  await closeDialog(page);
});

test('install is refused while a task runs or an LLM response streams', async ({
  app,
  writeUpdateFixture,
}) => {
  const { page } = app;
  writeUpdateFixture(fixture('99.5.0'));
  await checkNow(page);
  await download(page);
  await expect(page.getByRole('button', { name: INSTALL })).toBeVisible();
  const before = (await installCalls(app.app)).length;
  const refusal = (): Promise<{ ok: boolean; error?: string }> =>
    page.evaluate("window.sb.invoke('update:installAndRestart')") as Promise<{
      ok: boolean;
      error?: string;
    }>;
  await closeDialog(page);

  await test.step('a running task refuses the install and keeps running', async () => {
    await page.locator('.sb-rail a[href="#/garden"]').click();
    await page
      .getByRole('button', { name: /^Check (now|again)$/ })
      .first()
      .click();
    const running = page.getByRole('progressbar', { name: 'Check running' });
    await expect(running).toBeVisible();

    await openDialog(page);
    await page.getByRole('button', { name: INSTALL }).click();
    await expect(page.getByTestId('update-reason')).toHaveText(
      'A task is still running. Wait for it to finish, or stop it.',
    );
    expect(await refusal()).toMatchObject({ ok: false, error: 'update.error.taskRunning' });
    await closeDialog(page);
    await expect(running).toBeVisible();

    await page.getByRole('button', { name: 'Cancel check' }).click();
    await expect(running).toBeHidden();
  });

  await test.step('a streaming reply refuses the install', async () => {
    await page.evaluate(
      "window.sb.invoke('chat:ask', { question: 'What do I know about the update fixture?' })",
    );
    await expect.poll(async () => (await refusal()).error).toBe('update.error.llmStreaming');
    await openDialog(page);
    await page.getByRole('button', { name: INSTALL }).click();
    await expect(page.getByTestId('update-reason')).toHaveText(
      'A reply is being generated. Wait for it to finish.',
    );
    await closeDialog(page);
  });

  expect((await installCalls(app.app)).length).toBe(before);
});

test('a failed download says why and stays offerable', async ({ app, writeUpdateFixture }) => {
  const { page } = app;
  writeUpdateFixture(fixture('99.6.0', { ticks: 1, tickMs: 50, outcome: 'offline' }));
  await checkNow(page);
  await download(page);
  await expect(page.getByTestId('update-reason')).toHaveText('The download failed: no connection.');
  await expect(page.getByRole('button', { name: 'Download update' })).toBeEnabled();

  writeUpdateFixture(fixture('99.6.0', { ticks: 1, tickMs: 50, outcome: 'checksum' }));
  await page.getByRole('button', { name: 'Download update' }).click();
  await expect(page.getByTestId('update-reason')).toHaveText(
    'The download was discarded: the checksum does not match.',
  );

  writeUpdateFixture(fixture('99.6.0', { ticks: 1, tickMs: 50, outcome: 'ok' }));
  await page.getByRole('button', { name: 'Download update' }).click();
  await expect(page.getByRole('button', { name: INSTALL })).toBeVisible();
  await expect(page.getByTestId('update-reason')).toHaveCount(0);
  await closeDialog(page);
});

test('once the running version is the latest, the control is gone', async ({
  app,
  writeUpdateFixture,
}) => {
  const { page } = app;
  writeUpdateFixture(fixture('99.7.0'));
  await checkNow(page);
  await expect(page.locator(CONTROL)).toBeVisible();

  const running = await app.app.evaluate(({ app: electronApp }) => electronApp.getVersion());
  writeUpdateFixture(fixture(running));
  await checkNow(page);
  await expect(page.locator(CONTROL)).toHaveCount(0);
});

test('dismissing hides the prompt for the session', async ({ app, writeUpdateFixture }) => {
  const { page } = app;
  writeUpdateFixture(fixture('99.8.0'));
  await checkNow(page);
  const installsBefore = (await installCalls(app.app)).length;
  await openDialog(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page.locator(CONTROL)).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.sb-rail')).toBeVisible();
  await expect(page.locator(CONTROL)).toHaveCount(0);
  expect(await installCalls(app.app)).toHaveLength(installsBefore);
});
