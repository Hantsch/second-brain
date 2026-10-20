/* The About tab's notes for the running version, read from a fixture
   changelog (SB_E2E_CHANGELOG) so the spec does not depend on the real file.
   One app per spec file means one env value, so each test rewrites the file
   and reloads the window (which drops the query cache) before opening About. */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { evaluateMain } from '../../scripts/lib/app-harness.mjs';
import type { UpdateFileFixture } from '../../src/main/update/e2e-fixture';
import { expect, test } from './fixtures/app';

const changelog = join(mkdtempSync(join(tmpdir(), 'gaston-changelog-')), 'CHANGELOG.md');

/* The unpackaged e2e app reports Electron's version, not package.json's, so the
   fixture is keyed on whatever the running app says it is. */
const withNotes = (version: string): string =>
  [
    '# Changelog',
    '',
    `## [${version}] - 2026-01-01`,
    '',
    '### Added',
    '',
    '- Quieter update flow',
    '',
    '<img src=x onerror=alert(1)>',
    '',
    '## [0.0.1] - 2025-01-01',
    '',
    '### Added',
    '',
    '- Something old',
    '',
  ].join('\n');

const WITHOUT_NOTES = '# Changelog\n\n## [0.0.1] - 2025-01-01\n\n- Something old\n';

const fixture = (version: string | null): UpdateFileFixture => ({
  distribution: 'installed',
  latest: version === null ? null : { version, notes: '### Added\n\n- Pending fixture feature' },
  download: { ticks: 5, tickMs: 300, outcome: 'ok' },
});

test.use({
  specId: 'about-release-notes',
  changelogFile: changelog,
  updateFixture: fixture(null),
});
test.describe.configure({ mode: 'serial' });

const NOTES = '[data-testid="release-notes"]';

function runningVersion(electron: ElectronApplication): Promise<string> {
  return evaluateMain(electron, ({ app }) => app.getVersion()) as Promise<string>;
}

async function openAbout(page: Page, text: string): Promise<void> {
  writeFileSync(changelog, text);
  await page.reload();
  await page.evaluate('location.hash = "#/settings?tab=about"');
  await expect(page.getByRole('heading', { name: 'About this app' })).toBeVisible();
}

test('about shows the running version’s notes', async ({ app }) => {
  const { page } = app;
  const version = await runningVersion(app.app);
  await openAbout(page, withNotes(version));
  await expect(page.getByRole('heading', { name: `What's new in ${version}` })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Added' })).toBeVisible();
  await expect(page.getByText('Quieter update flow')).toBeVisible();
  await expect(page.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
  await expect(page.locator(NOTES).locator('img')).toHaveCount(0);
  await expect(page.getByText('Something old')).toHaveCount(0);
});

test('about without notes shows an empty state', async ({ app }) => {
  const { page } = app;
  await openAbout(page, WITHOUT_NOTES);
  await expect(page.getByText('No release notes for this version')).toBeVisible();
  await expect(page.locator(NOTES)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Full changelog' })).toBeVisible();
});

test('about links open in the system browser', async ({ app }) => {
  const { page } = app;
  await openAbout(page, withNotes(await runningVersion(app.app)));
  await evaluateMain(app.app, ({ shell }) => {
    const g = globalThis as unknown as { __opened: string[] };
    g.__opened = [];
    shell.openExternal = (url: string) => {
      g.__opened.push(url);
      return Promise.resolve();
    };
  });
  const windows = app.app.windows().length;
  await page.getByRole('button', { name: 'Project page' }).click();
  await page.getByRole('button', { name: 'Full changelog' }).click();
  await expect
    .poll(() =>
      evaluateMain(app.app, () => (globalThis as unknown as { __opened: string[] }).__opened),
    )
    .toEqual([
      'https://github.com/Hantsch/second-brain',
      'https://github.com/Hantsch/second-brain/blob/main/CHANGELOG.md',
    ]);
  expect(app.app.windows().length).toBe(windows);
});

test('about shows a pending update next to the update action', async ({
  app,
  writeUpdateFixture,
}) => {
  const { page } = app;
  writeUpdateFixture(fixture('99.1.0'));
  await page.evaluate("window.sb.invoke('update:check')");
  await openAbout(page, withNotes(await runningVersion(app.app)));
  const block = page.getByTestId('about-pending-update');
  await expect(block).toBeVisible();
  await expect(block.getByTestId('about-pending-version')).toHaveText('99.1.0');
  await expect(block.getByText('Not yet installed')).toBeVisible();
  await expect(block.getByText('Pending fixture feature')).toBeVisible();
  await expect(block.getByRole('button', { name: 'Download update' })).toBeVisible();
});

test('about checks for updates on demand and shows the outcome', async ({
  app,
  writeUpdateFixture,
}) => {
  const { page } = app;
  writeUpdateFixture(fixture(null));
  await openAbout(page, withNotes(await runningVersion(app.app)));
  await page.getByRole('button', { name: 'Check now' }).click();
  await expect(page.getByTestId('about-update-outcome')).toContainText('up to date');
  await expect(page.getByTestId('about-pending-update')).toHaveCount(0);
});
