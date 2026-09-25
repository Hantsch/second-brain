/* Proves 063's D6 acceptance end to end: a module is deleted only after its
   cost is shown, the app lands back on the module list, and undo brings the
   module back — through the real UI, on the real filesystem, on the
   no-model harness.

   Seeded by `ensureDemoVault`: `second-brain-methodik`
   (`scripts/seed/module-methodik.mjs`) is a small, real module — pages, a
   catalogue, AGENTS.md — so the plan the dialog shows always names at least
   one page, and a confirmed delete actually moves a real folder into the
   trash rather than a placeholder. */

import { expect, test } from './fixtures/vault';

test.use({ specId: 'module-delete' });

const MODULE_SLUG = 'second-brain-methodik';
const MODULE_TITLE = 'Second-Brain-Methodik';

test('a module is deleted after its cost is shown and comes back through undo', async ({
  app,
  vault,
}) => {
  const { page } = app;

  await test.step('module delete — open the module', async () => {
    await page.locator('.sb-rail a[href="#/knowledge"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toContain('/knowledge');
    await page.getByRole('button', { name: `Open module ${MODULE_TITLE}` }).click();
    await expect(page.getByRole('heading', { name: MODULE_TITLE }).first()).toBeVisible();
  });

  await test.step('module delete — the dialog shows the plan before anything is written', async () => {
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Delete “${MODULE_TITLE}”?` });
    await expect(dialog).toBeVisible();
    /* The exact page count depends on the seed; what matters here is that a
       real plan — not a placeholder — was fetched and rendered. */
    await expect(dialog.getByText(/(is|are) deleted with the module\.$/)).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Delete', exact: true });
    await expect(confirm).toBeEnabled();
  });

  await test.step('module delete — confirm, and the app lands back on the module list', async () => {
    const dialog = page.getByRole('dialog', { name: `Delete “${MODULE_TITLE}”?` });
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(/^Deleted/)).toBeVisible();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/knowledge');
    await expect(
      page.getByRole('button', { name: `Open module ${MODULE_TITLE}` }),
    ).not.toBeVisible();
  });

  await test.step('module delete — the folder actually moved to the trash on disk', async () => {
    expect(vault.exists(`modules/${MODULE_SLUG}`)).toBe(false);
    expect(vault.trashEntries().length).toBeGreaterThan(0);
  });

  await test.step('module delete — undo brings the module back into the list', async () => {
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => vault.exists(`modules/${MODULE_SLUG}/module.md`)).toBe(true);
    await expect(page.getByRole('button', { name: `Open module ${MODULE_TITLE}` })).toBeVisible();
  });
});
