/* A task routed to the agent does not call a model: the journal coach's reply
   becomes one job file in the vault, and the routing table's Test checks the
   agent setup instead of a provider. The seeded vault has no agent setup, so
   Test reports it missing. */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures/app';

test.use({ specId: 'agent-task-route' });

test('a task routed to the agent waits as a job and its test checks the agent setup', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const select = page.locator('#routing-select-journal-chat');

  await test.step('route — journal-chat goes to the agent and the hint shows', async () => {
    await page.evaluate('location.hash = "#/settings?tab=models"');
    await expect(select).toBeVisible();
    await select.selectOption({ label: 'Agent (job)' });
    const row = page.locator('tr').filter({ has: select });
    await expect(row.getByText('Goes to the agent as a job.', { exact: false })).toBeVisible();
  });

  await test.step('route — Test says the agent setup is not installed', async () => {
    const row = page.locator('tr').filter({ has: select });
    await row.getByRole('button', { name: 'Test' }).click();
    await expect(
      row.getByText('The agent setup is not installed. Install it under Settings → Agent.'),
    ).toBeVisible();
  });

  await test.step('route — the vault settings carry the agent route', async () => {
    const file = join(vaultPath, '.secondbrain', 'settings.json');
    await expect
      .poll(() => {
        const settings = JSON.parse(readFileSync(file, 'utf8')) as {
          routing?: { tasks?: Record<string, unknown> };
        };
        return settings.routing?.tasks?.['journal-chat'] ?? null;
      })
      .toEqual({ providerId: 'agent', model: 'agent' });
  });

  await test.step('journal — the coach reply waits as a job', async () => {
    await page.locator('.sb-rail a[href="#/journal"]').click();
    await page.getByRole('button', { name: 'Choose the stance Tips' }).click();
    await page
      .getByLabel('Talk to the coach')
      .fill('Today I could not decide what to tackle first.');
    await page.getByRole('button', { name: 'Save and ask' }).click();
    await expect(page.getByText('The reply is waiting as a job for the agent')).toBeVisible();
  });

  await test.step('journal — exactly one llm-task job file lies in the vault', async () => {
    const dir = join(vaultPath, '.secondbrain', 'agent', 'jobs');
    expect(existsSync(dir)).toBe(true);
    const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
    expect(files).toHaveLength(1);
    const job = JSON.parse(readFileSync(join(dir, files[0] ?? ''), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(job).toMatchObject({ kind: 'llm-task', task: 'journal-chat' });
    expect(typeof job.createdAt).toBe('string');
  });
});
