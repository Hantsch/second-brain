/* The agent screen's setup panel: the plan dialog and the write it confirms, on a vault
   that has never been set up and then on one the user has edited by hand. */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

test.use({ specId: 'agent-setup' });

const CURATE = '.claude/skills/gaston-curate/SKILL.md';
const PROPOSE = '.claude/skills/gaston-propose/SKILL.md';
const MINE = '.claude/skills/mine/SKILL.md';
const MANIFEST = '.claude/gaston-manifest.json';

const MANAGED_PATHS = [
  'CLAUDE.md',
  '.claude/settings.json',
  '.claude/hooks/gaston-shell-guard.ps1',
  '.claude/hooks/gaston-wiki-check.ps1',
  '.claude/skills/gaston-jobs/SKILL.md',
  CURATE,
  PROPOSE,
];

/* Re-navigates through another screen: the panel reads the files again on mount. */
async function openAgentScreen(page: Page): Promise<void> {
  await page.evaluate('location.hash = "#/settings?tab=about"');
  await page.evaluate('location.hash = "#/agent"');
  await expect(page.getByRole('heading', { name: 'Agent setup' })).toBeVisible();
}

function row(page: Page, path: string) {
  return page.getByRole('listitem').filter({ hasText: path });
}

function planSection(page: Page, title: string) {
  return page.getByRole('dialog').getByRole('region', { name: title });
}

async function confirmAndClose(page: Page, label: string): Promise<void> {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: label }).click();
  await expect(dialog.getByRole('status')).toContainText('Setup written.');
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/* Every file under .secondbrain/trash/, whatever the store names its copies. */
function trashedContents(vault: string): string[] {
  const dir = join(vault, '.secondbrain', 'trash');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'));
}

test('the agent screen lists the setup as missing and offers install', async ({ app }) => {
  const { page } = app;
  await test.step('open the Agent screen', async () => {
    await page.evaluate('location.hash = "#/agent"');
    await expect(page.getByRole('heading', { name: 'Agent setup' })).toBeVisible();
  });
  await test.step('every managed file is listed as missing', async () => {
    for (const path of MANAGED_PATHS) {
      const item = row(page, path);
      await expect(item).toHaveCount(1);
      await expect(item.getByText('Missing')).toBeVisible();
    }
  });
  await test.step('install is offered', async () => {
    await expect(page.getByRole('button', { name: 'Install', exact: true })).toBeVisible();
  });
});

test("install and update write only what the plan shows and leave the user's files alone", async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const at = (path: string): string => join(vaultPath, ...path.split('/'));
  const read = (path: string): string => readFileSync(at(path), 'utf8');
  const edited = { curate: '', mine: '' };

  await test.step('install lists all seven files and writes nothing until confirmed', async () => {
    expect(existsSync(at('CLAUDE.md'))).toBe(false);
    expect(existsSync(at('.claude'))).toBe(false);
    await openAgentScreen(page);
    await page.getByRole('button', { name: 'Install', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Install the agent setup' })).toBeVisible();
    for (const path of MANAGED_PATHS) {
      await expect(planSection(page, 'Will write').getByText(path, { exact: true })).toBeVisible();
    }
    expect(existsSync(at('CLAUDE.md'))).toBe(false);
    expect(existsSync(at('.claude'))).toBe(false);
  });

  await test.step('confirm writes every file with its marker and records the manifest', async () => {
    await confirmAndClose(page, 'Write 23 files');
    for (const path of MANAGED_PATHS) expect(existsSync(at(path))).toBe(true);
    expect(read('CLAUDE.md').split('\n')[0]).toContain('gaston:managed');
    for (const skill of MANAGED_PATHS.filter((path) => path.endsWith('SKILL.md'))) {
      expect(read(skill)).toContain('gaston:managed');
    }
    const manifest = JSON.parse(read(MANIFEST)) as { files: { path: string; version: number }[] };
    expect(manifest.files.find((file) => file.path === '.claude/settings.json')?.version).toBe(1);
    for (const path of MANAGED_PATHS) {
      await expect(row(page, path).getByText('Current')).toBeVisible();
    }
  });

  await test.step('the user edits the vault directly', async () => {
    mkdirSync(dirname(at(MINE)), { recursive: true });
    writeFileSync(at(MINE), '---\nname: mine\n---\nMy own skill.\n', { flag: 'wx' });
    edited.mine = read(MINE);

    const [, ...rest] = read('CLAUDE.md').split('\n');
    const old = ['<!-- gaston:managed id=vault-claude version=0 -->', ...rest].join('\n');
    writeFileSync(at('CLAUDE.md'), old);
    const manifest = JSON.parse(read(MANIFEST)) as {
      files: { path: string; version: number; hash: string }[];
    };
    const entry = manifest.files.find((file) => file.path === 'CLAUDE.md');
    if (!entry) throw new Error('CLAUDE.md is not in the manifest');
    Object.assign(entry, { version: 0, hash: sha256(old) });
    writeFileSync(at(MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

    rmSync(at(PROPOSE));
    writeFileSync(at(CURATE), `${read(CURATE)}\nMy own rule.\n`);
    edited.curate = read(CURATE);
  });

  await test.step('the tab shows what changed and offers an update', async () => {
    await openAgentScreen(page);
    await expect(row(page, 'CLAUDE.md').getByText('Outdated')).toBeVisible();
    await expect(row(page, PROPOSE).getByText('Missing')).toBeVisible();
    await expect(row(page, CURATE).getByText('Changed by you')).toBeVisible();
    await expect(row(page, MINE).getByText('Yours')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeVisible();
  });

  await test.step('update writes the outdated and missing files only', async () => {
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Update the agent setup' })).toBeVisible();
    const writes = planSection(page, 'Will write');
    await expect(writes.getByText('CLAUDE.md', { exact: true })).toBeVisible();
    await expect(writes.getByText(PROPOSE, { exact: true })).toBeVisible();
    await expect(planSection(page, 'Changed by you').getByRole('checkbox')).not.toBeChecked();
    await expect(planSection(page, 'Left alone').getByText(MINE, { exact: true })).toBeVisible();
    await confirmAndClose(page, 'Write 2 files');
    expect(read('CLAUDE.md').split('\n')[0]).toBe(
      '<!-- gaston:managed id=vault-claude version=1 -->',
    );
    expect(existsSync(at(PROPOSE))).toBe(true);
    expect(read(CURATE)).toBe(edited.curate);
    expect(read(MINE)).toBe(edited.mine);
  });

  await test.step('a ticked file is rewritten and its edited version goes to the trash', async () => {
    await openAgentScreen(page);
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    /* The native input is visually replaced by the atom's box; its label is what a user clicks. */
    const optIn = planSection(page, 'Changed by you');
    await optIn.getByText(CURATE, { exact: true }).click();
    await expect(optIn.getByRole('checkbox')).toBeChecked();
    await confirmAndClose(page, 'Write 1 file');
    expect(read(CURATE)).not.toContain('My own rule.');
    expect(trashedContents(vaultPath)).toContain(edited.curate);
    expect(read(MINE)).toBe(edited.mine);
  });
});
