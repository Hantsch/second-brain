/* The Agent tab's Last run section follows the vault while the tab stays open: reports and
   proposals the agent writes appear without a revisit, and a broken newest report is flagged. */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

test.use({ specId: 'agent-last-run' });

// Different days, so the panel showing `started` instead of `finished` cannot pass.
const STARTED = '2026-03-05T09:12:00Z';
const FINISHED = '2026-10-27T09:20:00Z';
// The panel's date format (formatDateTime in the renderer, English UI); the e2e project cannot
// import renderer code.
function shown(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

const TARGET = 'projects/work/rechnungsautomatisierung/project.md';

function writeAgentFile(vault: string, dir: string, name: string, content: string): void {
  const folder = join(vault, '.secondbrain', 'agent', dir);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, name), content);
}

function runReport(skill: string): string {
  return [
    '---',
    'gaston: run-report',
    'version: 1',
    `skill: ${skill}`,
    'argument: website-relaunch',
    `started: ${STARTED}`,
    `finished: ${FINISHED}`,
    'pages: [projects/work/a/project.md, projects/work/b/project.md]',
    'proposals: [20261027-091500-plan.md]',
    'jobsDone: [job-1]',
    'jobsFailed: [job-2]',
    'jobsSkipped: []',
    '---',
    '',
  ].join('\n');
}

function lastRunPanel(page: Page): Locator {
  return page
    .locator('.sb-panel')
    .filter({ has: page.getByRole('heading', { name: 'Last run', exact: true }) });
}

function count(panel: Locator, label: string): Locator {
  return panel.getByRole('listitem').filter({ hasText: label });
}

test.describe('agent last run', () => {
  test('the last run section follows the newest report while the app is open', async ({
    app,
    vaultPath,
  }) => {
    const { page } = app;
    await page.evaluate('location.hash = "#/settings?tab=agent"');
    const panel = lastRunPanel(page);
    const maintenance = panel.getByRole('link', { name: /in Maintenance$/ });

    await test.step('without a report it says so and offers no Maintenance link', async () => {
      await expect(panel.getByText('No agent run yet.')).toBeVisible();
      await expect(maintenance).toHaveCount(0);
    });

    await test.step('a report written with the tab open shows time, skill and counts', async () => {
      writeAgentFile(
        vaultPath,
        'runs',
        '20261027T091200Z-gaston-curate.md',
        runReport('gaston-curate'),
      );
      await expect(panel.getByText('gaston-curate website-relaunch')).toBeVisible();
      await expect(panel.getByText(shown(FINISHED), { exact: true })).toBeVisible();
      await expect(panel.getByText(shown(STARTED), { exact: true })).toHaveCount(0);
      await expect(count(panel, 'Pages changed')).toHaveText(/2$/);
      await expect(count(panel, 'Proposals written')).toHaveText(/1$/);
      await expect(count(panel, 'Jobs finished')).toHaveText(/1$/);
      await expect(count(panel, 'Jobs failed')).toHaveText(/1$/);
      await expect(count(panel, 'Jobs skipped')).toHaveCount(0);
    });

    await test.step('a waiting proposal adds a link that opens Maintenance', async () => {
      const current = readFileSync(join(vaultPath, TARGET));
      const reason = 'The last run section links to waiting proposals.';
      const hash = createHash('sha256').update(current).digest('hex');
      writeAgentFile(
        vaultPath,
        'proposals',
        '20261027-093000-last-run.md',
        [
          '---',
          'gaston: proposal',
          'version: 1',
          'kind: edit',
          'run: 2026-10-27T09:12:00.000Z',
          `target: ${TARGET}`,
          `base_hash: ${hash}`,
          `reason: ${reason}`,
          '---',
          `${current.toString('utf8')}\n${reason}\n`,
        ].join('\n'),
      );
      await expect(maintenance).toHaveText('1 proposal waits in Maintenance');
      await maintenance.click();
      await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/garden');
      await expect(page.locator('.sb-finding').filter({ hasText: reason })).toHaveCount(1);
    });

    await test.step('a newer report with broken frontmatter shows as unreadable', async () => {
      await page.evaluate('location.hash = "#/settings?tab=agent"');
      const newer = '20261027T101200Z-gaston-curate.md';
      writeAgentFile(vaultPath, 'runs', newer, '---\ngaston: [run-report\n---\n');
      await expect(panel.getByText('The last run report cannot be read.')).toBeVisible();
      await expect(panel.getByText(`.secondbrain/agent/runs/${newer}`)).toBeVisible();
      await expect(count(panel, 'Pages changed')).toHaveCount(0);
      await expect(maintenance).toHaveText('1 proposal waits in Maintenance');
      await expect(page.getByRole('heading', { name: 'Protection', exact: true })).toBeVisible();
    });
  });
});
