/* A module overview that is still the old bullet list: it reads like any wiki page,
   the full-text search finds it, and its first condensation replaces it whole —
   with every old line shown as removed and the previous file kept byte for byte in
   the trash. The fake provider answers `condense-module` with citations of real
   pages of the seeded module; only the model's words are scripted. */

import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

const MODULE = 'identity-management';
const WIKI = `modules/${MODULE}/wiki`;
const OVERVIEW = `${WIKI}/overview.md`;
const OVERVIEW_TITLE = 'Identitätsmanagement — Synthese';
/** Other pages of the module use this word too; the overview hit is told apart by its path. */
const TERM = 'Unterorganisationen';
/** A foreign section as a real legacy vault carries it: the old ingest listed pages here. */
const LEGACY_BULLET = '- [[oauth2]] — OAuth 2.1';
const LEGACY_SECTION = `
## Seiten

${LEGACY_BULLET}
`;

const REPLY = JSON.stringify({
  decided: {
    text: 'Sign-in runs through single sign-on on OAuth 2.0; access tokens live fifteen minutes.',
    sources: [`${WIKI}/entities/oauth2.md`, `${WIKI}/concepts/token-lebensdauer.md`],
  },
  open: {
    text: 'Whether sub-organisations inherit roles of their parent is still unanswered.',
    sources: [`${WIKI}/concepts/mandantentrennung.md`],
  },
  contradictions: {
    text: 'The old token concept names twelve hours, the current one fifteen minutes.',
    sources: [`${WIKI}/concepts/altes-token-konzept.md`, `${WIKI}/concepts/token-lebensdauer.md`],
  },
});

test.use({
  specId: 'module-legacy-overview',
  fakeProvider: { replies: { 'condense-module': REPLY } },
});

const hashOf = (page: Page): string => page.url().split('#')[1] ?? '';

/** Every file below `dir`, absolute. */
function filesBelow(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

test('a bullet-list overview reads, is found, and its first condensation loses nothing', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const overview = join(vaultPath, OVERVIEW);
  const home = `/knowledge?m=${MODULE}&p=${encodeURIComponent(OVERVIEW)}`;

  await test.step('legacy overview — the module view shows the bullet text', async () => {
    await page.evaluate(`location.hash = "#/knowledge?m=${MODULE}"`);
    await page.getByRole('button', { name: new RegExp(OVERVIEW_TITLE) }).click();
    await expect(page.locator('.sb-modulepage').getByText(TERM).first()).toBeVisible();
  });

  await test.step('legacy overview — search finds it and opens it in the module view', async () => {
    await page.evaluate(`location.hash = "#/search?q=${TERM}"`);
    const hit = page.locator('.sb-searchresult-main', {
      has: page.locator('.sb-searchresult-meta', { hasText: OVERVIEW }),
    });
    await expect(hit.first()).toBeVisible();
    await hit.first().click();
    await expect.poll(() => hashOf(page)).toBe(home);
    await expect(page.locator('.sb-modulepage').getByText(TERM).first()).toBeVisible();
  });

  appendFileSync(overview, LEGACY_SECTION);
  const before = readFileSync(overview);
  const text = before.toString('utf8');
  // Body lines only: the frontmatter is rewritten anyway, headings may survive as context.
  const oldLines = text
    .slice(text.indexOf('\n---\n', 4) + 5)
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.startsWith('#'))
    .map((line) => line.trim());

  await test.step('legacy overview — the first condensation shows every old line as removed', async () => {
    expect(oldLines).toContain(LEGACY_BULLET);
    await page.evaluate(`location.hash = "#/knowledge?m=${MODULE}&tab=condensed"`);
    await page.getByRole('button', { name: /^Condense (this module|again)$/ }).click();
    const removed = page.locator('.sb-condensediff .sb-condensediff-row--removed');
    await expect(removed.first()).toBeVisible();
    for (const line of oldLines) {
      await expect(removed.filter({ hasText: line }), line).not.toHaveCount(0);
    }
    expect(readFileSync(overview).equals(before)).toBe(true);
    expect(before.toString('utf8')).toContain(LEGACY_SECTION);
  });

  await test.step('legacy overview — accepting keeps the old file in the trash byte for byte', async () => {
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(page.locator('.sb-condensediff')).toHaveCount(0);
    await expect.poll(() => readFileSync(overview).equals(before)).toBe(false);

    const trash = join(vaultPath, '.secondbrain', 'trash');
    const snapshots = filesBelow(trash).filter((path) =>
      path.replace(/\\/g, '/').endsWith(OVERVIEW),
    );
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.some((path) => readFileSync(path).equals(before))).toBe(true);
  });
});
