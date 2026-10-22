/* The agent screen through the real app: whether `claude` is findable is decided
   by the launched app's PATH, which `pathDir` pins to one directory this file owns.
   The directory starts empty (absent) and the last test puts a fake executable in it. */

import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { evaluateMain } from '../../scripts/lib/app-harness.mjs';
import { expect, test } from './fixtures/app';

const pathDir = realpathSync(mkdtempSync(join(tmpdir(), 'gaston-agent-path-')));

test.use({ specId: 'agent-screen', pathDir });
test.describe.configure({ mode: 'serial' });

const INSTALL_GUIDE = 'https://code.claude.com/docs/en/setup';

async function openAgentScreen(page: Page): Promise<void> {
  await page.evaluate('location.hash = "#/agent"');
  await expect(page.getByRole('heading', { level: 1, name: 'Agent' })).toBeVisible();
}

function cliPanel(page: Page) {
  return page
    .locator('.sb-panel')
    .filter({ has: page.getByRole('heading', { name: 'Claude Code', exact: true }) });
}

test('the rail entry opens the agent screen with its commands and explains the agent', async ({
  app,
}) => {
  const { page } = app;
  await test.step('the Agent entry sits between Tasks and Care and opens the screen', async () => {
    const rail = page.getByRole('navigation', { name: 'Main navigation' });
    const names = (await rail.locator('.sb-rail-item > span:first-of-type').allInnerTexts()).map(
      (name) => name.trim(),
    );
    const agent = names.indexOf('Agent');
    expect(names[agent - 1]).toBe('Tasks');
    expect(names[agent + 1]).toBe('Care');
    await rail.getByRole('link', { name: 'Agent', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Agent' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Claude in the vault' })).toBeVisible();
  });
  await test.step('the commands panel lists what to type, and says the setup is missing', async () => {
    const commands = page.locator('.sb-panel').filter({
      has: page.getByRole('heading', { name: 'Commands', exact: true }),
    });
    for (const command of ['/gaston-propose', '/gaston-jobs', '/model', '/help']) {
      await expect(commands.getByText(command, { exact: true })).toBeVisible();
    }
    await expect(commands.getByText('/gaston-curate <module>')).toBeVisible();
    await expect(commands.getByText(/only exist once the agent setup/)).toBeVisible();
  });
  await test.step('the about text names the guarded folders', async () => {
    const about = page.locator('.sb-panel').filter({
      has: page.getByRole('heading', { name: 'About this', exact: true }),
    });
    await expect(about).toContainText('journal/');
    await expect(about).toContainText('raw/');
  });
  await test.step('the old settings tab address lands on the agent screen', async () => {
    await page.evaluate('location.hash = "#/settings?tab=agent"');
    await expect(page).toHaveURL(/#\/agent$/);
  });
});

test('without claude on PATH the agent screen links to the official install guide', async ({
  app,
}) => {
  const { page } = app;
  await test.step('stub the system browser and open the Agent screen', async () => {
    await evaluateMain(app.app, ({ shell }) => {
      const g = globalThis as unknown as { __opened: string[] };
      g.__opened = [];
      shell.openExternal = (url: string) => {
        g.__opened.push(url);
        return Promise.resolve();
      };
    });
    await openAgentScreen(page);
  });
  const panel = cliPanel(page);
  await test.step('the panel says claude was not found and offers one button', async () => {
    await expect(panel.getByText('was not found')).toBeVisible();
    await expect(panel.getByRole('button')).toHaveCount(1);
  });
  await test.step('the button opens the install guide in the system browser, not a window', async () => {
    const windows = app.app.windows().length;
    await panel.getByRole('button').click();
    await expect
      .poll(() =>
        evaluateMain(app.app, () => (globalThis as unknown as { __opened: string[] }).__opened),
      )
      .toEqual([INSTALL_GUIDE]);
    expect(app.app.windows().length).toBe(windows);
  });
});

test('with claude on PATH the agent screen shows it installed without starting it', async ({
  app,
}) => {
  const { page } = app;
  const isWindows = process.platform === 'win32';
  const fake = join(pathDir, isWindows ? 'claude.cmd' : 'claude');
  const marker = join(pathDir, 'ran.txt');
  await test.step('put a fake claude on PATH and reopen the screen', async () => {
    mkdirSync(pathDir, { recursive: true });
    /* If anything ever executes the fake, it leaves the marker behind. */
    writeFileSync(
      fake,
      isWindows
        ? ['@echo ran> "%~dp0ran.txt"', ''].join('\r\n')
        : ['#!/bin/sh', 'echo ran > "$(dirname "$0")/ran.txt"', ''].join('\n'),
      { mode: 0o755 },
    );
    /* The status is re-read on mount, so leaving the screen and coming back sees the new file. */
    await page.evaluate('location.hash = "#/settings"');
    await openAgentScreen(page);
  });
  const panel = cliPanel(page);
  await test.step('the panel shows it installed, where, with no button', async () => {
    await expect(panel.getByText('is installed')).toBeVisible();
    await expect(panel.getByText(fake, { exact: false })).toBeVisible();
    await expect(panel.getByRole('button')).toHaveCount(0);
  });
  await test.step('the fake was never started', () => {
    expect(existsSync(marker)).toBe(false);
  });
});
