/* Proves 074's AC2 through the real app: an import is a task in the one work
   queue, not a job only the sources screen used to know about.

   Since D4 an ingest job is mirrored onto the shared registry
   (`kind: 'ingest'`, `lane: 'import'`, `detail` set to the `IngestJob` itself),
   travelling with every other kind of task over `event:work-tasks`. D6
   repoints `useIngestJobs` at that transport instead of the deleted
   `event:ingest-progress`. This spec walks the path a person would actually
   take: type a source into the inbox on the sources tab, take it in, and find
   it listed as a task on `/tasks` — proving both that the mirror really
   reaches the registry and that the renderer's own live subscription still
   renders it.

   Text, not a URL or a YouTube link: `noNetworkCalls` (`fixtures/app.ts`) fails
   the spec the moment any request leaves the app, and text is the one source
   kind that never fetches anything — it is filed as-is (see
   `sources.test.tsx`'s own "nimmt eingefügten Text als Quelle" test for the
   same reasoning). No target module is picked either ("file later"): AC2 is
   about the task showing up, not about condensation, and condensing would
   need a model this harness deliberately does not configure. */

import { expect, test } from './fixtures/app';

test.use({ specId: 'import-task' });

/** The exact text typed into the inbox — short enough to survive `jobLabel`'s
    80-character truncation (`src/core/ingest/job.ts`) unchanged, so the task's
    subject label on `/tasks` is this string verbatim. */
const SOURCE_TEXT =
  'Story 074, deliverable D6: a text source taken in for the import-task e2e spec.';

test('a submitted text source appears as an import task', async ({ app }) => {
  const { page } = app;

  await test.step('open the sources tab under Knowledge', async () => {
    await page.locator('.sb-rail a[href="#/knowledge"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/knowledge');
    await page.getByRole('tab', { name: 'Sources' }).click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/knowledge?tab=sources');
  });

  await test.step('type the text, see it recognised, and take it in', async () => {
    const field = page.getByLabel('URL, YouTube link or text');
    await field.fill(SOURCE_TEXT);
    await expect(page.getByText('Text detected — filed as a source')).toBeVisible();

    await page.getByRole('button', { name: 'Take in' }).click();
  });

  await test.step('the same job is a task on the tasks screen', async () => {
    await page.locator('.sb-rail a[href="#/tasks"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/tasks');
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();

    const row = page
      .locator('.sb-trow')
      .filter({ has: page.locator('.sb-trow-subject', { hasText: SOURCE_TEXT }) });
    await expect(row).toHaveCount(1);
  });
});
