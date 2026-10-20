/* The journey a user reported (067): asking a question with no model
   configured, following the note into the models tab, and finding out whether
   the recommendation there leads anywhere.

   What this spec proves:
   - AC3 — the `LlmMissing` note on the ask surface lands on settings' *models*
     tab, the tab the routing table actually lives on, not on settings in
     general. Existing behaviour; this story does not touch that link, so this
     is the regression guard for it.
   - AC2, its reachable half — the routing table stays a normal, usable table
     for a sensitive task: `condense-area`'s select is present, enabled, and
     offers exactly what a non-sensitive task's select offers. The rule warns
     and explains (D3), it never narrows or locks the manual choice. Whether an
     assignment can be *completed* is not provable here: the harness vault has
     no configured provider (fixtures/app.ts), so every select holds its
     "default" entry and nothing else — the accepted limit of this suite (067,
     Open Questions).

   What this spec does NOT prove, and cannot in this harness: AC1's dead-end
   row (`pick === null` — reason sentence, pointer, "Assign manually", focus).
   `recommendModels` needs no configured provider to make a pick: the four
   local catalogue entries are reachable as `needs-download` on any machine
   whose capacity verdict carries them, and they pass the sensitive-task rule
   on their attributed `no-training` policy. A row therefore only goes empty
   when `judgeCapacity`'s ceiling falls below the task's parameter floor
   (`beyond-this-machine`) or blocks every local entry outright — i.e. on
   small hardware only. On the machine this was written on (12 GB VRAM →
   ~16 B possible, above `condense-area`'s 13 B `strong` floor) every one of
   the 13 rows carries a pick. Asserting a dead end here would be asserting
   the host's GPU size. See this story's Done notes. */

import { expect, test } from './fixtures/app';

test.use({ specId: 'settings-models-dead-end' });

/** The `id` `RoutingTable` puts on a task's select (`routingSelectId`). */
function routingSelect(task: string): string {
  return `#routing-select-${task}`;
}

test('the no-model note lands on the models tab, where a sensitive task keeps a usable select', async ({
  app,
}) => {
  const { page } = app;

  await test.step('no-model note — asking with no model configured says so', async () => {
    /* The ask surface is an overlay, not a rail screen, and its own address is
       how the app opens it (`OpenOverlayRoute` in App.tsx — the dashboard tile
       and old bookmarks both go through it). The command palette's ask mode
       would submit the question straight away, which is exactly what a spec
       with no model must not do. As an expression string, not a closure: e2e
       specs compile against tsconfig.node.json, which carries no DOM lib. */
    await page.evaluate('location.hash = "#/ask"');
    const overlay = page.getByRole('dialog', { name: 'Ask' });
    await expect(overlay).toBeVisible();
    await expect(
      overlay.getByText('Cited answers in prose need a model — the app shows the passages'),
    ).toBeVisible();
  });

  await test.step('no-model note — it lands on the models tab, not on settings in general', async () => {
    await page
      .getByRole('dialog', { name: 'Ask' })
      .getByRole('button', { name: 'Set up routing' })
      .click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/settings?tab=models');
    /* The tab, not just the screen: the routing table is what the note
       promised, and it only exists on this one tab. */
    await expect(page.getByRole('tab', { name: 'Models', selected: true })).toBeVisible();
    await expect(page.locator(routingSelect('condense-area'))).toBeVisible();
  });

  await test.step('no-model note — the recommendation answers for the sensitive task', async () => {
    /* Nothing is fetched until this is pressed (guardrail 1), and the row for
       a sensitive task has to carry a target line and a reason either way —
       which of the two shapes it takes (a pick or the dead end) depends on the
       machine, see the header. */
    await page.getByRole('button', { name: 'Get recommendations' }).click();
    const row = page
      .locator('li.sb-recommend-row')
      .filter({ has: page.getByText('Condense area', { exact: true }) });
    await expect(row).toBeVisible();
    await expect(row.locator('.sb-recommend-target')).not.toBeEmpty();
    await expect(row.locator('.sb-routing-hint').first()).not.toBeEmpty();
  });

  await test.step('manual way out — the sensitive task’s select is enabled, not narrowed', async () => {
    /* AC2's reachable half. Compared against a non-sensitive task's select
       rather than asserted in absolute terms: "not filtered" is a statement
       about the difference between the two, and it holds whatever the harness
       happens to have listed. */
    const sensitive = page.locator(routingSelect('condense-area'));
    const plain = page.locator(routingSelect('query-answer'));
    await expect(sensitive).toBeEnabled();
    expect(await sensitive.locator('option').allTextContents()).toEqual(
      await plain.locator('option').allTextContents(),
    );
    /* And nothing is routed yet, so the rule has nothing to warn about: no
       warning note sits under this select (D3 warns on the routed target, and
       there is none — an unrouted sensitive task must not be flagged). */
    await expect(
      page.locator('td').filter({ has: sensitive }).locator('.sb-routing-fallback'),
    ).toHaveCount(0);
  });
});
