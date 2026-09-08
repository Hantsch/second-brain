/* Proves 064's AC1-AC3 through the real app: a fetched page that yields
 * nothing readable says so honestly, and ingesting the same URL twice offers
 * a deliberate "ingest again" instead of silently duplicating or silently
 * refusing.
 *
 * Both pages come from the offline `SB_E2E_FETCH_FIXTURE` seam
 * (`fixtures/app.ts`, `src/main/ipc/fetch-e2e-fixture.ts`): a fixed manifest
 * maps two test URLs to local HTML fixture files
 * (`tests/e2e/fixtures/pages/`), so `fetchPage` (`core/ingest/url.ts`) runs
 * for real against a real response — no socket, and `noNetworkCalls`
 * (`fixtures/app.ts`) stays green because the fixture never leaves the
 * process.
 *
 * - `consent-wall.html` is a minimal cookie-consent-shaped page, well under
 *   the 200-non-whitespace-character floor `pickMainContent`/`fetchPage` use
 *   to tell "a page" from "nothing readable" — the AC1/AC2 case.
 * - `article.html` is a normal, substantial article — the AC3 duplicate
 *   case, ingested once, then again on purpose via "Ingest again". */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

test.use({
  specId: 'url-no-content',
  /* A model is routed (the fake provider, offline) so a "file later" job that
     really does have readable text reaches `done` instead of `awaiting-llm` —
     the duplicate spec needs a clean "ingested normally" first run, not a
     second reason the job might be waiting. The no-content spec is unaffected:
     `no-content` is decided on empty text, before `llmAvailable` is even
     read (`core/ingest/queue.ts#condense`). */
  fakeProvider: {},
  fetchFixture: {
    responses: [
      { url: 'https://example.test/consent-wall', file: 'consent-wall.html' },
      { url: 'https://example.test/article', file: 'article.html' },
    ],
  },
});

const CONSENT_WALL_URL = 'https://example.test/consent-wall';
const ARTICLE_URL = 'https://example.test/article';

async function openSourcesTab(page: Page): Promise<void> {
  await page.locator('.sb-rail a[href="#/knowledge"]').click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/knowledge');
  await page.getByRole('tab', { name: 'Sources' }).click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/knowledge?tab=sources');
}

/** Types a URL into the inbox and submits it — the same flow `import-task.spec.ts`
 * drives for a text source, "Web page detected" being the URL kind's own detection line. */
async function pasteAndSubmit(page: Page, url: string): Promise<void> {
  const field = page.getByLabel('URL, YouTube link or text');
  await field.fill(url);
  await expect(page.getByText('Web page detected')).toBeVisible();
  await page.getByRole('button', { name: 'Take in' }).click();
}

function jobRow(page: Page, url: string) {
  return page.locator('.sb-job').filter({ hasText: url });
}

test('a fetched page that yields nothing readable ends honestly as no-content', async ({ app }) => {
  const { page } = app;

  await test.step('open sources and submit the consent-wall URL', async () => {
    await openSourcesTab(page);
    await pasteAndSubmit(page, CONSENT_WALL_URL);
  });

  await test.step('the job ends no-content, not awaiting-llm', async () => {
    const job = jobRow(page, CONSENT_WALL_URL);
    await expect(
      job.getByText('The source rests in the vault, there is nothing to condense'),
    ).toBeVisible();
    // Never the "awaiting a model" state — a page this thin is not "no model
    // configured", it never had anything to condense in the first place.
    await expect(
      job.getByText('The source rests in the vault, condensing needs a model'),
    ).toHaveCount(0);
    await expect(job.getByRole('button', { name: 'Set up a model' })).toHaveCount(0);
  });
});

test('a duplicate URL can be ingested again, leaving the first raw file untouched', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const rawDir = join(vaultPath, 'raw', 'web');
  /* The `app` fixture is worker-scoped (one vault per spec file), so the
     no-content spec above may already have left files under `raw/web/` — the
     seeded demo vault has its own, too. Notes (not `.ingest.json` logs) are
     therefore counted as a delta against this snapshot, never against an
     absolute count. */
  const notesOf = (): string[] => readdirSync(rawDir).filter((entry) => entry.endsWith('.md'));
  const before = notesOf();

  await test.step('open sources and ingest the article once', async () => {
    await openSourcesTab(page);
    await pasteAndSubmit(page, ARTICLE_URL);
    await expect.poll(notesOf).toHaveLength(before.length + 1);
  });

  const firstFile =
    await test.step('exactly one new raw file exists after the first ingest', () => {
      const created = notesOf().find((entry) => !before.includes(entry));
      if (created === undefined) throw new Error('no new raw file appeared under raw/web/');
      return join(rawDir, created);
    });
  const firstContent = readFileSync(firstFile, 'utf8');

  await test.step('ingesting the same URL again shows the duplicate note', async () => {
    await pasteAndSubmit(page, ARTICLE_URL);
    const job = jobRow(page, ARTICLE_URL).first();
    await expect(job.getByText('Already present')).toBeVisible();
    await expect(job.getByRole('button', { name: 'Ingest again' })).toBeVisible();
  });

  await test.step('close the detail dialog the duplicate opened on top of the job', async () => {
    // `afterStart` (`SourcesTab.tsx`) opens the existing source's detail dialog
    // whenever a job comes back `duplicate` — a real find, worth surfacing, but
    // it sits over the job list until dismissed, exactly like a person would
    // have to dismiss it before touching a row underneath.
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  await test.step('"Ingest again" produces a second raw file', async () => {
    await jobRow(page, ARTICLE_URL).first().getByRole('button', { name: 'Ingest again' }).click();
    await expect.poll(notesOf).toHaveLength(before.length + 2);
  });

  await test.step('the first raw file is unchanged', () => {
    expect(readFileSync(firstFile, 'utf8')).toBe(firstContent);
  });
});
