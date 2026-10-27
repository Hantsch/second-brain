/* The help module ships with the agent setup: one Install writes it, Knowledge lists it,
   an older page makes the row read outdated until Update, and "About this" opens its
   agent page in the app. */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { HELP_MODULE_VERSION } from '../../src/core/agent/help/version';
import { expect, test } from './fixtures/app';

test.use({ specId: 'help-module' });

const MODULE_TITLE = 'Gaston help';
const MANIFEST = '.claude/gaston-manifest.json';
const OLD_PAGE = 'modules/gaston-help/wiki/concepts/screen-dashboard.md';
const AGENT_PAGE_TITLE = 'The agent: setup, protection and proposals';

/* The row is a one-item list named after the module, so it is found without its position. */
function helpRow(page: Page) {
  return page.getByRole('list', { name: 'Help module' });
}

async function confirmAndClose(page: Page, label: RegExp): Promise<void> {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: label }).click();
  await expect(dialog.getByRole('status')).toContainText('Setup written.');
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
}

test('the help module comes with the agent setup and opens from About this', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const at = (path: string): string => join(vaultPath, ...path.split('/'));

  await test.step('the help row reads missing before the install', async () => {
    await page.evaluate('location.hash = "#/settings?tab=agent"');
    await expect(helpRow(page).getByText('Missing')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read the agent page in Knowledge' })).toHaveCount(
      0,
    );
  });

  await test.step('install writes the module and the row reads current', async () => {
    await page.getByRole('button', { name: 'Install', exact: true }).click();
    await confirmAndClose(page, /^Write \d+ files$/);
    await expect(helpRow(page).getByText('Current')).toBeVisible();
  });

  await test.step('Knowledge lists Gaston help without a refresh', async () => {
    await page.locator('.sb-rail a[href="#/knowledge"]').click();
    await expect(page.getByRole('button', { name: `Open module ${MODULE_TITLE}` })).toBeVisible();
  });

  await test.step('an older page makes the row read outdated', async () => {
    const old = readFileSync(at(OLD_PAGE), 'utf8').replace(
      `template_version: ${HELP_MODULE_VERSION}`,
      'template_version: 0',
    );
    expect(old).toContain('template_version: 0');
    writeFileSync(at(OLD_PAGE), old);
    /* The manifest records what Gaston wrote; a page that no longer matches it would be
       read as changed by the user, not as written by an older Gaston. */
    const manifest = JSON.parse(readFileSync(at(MANIFEST), 'utf8')) as {
      files: { path: string; version: number; hash: string }[];
    };
    const entry = manifest.files.find((file) => file.path === OLD_PAGE);
    if (!entry) throw new Error(`${OLD_PAGE} is not in the manifest`);
    Object.assign(entry, {
      version: 0,
      hash: createHash('sha256').update(old, 'utf8').digest('hex'),
    });
    writeFileSync(at(MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

    /* Another tab and back: the panel reads the files again on mount. */
    await page.evaluate('location.hash = "#/settings?tab=about"');
    await page.evaluate('location.hash = "#/settings?tab=agent"');
    await expect(helpRow(page).getByText('Outdated')).toBeVisible();
  });

  await test.step('update rewrites the page and the row reads current', async () => {
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.getByRole('dialog').getByText(OLD_PAGE, { exact: true })).toBeVisible();
    await confirmAndClose(page, /^Write 1 file$/);
    await expect(helpRow(page).getByText('Current')).toBeVisible();
    expect(readFileSync(at(OLD_PAGE), 'utf8')).toContain(
      `template_version: ${HELP_MODULE_VERSION}`,
    );
  });

  await test.step('About this opens the agent page in Knowledge', async () => {
    await page.getByRole('link', { name: 'Read the agent page in Knowledge' }).click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toContain('/knowledge?m=gaston-help');
    await expect(page.getByRole('heading', { name: AGENT_PAGE_TITLE }).first()).toBeVisible();
  });
});
