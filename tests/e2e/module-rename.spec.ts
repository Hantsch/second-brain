/* Proves 063's D5 acceptance end to end: a module is renamed only after its
   changes are shown, and the app lands on the module at its new slug —
   through the real UI, on the real filesystem, on the no-model harness.

   Seeded by `ensureDemoVault`: `second-brain-methodik`
   (`scripts/seed/module-methodik.mjs`) is a small, real module — pages, a
   catalogue, AGENTS.md — so the plan the dialog shows is never empty, and a
   slug change actually moves a folder rather than a placeholder. */

import { expect, test } from './fixtures/vault';

test.use({ specId: 'module-rename' });

const MODULE_SLUG = 'second-brain-methodik';
const MODULE_TITLE = 'Second-Brain-Methodik';
const NEW_TITLE = 'Second Brain Methodik Reloaded';
const NEW_SLUG = 'second-brain-methodik-reloaded';

test('a module is renamed after its changes are shown', async ({ app, vault }) => {
  const { page } = app;

  await test.step('module rename — open the module', async () => {
    await page.locator('.sb-rail a[href="#/knowledge"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toContain('/knowledge');
    await page.getByRole('button', { name: `Open module ${MODULE_TITLE}` }).click();
    await expect(page.getByRole('heading', { name: MODULE_TITLE }).first()).toBeVisible();
  });

  await test.step('module rename — the unedited title previews as title-only', async () => {
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename module' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText('Only the title changes — the folder stays where it is.'),
    ).toBeVisible();
  });

  await test.step('module rename — a new title previews the folder move and the touched files', async () => {
    const dialog = page.getByRole('dialog', { name: 'Rename module' });
    const titleField = dialog.getByLabel('Title');
    await titleField.fill('');
    await titleField.fill(NEW_TITLE);

    await expect(
      dialog.getByText(
        `The module folder moves from modules/${MODULE_SLUG} to modules/${NEW_SLUG}.`,
      ),
    ).toBeVisible();
    await expect(dialog.getByText('Module file', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Pages', { exact: true })).toBeVisible();
  });

  await test.step('module rename — confirm, and the app lands on the module at its new slug', async () => {
    const dialog = page.getByRole('dialog', { name: 'Rename module' });
    const confirm = dialog.getByRole('button', { name: 'Rename', exact: true });
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(/^Renamed to/)).toBeVisible();
    await expect.poll(() => page.url().split('#')[1] ?? '').toContain(`m=${NEW_SLUG}`);
    await expect(page.getByRole('heading', { name: NEW_TITLE })).toBeVisible();
  });

  await test.step('module rename — the folder actually moved on disk', async () => {
    expect(vault.exists(`modules/${MODULE_SLUG}`)).toBe(false);
    expect(vault.exists(`modules/${NEW_SLUG}/module.md`)).toBe(true);
  });
});
