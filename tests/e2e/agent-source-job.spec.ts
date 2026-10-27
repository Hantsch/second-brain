/* A source that waits for a model can be handed to the agent instead: one job file lands in
   `.secondbrain/agent/jobs/`, the row says it is with the agent, and when the agent's result
   file arrives the source is booked as condensed — all while the app stays open. */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '../../src/core/vault/frontmatter';
import { protocolPaths } from '../../src/core/wiki/raw-protocol';
import { expect, test } from './fixtures/app';

test.use({ specId: 'agent-source-job' });

const MODULE_SLUG = 'second-brain-methodik';
const SOURCE_TEXT = 'Agent source job spec: a text source waiting for a model.';

function jobFiles(vault: string): string[] {
  const dir = join(vault, '.secondbrain', 'agent', 'jobs');
  try {
    return readdirSync(dir).filter((name) => name.endsWith('.md'));
  } catch {
    return [];
  }
}

test('a waiting source handed to the agent comes back condensed', async ({ app, vaultPath }) => {
  const { page } = app;
  const row = page.locator('.sb-row').filter({ hasText: SOURCE_TEXT });

  await test.step('take in a text source into a module; with no model it ends awaiting a model', async () => {
    await page.locator('.sb-rail a[href="#/knowledge"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/knowledge');
    await page.getByRole('tab', { name: 'Sources' }).click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/knowledge?tab=sources');

    await page.getByLabel('URL, YouTube link or text').fill(SOURCE_TEXT);
    await page.getByLabel('Target module', { exact: true }).selectOption({ value: MODULE_SLUG });
    await page.getByRole('button', { name: 'Take in' }).click();

    await expect(row).toHaveCount(1);
    await expect(row.getByText('Not condensed')).toBeVisible();
  });

  await test.step('handing it over files exactly one job and replaces the hand-over button', async () => {
    await row.getByRole('button', { name: 'Hand to agent' }).click();

    await expect.poll(() => jobFiles(vaultPath).length).toBe(1);
    await expect(row.getByText('With the agent')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Hand to agent' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Withdraw' })).toBeVisible();
  });

  const [jobFile = ''] = jobFiles(vaultPath);
  const id = jobFile.replace(/\.md$/, '');
  const job = parse(
    readFileSync(join(vaultPath, '.secondbrain', 'agent', 'jobs', jobFile), 'utf8'),
  );
  const raw = String(job.frontmatter['subject']);
  const jobModule = job.frontmatter['module'];
  const module = typeof jobModule === 'string' ? jobModule : MODULE_SLUG;
  const sourcePage = `modules/${module}/wiki/sources/agent-source-job-spec.md`;

  await test.step('the agent writes the source page and its result file', async () => {
    const pageDir = join(vaultPath, 'modules', module, 'wiki', 'sources');
    mkdirSync(pageDir, { recursive: true });
    writeFileSync(
      join(vaultPath, sourcePage),
      `---\ntype: source\ntitle: Agent source job spec\nmodule: ${module}\nraw: ${raw}\n---\n\nA text source condensed by the agent.\n`,
    );
    const resultsDir = join(vaultPath, '.secondbrain', 'agent', 'results');
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(
      join(resultsDir, `${id}.md`),
      `---\njob: ${id}\nstatus: done\nsourcePage: ${sourcePage}\n---\n\nCondensed.\n`,
    );
  });

  await test.step('the row is booked as condensed and the protocol names the page', async () => {
    await expect(row.getByText('Not condensed')).toHaveCount(0);

    const protocol = protocolPaths(raw).find((path) => existsSync(join(vaultPath, path))) ?? '';
    const record = JSON.parse(readFileSync(join(vaultPath, protocol), 'utf8')) as {
      sourcePage?: string;
      modules?: string[];
    };
    expect(record.sourcePage).toBe('agent-source-job-spec');
    expect(record.modules).toContain(module);
  });
});

test("the tasks screen shows the agent's jobs, their failure reason and a withdrawal", async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const second = 'Second agent job spec source, still waiting for a model.';
  const group = (title: string) =>
    page.locator('.sb-panel').filter({ has: page.getByRole('heading', { name: title }) });
  const sourcesRow = page.locator('.sb-row').filter({ hasText: second });
  const knownJobs = new Set(jobFiles(vaultPath));

  await test.step('the first test left a finished job that Tasks lists as done', async () => {
    await page.locator('.sb-rail a[href="#/tasks"]').click();
    await expect(
      group('Finished').locator('.sb-trow').filter({ hasText: 'Condense source' }),
    ).toContainText('Done');
  });

  await test.step('a second source is taken in and its task offers the hand-over', async () => {
    await page.locator('.sb-rail a[href="#/knowledge"]').click();
    await page.getByRole('tab', { name: 'Sources' }).click();
    await page.getByLabel('URL, YouTube link or text').fill(second);
    await page.getByLabel('Target module', { exact: true }).selectOption({ value: MODULE_SLUG });
    await page.getByRole('button', { name: 'Take in' }).click();
    await expect(sourcesRow).toHaveCount(1);
    await page.locator('.sb-rail a[href="#/tasks"]').click();
  });

  const waitingTask = group('Finished').locator('.sb-trow').filter({ hasText: second });
  await test.step('handing it over from Tasks files one more job under With the agent', async () => {
    await waitingTask.getByRole('button', { name: 'Hand to agent' }).click();

    await expect.poll(() => jobFiles(vaultPath).length).toBe(knownJobs.size + 1);
    await expect(
      group('With the agent').locator('.sb-trow').filter({ hasText: second }),
    ).toBeVisible();
    await expect(waitingTask.getByRole('button', { name: 'Hand to agent' })).toHaveCount(0);
  });

  const [newJob = ''] = jobFiles(vaultPath).filter((name) => !knownJobs.has(name));
  const id = newJob.replace(/\.md$/, '');

  await test.step('a failed result moves the job to Finished with its reason', async () => {
    const resultsDir = join(vaultPath, '.secondbrain', 'agent', 'results');
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(
      join(resultsDir, `${id}.md`),
      `---\njob: ${id}\nstatus: failed\nreason: transcript unreadable\n---\n`,
    );

    const failed = group('Finished')
      .locator('.sb-trow')
      .filter({ hasText: 'transcript unreadable' });
    await expect(failed).toContainText('Failed');
    await expect(failed.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
    await expect(group('With the agent')).toHaveCount(0);
  });

  await test.step('handing it over again and withdrawing it leaves the source open to the agent', async () => {
    await waitingTask.getByRole('button', { name: 'Hand to agent' }).click();
    const open = group('With the agent').locator('.sb-trow').filter({ hasText: second });
    await open.getByRole('button', { name: 'Withdraw' }).click();

    await expect(group('With the agent')).toHaveCount(0);
    await expect(
      group('Finished').locator('.sb-trow').filter({ hasText: 'Withdrawn' }),
    ).toBeVisible();

    await page.locator('.sb-rail a[href="#/knowledge"]').click();
    await page.getByRole('tab', { name: 'Sources' }).click();
    await expect(sourcesRow.getByRole('button', { name: 'Hand to agent' })).toBeVisible();
  });
});
