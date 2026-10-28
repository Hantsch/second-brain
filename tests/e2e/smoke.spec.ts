/* Proves the e2e harness itself: the built app comes up against a throwaway
   vault, and it is that vault the app works on — not whatever the person
   running the suite has open in their own installation. Everything else in
   tests/e2e/ rests on these two facts. */

import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { REPO_ROOT } from '../../scripts/lib/app-harness.mjs';
import { expect, test } from './fixtures/vault';

test.use({ specId: 'smoke' });

/** Windows reports paths in either slash and either case; the content is equal. */
function samePath(value: string): string {
  const slashed = value.replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? slashed.toLowerCase() : slashed;
}

test('the built app starts against a disposable vault', { tag: '@smoke' }, async ({ app }) => {
  const { page } = app;

  await test.step('startup — rail and dashboard render', async () => {
    await expect(page.locator('.sb-rail')).toBeVisible();
    const dashboard = page.locator('.sb-screen h1').first();
    await expect(dashboard).toBeVisible();
    expect((await dashboard.innerText()).trim()).not.toBe('');
  });

  await test.step('startup — navigating to projects answers a click', async () => {
    /* Painted is not the same as usable: the app has to answer a click. */
    await page.locator('.sb-rail a[href="#/projects"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/projects');
    await expect(page.locator('.sb-screen h1').first()).toBeVisible();
  });
});

test(
  'the app under test reads the temp vault, not the real one',
  { tag: '@smoke' },
  async ({ app, vaultPath }) => {
    const { page } = app;

    const shown = page.locator('.sb-vault-path');

    await test.step('vault isolation — settings shows the open vault path', async () => {
      /* Settings opens on the vault tab, and that tab prints the open vault's path —
       the same line a user would read to check which vault they are in. */
      await page.locator('.sb-rail a[href="#/settings"]').click();
      await expect(shown).toBeVisible();

      /* Polled: the path arrives with the vault status, a moment after the tab. */
      await expect
        .poll(async () => samePath((await shown.innerText()).trim()))
        .toBe(samePath(vaultPath));
    });

    await test.step('vault isolation — the path is a temp path, not the repo', async () => {
      const reported = samePath((await shown.innerText()).trim());
      expect(reported.startsWith(`${samePath(realpathSync(tmpdir()))}/`)).toBe(true);
      expect(reported).not.toContain(samePath(REPO_ROOT));
    });

    await test.step('vault isolation — the English UI pin holds', async () => {
      /* The fixture pins the UI to English, and later specs address controls by
       their English label. 'About' is 'Info' in German — this tab proves the pin
       holds and does not follow whoever runs the suite. */
      await expect(page.getByRole('tab', { name: 'About' })).toBeVisible();
    });
  },
);

test(
  'a seeded project file carries the frontmatter the app relies on',
  { tag: '@smoke' },
  async ({ vault }) => {
    /* Proves AC3's mechanism, not the AC3 flow itself: the vault fixture can
     read frontmatter off the disk vault, not just what the DOM claims. This
     runs no flow — no `app` dependency, the seeded file exists before the
     app ever launches — so the flow-based half of AC3 (assert on disk after
     a real flow) is carried by journal-close.spec.ts instead. */
    await test.step('vault on disk — kundenportal-relaunch frontmatter matches the seed', () => {
      const frontmatter = vault.frontmatter('projects/work/kundenportal-relaunch/project.md');
      expect(frontmatter.type).toBe('project');
      expect(frontmatter.slug).toBe('kundenportal-relaunch');
      expect(frontmatter.scope).toBe('work');
      expect(frontmatter.status).toBe('active');
    });
  },
);
