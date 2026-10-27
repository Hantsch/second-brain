/* A module and a maintenance run can be handed to the agent. The agent is simulated by writing
   its result and run report files in the real formats while the app stays open: Tasks shows how
   a curated module went, and an audit the vault cannot accept fails without touching
   `gardener.json`. */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { parse } from '../../src/core/vault/frontmatter';
import { expect, test } from './fixtures/app';

test.use({ specId: 'agent-module-jobs' });

const MODULE_SLUG = 'second-brain-methodik';
const MODULE_TITLE = 'Second-Brain-Methodik';
const BAD_PATH = `modules/${MODULE_SLUG}/wiki/no-such-page.md`;

function agentDir(vault: string, dir: string): string {
  return join(vault, '.secondbrain', 'agent', dir);
}

function jobFiles(vault: string): string[] {
  try {
    return readdirSync(agentDir(vault, 'jobs')).filter((name) => name.endsWith('.md'));
  } catch {
    return [];
  }
}

function writeAgentFile(vault: string, dir: string, name: string, content: string): void {
  mkdirSync(agentDir(vault, dir), { recursive: true });
  writeFileSync(join(agentDir(vault, dir), name), content);
}

function jobIdOf(vault: string, kind: string, known: readonly string[] = []): string {
  const name = jobFiles(vault).find((file) => file.startsWith(kind) && !known.includes(file));
  return (name ?? '').replace(/\.md$/, '');
}

function jobFields(vault: string, id: string): Record<string, unknown> {
  const raw = readFileSync(join(agentDir(vault, 'jobs'), `${id}.md`), 'utf8');
  return parse(raw).frontmatter;
}

function group(page: Page, title: string): Locator {
  return page.locator('.sb-panel').filter({ has: page.getByRole('heading', { name: title }) });
}

function hashOf(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function openRoute(page: Page, route: string): Promise<void> {
  await page.locator(`.sb-rail a[href="#/${route}"]`).click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toContain(`/${route}`);
}

test('a module handed to the agent comes back with its report in Tasks', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const button = page.getByTestId(`hand-module-${MODULE_SLUG}`);

  await test.step('the module header offers the hand-over', async () => {
    await openRoute(page, 'knowledge');
    await page.getByRole('button', { name: `Open module ${MODULE_TITLE}` }).click();
    await expect(button).toBeVisible();
    await expect(button).toHaveText('Hand to agent');
  });

  await test.step('one click files exactly one job and the button turns into with the agent', async () => {
    await button.click();

    await expect(button).toHaveText('With the agent');
    await expect(button).toBeDisabled();
    expect(jobFiles(vaultPath).filter((name) => name.startsWith('curate-module'))).toHaveLength(1);
  });

  const id = jobIdOf(vaultPath, 'curate-module');

  await test.step('the open job sits under With the agent in Tasks, named by the module title', async () => {
    await openRoute(page, 'tasks');
    await expect(
      group(page, 'With the agent').locator('.sb-trow').filter({ hasText: MODULE_TITLE }),
    ).toContainText('Curate module');
  });

  await test.step('the agent leaves a run report and a result', async () => {
    const wiki = `modules/${MODULE_SLUG}/wiki`;
    writeAgentFile(
      vaultPath,
      'runs',
      '20261027T092000Z-gaston-jobs.md',
      [
        '---',
        'gaston: run-report',
        'version: 1',
        'skill: gaston-jobs',
        'started: 2026-10-27T09:20:00Z',
        'finished: 2026-10-27T09:40:00Z',
        // The third page lies outside the module and must not be counted for it.
        `pages: [${wiki}/concepts/a.md, ${wiki}/concepts/b.md, modules/other/wiki/c.md]`,
        'proposals: [20261027-093000-plan.md]',
        `jobsDone: [${id}]`,
        'jobsFailed: []',
        'jobsSkipped: []',
        '---',
        '',
      ].join('\n'),
    );
    writeAgentFile(
      vaultPath,
      'results',
      `${id}.md`,
      `---\njob: ${id}\nstatus: done\n---\n\nDone.\n`,
    );
  });

  await test.step('Tasks shows the job done with the pages and proposals the report counted', async () => {
    const row = group(page, 'Finished').locator('.sb-trow').filter({ hasText: MODULE_TITLE });
    await expect(row).toContainText('Done');
    await expect(row).toContainText('Pages changed: 2 · proposals written: 1');
    await expect(group(page, 'With the agent')).toHaveCount(0);
  });
});

test('a gardener run handed to the agent: a bad audit fails, a good one is stored', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const button = page.getByTestId('hand-gardener-run');
  const stateFile = join(vaultPath, '.secondbrain', 'gardener.json');
  const known = jobFiles(vaultPath);

  await test.step('a maintenance run with a finding offers the hand-over', async () => {
    /* Gaston checks the vault by itself shortly after opening it. A run started by hand now could
       be replaced by that one mid-test, so the spec waits for the run that is already on its way. */
    await openRoute(page, 'tasks');
    await expect(
      group(page, 'Finished').locator('.sb-trow').filter({ hasText: 'Maintenance' }).first(),
    ).toBeVisible();

    await openRoute(page, 'garden');
    await expect(button).toBeVisible();
    await expect(button).toHaveText('Hand to agent');
  });

  const stateBefore = { hash: '' };

  await test.step('one click files exactly one audit job', async () => {
    stateBefore.hash = hashOf(stateFile);
    await button.click();

    await expect(button).toHaveText('With the agent');
    await expect(button).toBeDisabled();
    expect(jobFiles(vaultPath).filter((name) => name.startsWith('gardener-audit'))).toHaveLength(1);
  });

  const firstId = jobIdOf(vaultPath, 'gardener-audit', known);
  const fields = jobFields(vaultPath, firstId);
  const pages = (fields['pages'] as string[]) ?? [];
  // A seed that yields no page to name must fail here, not write an empty path into the result.
  const firstPage = pages[0];
  expect(firstPage).toBeDefined();

  await test.step('a result naming a page that is not in the vault frees the button again', async () => {
    writeAgentFile(
      vaultPath,
      'results',
      `${firstId}.md`,
      [
        '---',
        `job: ${firstId}`,
        'status: done',
        'contradictions:',
        `  - pathA: ${BAD_PATH}`,
        `    pathB: ${String(firstPage)}`,
        '    note: The two pages disagree.',
        '---',
        '',
      ].join('\n'),
    );

    // Still on Maintenance: the button must come back without leaving the screen.
    await expect(button).toHaveText('Hand to agent');
    await expect(button).toBeEnabled();
  });

  await test.step('Tasks shows the failed job with the path and the run is untouched', async () => {
    await openRoute(page, 'tasks');
    const row = group(page, 'Finished')
      .locator('.sb-trow')
      .filter({ hasText: 'Interpret maintenance run' });
    await expect(row).toContainText('Failed');
    await expect(row).toContainText(BAD_PATH);
    await expect(row).toContainText('Maintenance run of');
    expect(hashOf(stateFile)).toBe(stateBefore.hash);
  });

  await test.step('handing over again files exactly one new open job', async () => {
    await openRoute(page, 'garden');
    await expect(button).toHaveText('Hand to agent');
    /* Job ids carry the hand-over time to the second; a person never hands the same run over
       twice within one, so the spec waits that second out instead of colliding with itself. */
    const stamp = () => new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    await expect.poll(stamp).not.toBe(firstId.split('-')[2]);
    await button.click();

    await expect(button).toHaveText('With the agent');
    const open = jobFiles(vaultPath).filter(
      (name) => name.startsWith('gardener-audit') && name !== `${firstId}.md`,
    );
    expect(open).toHaveLength(1);
  });

  const secondId = jobIdOf(vaultPath, 'gardener-audit', [`${firstId}.md`, ...known]);
  const candidates = (jobFields(vaultPath, secondId)['candidateIds'] as string[]) ?? [];
  // Likewise: with no candidate the result would confirm nothing and the booking would go unchecked.
  const firstCandidate = candidates[0];
  expect(firstCandidate).toBeDefined();
  const advice = 'Merge the two near-duplicate source pages.';

  await test.step('a valid result is stored and Maintenance shows its advice', async () => {
    writeAgentFile(
      vaultPath,
      'results',
      `${secondId}.md`,
      [
        '---',
        `job: ${secondId}`,
        'status: done',
        'confirmed:',
        `  - ${String(firstCandidate)}`,
        'advice:',
        `  - ${advice}`,
        '---',
        '',
      ].join('\n'),
    );

    await expect(page.locator('.sb-gadvice').getByText(advice)).toBeVisible();
    await expect(page.locator('.sb-gadvice')).toContainText('Interpreted by the model.');
    // A stored audit means the run is no longer offered to the agent.
    await expect(button).toHaveCount(0);
  });
});
