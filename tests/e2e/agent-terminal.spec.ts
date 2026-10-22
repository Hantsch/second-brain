/* The Agent tab's Terminal section through the real app: the launcher runs for real, only
   its spawn is replaced by a recorder (`SB_E2E_TERMINAL_FIXTURE`), so no terminal opens and
   `claude` never starts. Whether `claude` is findable is decided by the app's PATH, which
   `pathDir` pins to one directory holding a fake executable. */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { AGENT_SKILLS } from '../../src/shared/types/agent-setup';
import { expect, TERMINAL_FIXTURE_FILE, test } from './fixtures/app';

const pathDir = realpathSync(mkdtempSync(join(tmpdir(), 'gaston-terminal-path-')));
mkdirSync(pathDir, { recursive: true });
writeFileSync(
  join(pathDir, process.platform === 'win32' ? 'claude.cmd' : 'claude'),
  process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n',
  { mode: 0o755 },
);

test.use({ specId: 'agent-terminal', pathDir, terminalFixture: { missing: [] } });
// The launcher only runs on Windows; elsewhere the handler refuses before any spawn.
test.skip(process.platform !== 'win32', 'terminal launch is Windows-only');

const MODULE_SLUG = 'second-brain-methodik';
const MODULE_TITLE = 'Second-Brain-Methodik';

interface Launch {
  file: string;
  args: string[];
  cwd: string;
}

function terminalPanel(page: Page) {
  return page
    .locator('.sb-panel')
    .filter({ has: page.getByRole('heading', { name: 'Terminal', exact: true }) });
}

test('the terminal section launches claude in the vault, falls back to powershell and reports a missing terminal', async ({
  app,
  tempRoot,
  vaultPath,
}) => {
  const { page } = app;
  const fixture = join(tempRoot, TERMINAL_FIXTURE_FILE);
  const launches = (): Launch[] => {
    try {
      return JSON.parse(readFileSync(`${fixture}.launches.json`, 'utf8')) as Launch[];
    } catch {
      return [];
    }
  };
  const setMissing = (missing: string[]): void =>
    writeFileSync(fixture, JSON.stringify({ missing }), 'utf8');
  const panel = terminalPanel(page);
  const open = panel.getByRole('button', { name: 'Open Claude in the vault' });
  const jobs = panel.getByRole('button', { name: 'Work the jobs' });
  const curate = panel.getByRole('button', { name: 'Curate a module' });
  const lastClaudeLine = (launch: Launch | undefined): string => launch?.args.at(-1) ?? '';

  await test.step('without the setup the buttons are off and the setup sentence says why, installing turns them on', async () => {
    await page.evaluate('location.hash = "#/settings?tab=agent"');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Setup files are missing.')).toBeVisible();
    for (const button of [open, jobs, curate]) await expect(button).toBeDisabled();

    await page.getByRole('button', { name: 'Install', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Install the agent setup' });
    await dialog.getByRole('button', { name: /^Write \d+ files?$/ }).click();
    await expect(dialog.getByRole('status')).toContainText('Setup written.');
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(dialog).toHaveCount(0);

    await expect(panel.getByText('Setup files are missing.')).toHaveCount(0);
    await expect(open).toBeEnabled();
    await expect(jobs).toBeEnabled();
    expect(launches()).toEqual([]);
  });

  await test.step('open starts claude in the vault through Windows Terminal', async () => {
    await open.click();
    await expect(panel.getByRole('status')).toHaveText('Opened in Windows Terminal.');
    const [launch, ...rest] = launches();
    expect(rest).toEqual([]);
    expect(launch?.file).toBe('wt.exe');
    expect(launch?.cwd).toBe(vaultPath);
    expect(lastClaudeLine(launch)).toBe('claude');
  });

  await test.step('work the jobs starts claude with the jobs skill', async () => {
    await jobs.click();
    await expect.poll(() => launches().length).toBe(2);
    expect(lastClaudeLine(launches().at(-1))).toBe(`claude '/${AGENT_SKILLS.jobs}'`);
  });

  await test.step('curating a picked module starts claude with the curate skill and its slug', async () => {
    await expect(curate).toBeDisabled();
    await panel.getByLabel('Module to curate').selectOption({ label: MODULE_TITLE });
    await curate.click();
    await expect.poll(() => launches().length).toBe(3);
    expect(lastClaudeLine(launches().at(-1))).toBe(
      `claude '/${AGENT_SKILLS.curate} ${MODULE_SLUG}'`,
    );
  });

  await test.step('without Windows Terminal the launch falls back to PowerShell', async () => {
    setMissing(['wt.exe']);
    await open.click();
    await expect(panel.getByRole('status')).toHaveText('Opened in PowerShell.');
    const attempts = launches().slice(3);
    expect(attempts.map((launch) => launch.file)).toEqual(['wt.exe', 'cmd.exe']);
    expect(attempts[1]?.cwd).toBe(vaultPath);
    expect(lastClaudeLine(attempts[1])).toContain('powershell.exe -NoExit -Command "claude"');
  });

  await test.step('without any terminal the tab says so in an alert', async () => {
    setMissing(['wt.exe', 'cmd.exe']);
    await open.click();
    await expect(panel.getByRole('alert')).toHaveText('No terminal could be started (ENOENT).');
    await expect(panel.getByRole('status')).toHaveCount(0);
  });
});
