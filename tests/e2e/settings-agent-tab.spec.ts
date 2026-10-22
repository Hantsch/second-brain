/* The Agent settings tab through the real app: whether `claude` is findable is decided
   by the launched app's PATH, which `pathDir` pins to one directory this file owns.
   The directory starts empty (absent) and the last test puts a fake executable in it. */

import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { evaluateMain } from '../../scripts/lib/app-harness.mjs';
import { expect, test } from './fixtures/app';

const pathDir = realpathSync(mkdtempSync(join(tmpdir(), 'gaston-agent-path-')));

test.use({ specId: 'settings-agent-tab', pathDir });
test.describe.configure({ mode: 'serial' });

const INSTALL_GUIDE = 'https://code.claude.com/docs/en/setup';

async function openAgentTab(page: Page): Promise<void> {
  await page.evaluate('location.hash = "#/settings?tab=agent"');
  await expect(page.getByRole('tab', { name: 'Agent' })).toHaveAttribute('aria-selected', 'true');
}

function cliPanel(page: Page) {
  return page
    .locator('.sb-panel')
    .filter({ has: page.getByRole('heading', { name: 'Claude Code', exact: true }) });
}

test('the agent tab sits between customization and about and explains the agent', async ({
  app,
}) => {
  const { page } = app;
  await openAgentTab(page);
  await test.step('the tab order puts Agent between Customization and About', async () => {
    const names = (await page.getByRole('tab').allInnerTexts()).map((name) => name.trim());
    const agent = names.indexOf('Agent');
    expect(agent).toBeGreaterThan(0);
    expect(names[agent - 1]).toBe('Customization');
    expect(names[agent + 1]).toBe('About');
  });
  await test.step('the Agent tab is selected and the about text names the guarded folders', async () => {
    await expect(page.getByRole('tab', { name: 'Agent' })).toHaveAttribute('aria-selected', 'true');
    const about = page.locator('.sb-panel').filter({
      has: page.getByRole('heading', { name: 'About this', exact: true }),
    });
    await expect(about).toContainText('journal/');
    await expect(about).toContainText('raw/');
  });
});

test('without claude on PATH the agent tab links to the official install guide', async ({
  app,
}) => {
  const { page } = app;
  await test.step('stub the system browser and open the Agent tab', async () => {
    await evaluateMain(app.app, ({ shell }) => {
      const g = globalThis as unknown as { __opened: string[] };
      g.__opened = [];
      shell.openExternal = (url: string) => {
        g.__opened.push(url);
        return Promise.resolve();
      };
    });
    await openAgentTab(page);
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

test('with claude on PATH the agent tab shows it installed without starting it', async ({
  app,
}) => {
  const { page } = app;
  const isWindows = process.platform === 'win32';
  const fake = join(pathDir, isWindows ? 'claude.cmd' : 'claude');
  const marker = join(pathDir, 'ran.txt');
  await test.step('put a fake claude on PATH and reopen the tab', async () => {
    mkdirSync(pathDir, { recursive: true });
    /* If anything ever executes the fake, it leaves the marker behind. */
    writeFileSync(
      fake,
      isWindows
        ? ['@echo ran> "%~dp0ran.txt"', ''].join('\r\n')
        : ['#!/bin/sh', 'echo ran > "$(dirname "$0")/ran.txt"', ''].join('\n'),
      { mode: 0o755 },
    );
    await openAgentTab(page);
    /* The status is re-read on mount, so leaving the tab and coming back sees the new file. */
    await page.getByRole('tab', { name: 'About' }).click();
    await page.getByRole('tab', { name: 'Agent' }).click();
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
