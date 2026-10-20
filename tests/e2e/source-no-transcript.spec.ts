/* Proves 051's user-visible surfaces through the real app: a YouTube source
 * without a transcript never becomes a page from placeholder text, but stays
 * a visible, honest state the user can act on. AC1 itself (the queue's
 * terminal state) needs a live ingest, which this harness forbids by design
 * (`fixtures/app.ts:46`) — that is a named gap, covered instead by unit tests
 * in `tests/core/ingest/queue.test.ts`. What this spec proves is everything
 * downstream of that state: the seeded demo vault already carries a
 * transcript-less video as a raw source (`scripts/seed/raw-youtube.mjs`,
 * `seedYoutubeNoTranscript`), as if a real ingest had already run and ended
 * `no-content`/`no-transcript`.
 *
 * One seeded blocked source carries all four assertions below, reused rather
 * than duplicated, in an order that only ever consumes it once:
 *
 *   1. AC4 — the row and the maintenance run both name the missing transcript
 *      (read-only: nothing here condenses the source).
 *   2. AC5 — an unrelated, already-condensed source page is untouched by the
 *      maintenance run in step 1.
 *   3. AC6 (no-model half) — with no model routed, the explicit
 *      "digest from description" click ends honestly as `awaiting-llm`, not
 *      as a page. The row stays blocked and uncondensed afterwards, which is
 *      exactly what step 4 needs.
 *   4. AC3 — with the fake provider (073, D1) routed, the same click creates
 *      a page whose frontmatter and body say what it was built from.
 *
 * The fake provider is pinned for the whole worker (`test.use` below, the
 * same mechanism `task-no-model.spec.ts` and `quit-during-digestion.spec.ts`
 * use); step 3 clears the routing table through the app's own LLM channel
 * and restores it afterwards, the same technique `task-no-model.spec.ts`
 * documents for reaching "no model configured" inside a fake-provider
 * worker — restored here (rather than left for last) because step 4 still
 * needs the model. */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/vault';

test.use({ specId: 'source-no-transcript', fakeProvider: {} });

/** Local calendar day, `offsetDays` away from today — must match
    `scripts/seed/lib.mjs#createClock` (`isoDay`) exactly, the same trick
    `discard-undo.spec.ts` and `task-no-model.spec.ts` already use for their
    own seeded day paths. */
function isoDayOffset(offsetDays: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${target.getFullYear()}-${month}-${day}`;
}

const MODULE_SLUG = 'second-brain-methodik';
const MODULE_WIKI = `modules/${MODULE_SLUG}/wiki`;
const SOURCES_DIR = `${MODULE_WIKI}/sources`;

/* `raw-youtube.mjs#seedYoutubeNoTranscript`: the transcript-less video, seeded
   as if a real ingest had already run and ended blocked. */
const BLOCKED_TITLE = 'Live AMA: Why We Killed Our Wiki Bot';
/* The job list shows a condense job by `input.origin` (`ipc/ingest.ts#condense`
   passes `outcome.origin` through as `input`, `jobLabel` then truncates it),
   never by the source's title — the URL is what `rowFor` cannot find a job by. */
const BLOCKED_URL = 'https://www.youtube.com/watch?v=zQPz9x2LKrT';

/* `raw-youtube.mjs#seedYoutubeCondensed` / `module-methodik.mjs`: the first
   video, already condensed — the "existing hollow source page" AC5 requires
   to prove untouched. Same path `discard-undo.spec.ts` computes for its own
   near-duplicate sibling of this exact page. */
const EXISTING_SOURCE_PAGE = `${SOURCES_DIR}/s-${isoDayOffset(-9)}-ai-second-brain-rotting.md`;

async function openSourcesTab(page: Page): Promise<void> {
  await page.locator('.sb-rail a[href="#/knowledge"]').click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/knowledge');
  await page.getByRole('tab', { name: 'Sources' }).click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/knowledge?tab=sources');
}

/** The row for a source, found by its visible title — same approach
    `import-task.spec.ts` uses for task rows via `.sb-trow-subject`. */
function rowFor(page: Page, title: string): Locator {
  return page.locator('.sb-row').filter({ hasText: title });
}

test('the undigested filter and the maintenance run both name the missing transcript', async ({
  app,
}) => {
  const { page } = app;

  await test.step('sources — the undigested filter shows the row with its reason', async () => {
    await openSourcesTab(page);
    /* "Hide successful" defaults to on (`SourcesTab.tsx`) — this is the
       undigested filter itself, no extra toggle needed. */
    const row = rowFor(page, BLOCKED_TITLE);
    await expect(row).toBeVisible();
    await expect(row.getByText('No transcript available')).toBeVisible();
  });

  await test.step('garden — a check run names the same reason', async () => {
    await page.locator('.sb-rail a[href="#/garden"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/garden');
    await page
      .getByRole('button', { name: /^Check (now|again)$/ })
      .first()
      .click();

    const card = page.locator('.sb-finding').filter({ hasText: BLOCKED_TITLE });
    await expect(card).toBeVisible();
    await expect(card.getByText('No transcript is available', { exact: false })).toBeVisible();
  });
});

/* AC5 says "existing hollow source pages are not rewritten by this story" — a
 * page condensed under the OLD buggy behaviour, from the placeholder "Kein
 * Transcript verfuegbar" text, before this story existed. The demo vault does
 * not seed such a page (`raw-youtube.mjs` only seeds the new, honestly-blocked
 * raw source added for this story, never an old hollow page built from it),
 * so this test cannot assert byte-identity on the exact artifact AC5 names.
 *
 * What it proves instead, honestly: the maintenance run in the previous test
 * — the only action in this story's surface that ever reads a blocked source
 * (`unprocessedSourceCheck`'s fix stays `open-ingest`, i.e. navigation only,
 * per the story's Decisions — there is no write path here at all, hollow or
 * not) — does not touch an unrelated, already-condensed source page it walks
 * past on the way. The stronger AC5 claim (an old hollow page specifically)
 * rests on a structural guarantee instead: no deliverable in this story
 * writes to `modules/*\/wiki/**`, which is verifiable by reading the diff
 * (named gap, mirroring how AC1's terminal state is named as ungated by e2e
 * in `## Decisions (Sprint)`). The legacy-log half of AC5 (a log without a
 * `transcript` field stays unblocked, not guessed at) is unit-covered in
 * `tests/core/index/pages.test.ts` › "bleibt bei einem legacy-Protokoll ohne
 * transcript-Feld unblockiert". */
test('the maintenance run does not touch an unrelated, already-condensed source page', async ({
  app,
  vault,
}) => {
  const { page } = app;

  const before = await test.step('snapshot the page before the run', async () => {
    return vault.snapshot(EXISTING_SOURCE_PAGE);
  });

  await test.step('run a maintenance check', async () => {
    await page.locator('.sb-rail a[href="#/garden"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/garden');
    await page
      .getByRole('button', { name: /^Check (now|again)$/ })
      .first()
      .click();
    /* The same finding as the previous test proves the run actually completed
       before the snapshot below is taken. */
    await expect(page.locator('.sb-finding').filter({ hasText: BLOCKED_TITLE })).toBeVisible();
  });

  await test.step('the page is byte-identical afterwards', async () => {
    expect(vault.snapshot(EXISTING_SOURCE_PAGE).equals(before)).toBe(true);
  });
});

test('with no model configured, digesting from the description ends honestly as awaiting-llm', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;

  await test.step('clear the routing (this test needs no model routed at all)', async () => {
    /* Same call and same reasoning as `task-no-model.spec.ts`: `hasRoute`
       reads the routing table, not provider health, so disabling the fake
       provider itself would leave the trigger showing regardless. A reload
       is what makes the renderer's own routing query see the change — this
       goes around `useMutation`, so nothing here invalidates the cache on
       its own. */
    for (const tier of ['cheap', 'balanced', 'strong']) {
      await page.evaluate(`window.sb.invoke('llm:setDefault', { tier: '${tier}', ref: null })`);
    }
    await page.reload();
  });

  const before = readdirSync(join(vaultPath, SOURCES_DIR)).sort();

  await test.step('digest from description, with nothing routed', async () => {
    await openSourcesTab(page);
    const row = rowFor(page, BLOCKED_TITLE);
    await row.getByRole('button', { name: 'Digest from description' }).click();
  });

  await test.step('the job ends awaiting-llm, not as a page', async () => {
    const job = page.locator('.sb-job').filter({ hasText: BLOCKED_URL });
    await expect(job.getByText('Waiting for a model')).toBeVisible();
    /* Terminal and honest, not a half-success: no wiki page came out of it. */
    await expect(job.getByRole('button', { name: 'View wiki page' })).toHaveCount(0);
  });

  await test.step('the row stays blocked and uncondensed', async () => {
    await expect(rowFor(page, BLOCKED_TITLE)).toBeVisible();
    expect(readdirSync(join(vaultPath, SOURCES_DIR)).sort()).toEqual(before);
  });

  await test.step('restore the routing for the remaining test', async () => {
    /* `pinFakeProvider` (`fixtures/app.ts`) wrote this exact provider/model
       pair into the vault's settings before launch — restoring the same
       reference is what a person picking the fake provider again in
       settings would produce. */
    for (const tier of ['cheap', 'balanced', 'strong']) {
      await page.evaluate(
        `window.sb.invoke('llm:setDefault', { tier: '${tier}', ref: { providerId: 'fake-e2e', model: 'fake-e2e-model' } })`,
      );
    }
    await page.reload();
  });
});

test('a video without a transcript is digested from its description only on request', async ({
  app,
  vault,
  vaultPath,
}) => {
  const { page } = app;

  const before = readdirSync(join(vaultPath, SOURCES_DIR)).sort();

  await test.step('open sources, the blocked row offers the explicit action', async () => {
    await openSourcesTab(page);
    const row = rowFor(page, BLOCKED_TITLE);
    await expect(row.getByText('No transcript available')).toBeVisible();
    await row.getByRole('button', { name: 'Digest from description' }).click();
  });

  await test.step('a page is created from the description', async () => {
    await expect
      .poll(() => readdirSync(join(vaultPath, SOURCES_DIR)).length)
      .toBe(before.length + 1);
  });

  await test.step('the created page says what it was built from', async () => {
    const after = readdirSync(join(vaultPath, SOURCES_DIR)).sort();
    const created = after.find((entry) => !before.includes(entry));
    if (created === undefined) throw new Error('no new source page appeared under wiki/sources/');
    const path = `${SOURCES_DIR}/${created}`;

    expect(vault.frontmatter(path).source_basis).toBe('metadata');
    /* `phrases('de').builtFromMetadata` (`core/wiki/text.ts`) — the seeded
       vault's document language is German (`scripts/seed/internal.mjs`). */
    expect(vault.readNote(path)).toContain(
      'Aus Beschreibung und Kapiteln erstellt, es gab kein Transcript.',
    );
  });

  await test.step('the row is no longer among the undigested', async () => {
    await expect(rowFor(page, BLOCKED_TITLE)).toHaveCount(0);
  });
});
