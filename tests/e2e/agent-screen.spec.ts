/* The agent screen through the real app: the rail entry leads to it, it lists the
   commands the Claude session knows, and without a setup it points to Settings. Opening the
   terminal itself is agent-terminal.spec.ts. */

import { expect, test } from './fixtures/app';

test.use({ specId: 'agent-screen' });

test('the rail entry opens the agent screen with its commands and points to the settings', async ({
  app,
}) => {
  const { page } = app;
  await test.step('the Agent entry sits between Tasks and Care and opens the screen', async () => {
    const rail = page.getByRole('navigation', { name: 'Main navigation' });
    const names = (await rail.locator('.sb-rail-item > span:first-of-type').allInnerTexts()).map(
      (name) => name.trim(),
    );
    const agent = names.indexOf('Agent');
    expect(names[agent - 1]).toBe('Tasks');
    expect(names[agent + 1]).toBe('Care');
    await rail.getByRole('link', { name: 'Agent', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Agent' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Claude in the vault' })).toBeVisible();
  });
  await test.step('the commands panel lists what to type', async () => {
    const commands = page.locator('.sb-panel').filter({
      has: page.getByRole('heading', { name: 'Commands', exact: true }),
    });
    for (const command of ['/gaston-propose', '/gaston-jobs', '/model', '/help']) {
      await expect(commands.getByText(command, { exact: true })).toBeVisible();
    }
    await expect(commands.getByText('/gaston-curate <module>')).toBeVisible();
  });
  await test.step('without a setup a notice leads to the agent settings', async () => {
    await page.getByRole('link', { name: 'Go to agent settings' }).click();
    await expect(page.getByRole('tab', { name: 'Agent' })).toHaveAttribute('aria-selected', 'true');
  });
});
