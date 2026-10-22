/* The agent screen's Protection section: the rules it lists are read back from the
   installed settings.json, so a rule removed by hand shows up as missing. */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

test.use({ specId: 'agent-protection' });

const RULES = {
  journal: "journal/ and its derived index cannot be read or changed by Claude's file tools.",
  raw: 'raw/ is read-only.',
  setup: 'CLAUDE.md and .claude/ are read-only.',
  overview: 'wiki/overview.md changes only through a proposal.',
  internal: '.secondbrain/ is read-only except results, proposals and runs.',
  guard:
    'A check before each tool call blocks shell access to journal/, shell writes to raw/, and writes outside the wiki layer.',
  wiki: 'Wiki writes are checked for frontmatter and a log.md entry.',
};
const REMOVED = 'Read(/journal/**)';

/* Re-navigates through another screen: the panel reads the file again on mount. */
async function openAgentScreen(page: Page): Promise<void> {
  await page.evaluate('location.hash = "#/settings?tab=about"');
  await page.evaluate('location.hash = "#/agent"');
  await expect(page.getByRole('heading', { name: 'Protection' })).toBeVisible();
}

function rule(page: Page, sentence: string) {
  return page.getByRole('listitem').filter({ hasText: sentence });
}

test('the protection section reads the rules back from the vault', async ({ app, vaultPath }) => {
  const { page } = app;

  await test.step('without a setup it says nothing protects the vault and points to Install', async () => {
    await openAgentScreen(page);
    await expect(page.getByText(/^Nothing protects this vault from the agent yet\./)).toContainText(
      'Install',
    );
  });

  await test.step('installing lists all seven rules as installed', async () => {
    await page.getByRole('button', { name: 'Install', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^Write \d+ files$/ }).click();
    await expect(dialog.getByRole('status')).toContainText('Setup written.');
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(dialog).toHaveCount(0);
    for (const sentence of Object.values(RULES)) {
      await expect(rule(page, sentence).getByText('Installed', { exact: true })).toBeVisible();
    }
  });

  await test.step('a rule removed by hand shows as missing, the others stay installed', async () => {
    const file = join(vaultPath, '.claude', 'settings.json');
    const settings = JSON.parse(readFileSync(file, 'utf8')) as {
      permissions: { deny: string[] };
    };
    expect(settings.permissions.deny).toContain(REMOVED);
    settings.permissions.deny = settings.permissions.deny.filter((entry) => entry !== REMOVED);
    writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);

    await openAgentScreen(page);
    const journal = rule(page, RULES.journal);
    await expect(journal.getByText('Missing', { exact: true })).toBeVisible();
    await expect(journal.getByText(REMOVED, { exact: true })).toBeVisible();
    for (const [name, sentence] of Object.entries(RULES)) {
      if (name === 'journal') continue;
      await expect(rule(page, sentence).getByText('Installed', { exact: true })).toBeVisible();
    }
  });
});
