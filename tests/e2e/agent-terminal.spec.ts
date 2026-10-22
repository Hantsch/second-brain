/* The agent screen's open button through the real app: the launcher runs for real, only its spawn is
   replaced by a recorder (`SB_E2E_TERMINAL_FIXTURE`), so no terminal opens and `claude` never
   starts. Whether `claude` is findable is decided by the app's PATH, which `pathDir` pins to
   one directory holding a fake executable. */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

interface Launch {
  file: string;
  args: string[];
  cwd: string;
}

test('the agent screen launches plain claude in the vault, falls back to powershell and reports a missing terminal', async ({
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
  const agent = page.getByRole('button', { name: 'Open Claude in the vault' });
  const toasts = page.getByRole('region', { name: 'Notifications' });
  const lastClaudeLine = (launch: Launch | undefined): string => launch?.args.at(-1) ?? '';

  await test.step('without the setup the button says why, and installing it on the same screen clears the block', async () => {
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Agent', exact: true })
      .click();
    await agent.click();
    await expect(toasts.getByText('Claude was not opened.')).toBeVisible();
    await expect(toasts.getByText(/Setup files are missing\./)).toBeVisible();
    expect(launches()).toEqual([]);

    await page.getByRole('button', { name: 'Install', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Install the agent setup' });
    await dialog.getByRole('button', { name: /^Write \d+ files?$/ }).click();
    await expect(dialog.getByRole('status')).toContainText('Setup written.');
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(dialog).toHaveCount(0);
    expect(launches()).toEqual([]);
  });

  await test.step('the button starts plain claude, no first prompt, in the vault through Windows Terminal', async () => {
    await agent.click();
    await expect(toasts.getByText('Opened in Windows Terminal.')).toBeVisible();
    const [launch, ...rest] = launches();
    expect(rest).toEqual([]);
    expect(launch?.file).toBe('wt.exe');
    expect(launch?.cwd).toBe(vaultPath);
    expect(lastClaudeLine(launch)).toBe('claude');
  });

  await test.step('without Windows Terminal the launch falls back to PowerShell', async () => {
    setMissing(['wt.exe']);
    await agent.click();
    await expect(toasts.getByText('Opened in PowerShell.')).toBeVisible();
    const attempts = launches().slice(1);
    expect(attempts.map((launch) => launch.file)).toEqual(['wt.exe', 'cmd.exe']);
    expect(attempts[1]?.cwd).toBe(vaultPath);
    expect(lastClaudeLine(attempts[1])).toContain('powershell.exe -NoExit -Command "claude"');
  });

  await test.step('without any terminal the button says so', async () => {
    setMissing(['wt.exe', 'cmd.exe']);
    await agent.click();
    await expect(toasts.getByText('No terminal could be started (ENOENT).')).toBeVisible();
  });
});
