/* Story 059, D5 — the full search result view: more than the command
 * palette's six hits, with snippets, scope/type filters, and a hit that opens
 * in the app instead of the OS editor. Mirrors the harness boilerplate of
 * `tests/e2e/reader.spec.ts` (D4): one app + one throwaway vault for this
 * whole file (`test.use({ specId })`), fixtures this spec needs and the seed
 * doesn't carry written straight into `vaultPath`, then waited for with
 * `expect.poll` on the actual search result — the live index only catches up
 * with a freshly written file once its watcher notices it, which is not
 * instant.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

test.use({ specId: 'search-results' });

/** Writes one Markdown fixture, creating parent folders as needed — the same
    idiom `reader.spec.ts` uses for its own single fixture. */
function writeDoc(vaultPath: string, relativePath: string, content: string): void {
  const full = join(vaultPath, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

// ── AC1 fixtures: three docs sharing one unique term, three scope/type combos ──

const SCOPE_TERM = 'gastonqueryterm059';
const WORK_PROJECT_PATH = 'projects/work/gaston-e2e-fixture-a/project.md';
const PRIVATE_PROJECT_PATH = 'projects/private/gaston-e2e-fixture-b/project.md';
const PRIVATE_AREA_PATH = 'areas/gaston-e2e-fixture.md';

function writeScopeFixtures(vaultPath: string): void {
  writeDoc(
    vaultPath,
    WORK_PROJECT_PATH,
    `---
type: project
title: Gaston fixture project work
slug: gaston-e2e-fixture-a
scope: work
status: active
---

## Status

${SCOPE_TERM} lives in the work-scope project fixture.
`,
  );
  writeDoc(
    vaultPath,
    PRIVATE_PROJECT_PATH,
    `---
type: project
title: Gaston fixture project private
slug: gaston-e2e-fixture-b
scope: private
status: active
---

## Status

${SCOPE_TERM} lives in the private-scope project fixture.
`,
  );
  writeDoc(
    vaultPath,
    PRIVATE_AREA_PATH,
    `---
type: area
title: Gaston fixture area
scope: private
created: 2026-01-01
---

## Notes

${SCOPE_TERM} lives in the area fixture too.
`,
  );
}

// ── AC3 fixtures: one document per home kind, each with its own unique term ──

const JOURNAL_TERM = 'gastonjournalhome059';
const JOURNAL_PATH = 'journal/2026/01/2026-01-25.md';
const JOURNAL_HOME = '/journal?d=2026-01-25';

const PROJECT_TERM = 'gastonprojecthome059';
const PROJECT_PATH = 'projects/work/gaston-home-fixture/project.md';
const PROJECT_HOME = '/projects?p=gaston-home-fixture';

const AREA_TERM = 'gastonareahome059';
const AREA_PATH = 'areas/gaston-home-fixture.md';
const AREA_HOME = '/notes?a=gaston-home-fixture';

/* Real seed data (`scripts/seed/module-identity-pages.mjs`) — reused rather
   than fabricated, the same reasoning `reader.spec.ts` gives for reusing the
   `identity-management` module: a fresh module would need its own catalog and
   log entries to be a faithful wiki page. */
const WIKI_TERM = 'Autorisierungsprotokoll';
const WIKI_PATH = 'modules/identity-management/wiki/entities/oauth2.md';
const WIKI_HOME = `/knowledge?m=identity-management&p=${encodeURIComponent(WIKI_PATH)}`;

/* Real seed data (`scripts/seed/projects.mjs`, `seedAreas`) — its Direktiven
   section carries a sentence found nowhere else in the seed vault. */
const CONDENSED_TERM = 'Finanz-Themen';
const CONDENSED_PATH = 'areas/gesundheit.condensed.md';
const CONDENSED_HOME = '/notes?a=gesundheit&tab=condensed';

function writeHomeFixtures(vaultPath: string): void {
  writeDoc(
    vaultPath,
    JOURNAL_PATH,
    `---
type: journal
title: Gaston fixture day
date: 2026-01-25
---

## Day

${JOURNAL_TERM} marks this entry for the search results test.
`,
  );
  writeDoc(
    vaultPath,
    PROJECT_PATH,
    `---
type: project
title: Gaston home fixture project
slug: gaston-home-fixture
scope: work
status: active
---

## Status

${PROJECT_TERM} marks this project for the search results test.
`,
  );
  writeDoc(
    vaultPath,
    AREA_PATH,
    `---
type: area
title: Gaston home fixture area
scope: private
created: 2026-01-01
---

## Notes

${AREA_TERM} marks this area for the search results test.
`,
  );
}

// ── AC4 fixture: a document with no dedicated home, for the external-open test ──

const EXTERNAL_TERM = 'gastonexternalfixture059';
const EXTERNAL_PATH = 'notes/gaston-external-fixture.md';

function writeExternalFixture(vaultPath: string): void {
  writeDoc(
    vaultPath,
    EXTERNAL_PATH,
    `---
type: note
title: Gaston external-open fixture
created: 2026-01-01
---

${EXTERNAL_TERM} marks this note for the open-externally test.
`,
  );
}

// ── Story 053 fixture: one long transcript matching the same term in five passages ──

const LONG_TERM = 'gastonpassageterm053';
const LONG_PATH = 'raw/youtube/gaston-e2e-long/transcript.md';

/** ~20k chars: twenty filler paragraphs, the term in five of them far apart —
    far enough that each lands in its own passage. */
function writeLongFixture(vaultPath: string): void {
  const filler = 'The speaker keeps talking about something else entirely here. '.repeat(15);
  const paragraphs = Array.from({ length: 20 }, (_, i) =>
    i % 4 === 1 ? `${LONG_TERM} comes up again. ${filler}` : filler,
  );
  writeDoc(
    vaultPath,
    LONG_PATH,
    `---
title: Gaston long transcript fixture
transcript_style: prose
---

# Gaston long transcript fixture — Transcript

${paragraphs.map((text) => text.trim()).join('\n\n')}
`,
  );
}

test.beforeAll(async ({ vaultPath }) => {
  writeScopeFixtures(vaultPath);
  writeHomeFixtures(vaultPath);
  writeExternalFixture(vaultPath);
  writeLongFixture(vaultPath);
});

/** Navigates straight to the results view — the address is the state, exactly
    as the route contract (`SearchScreen.tsx`) reads it. */
async function openSearch(page: Page, query: string): Promise<void> {
  const hash = `#/search?q=${encodeURIComponent(query)}`;
  await page.evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await page.locator('.sb-screen h1').first().waitFor({ state: 'visible', timeout: 8000 });
}

/** The row's own open button (not the external one), located by the vault
    path shown in its mono meta line — the same "find by path text" idiom
    `reader.spec.ts` uses for its wikilink/path buttons. Waits via
    `expect.poll` for the live index to have caught up with a just-written
    fixture, which is not instant. */
async function mainButtonFor(page: Page, path: string): Promise<Locator> {
  const button = page.locator('.sb-searchresult-main', {
    has: page.locator('.sb-searchresult-meta', { hasText: path }),
  });
  await expect.poll(() => button.count(), { timeout: 15000 }).toBeGreaterThan(0);
  return button.first();
}

test('the full result view shows snippets and narrows by scope and type', async ({ app }) => {
  const { page } = app;

  await test.step('search — three docs across scope and type, one shared term', async () => {
    await openSearch(page, SCOPE_TERM);
    await expect.poll(() => page.locator('.sb-searchresult').count(), { timeout: 15000 }).toBe(3);
  });

  await test.step('search — snippet renders the match as <strong>, not the accent color', async () => {
    const mark = page.locator('.sb-snippet-mark').first();
    await expect(mark).toBeVisible();
    // A string, not an arrow function: this project's test tsconfig carries no
    // `dom` lib, so a function body referencing `getComputedStyle` would not
    // typecheck — the same reason `reader.spec.ts` passes a string to
    // `page.evaluate` for `location.hash`.
    const color = await mark.evaluate('(el) => getComputedStyle(el).color');
    // The Gaston teal accent, #4FD1C5 (CLAUDE.md) — the mark must never be it.
    expect(color).not.toBe('rgb(79, 209, 197)');
  });

  await test.step('search — a scope filter narrows to the one matching document', async () => {
    await page.getByRole('button', { name: 'Work', exact: true }).click();
    await expect.poll(() => page.locator('.sb-searchresult').count()).toBe(1);
    await expect(
      page.locator('.sb-searchresult-meta', { hasText: WORK_PROJECT_PATH }),
    ).toBeVisible();
  });

  await test.step('search — a type-group filter narrows to both matching documents', async () => {
    await page.getByRole('button', { name: 'All', exact: true }).first().click();
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect.poll(() => page.locator('.sb-searchresult').count()).toBe(2);
    await expect(
      page.locator('.sb-searchresult-meta', { hasText: WORK_PROJECT_PATH }),
    ).toBeVisible();
    await expect(
      page.locator('.sb-searchresult-meta', { hasText: PRIVATE_PROJECT_PATH }),
    ).toBeVisible();
    await expect(page.locator('.sb-searchresult-meta', { hasText: PRIVATE_AREA_PATH })).toHaveCount(
      0,
    );
  });
});

test('a long document appears once in the results', async ({ app }) => {
  const { page } = app;

  await test.step('search — five matching passages of one file are one result row', async () => {
    await openSearch(page, LONG_TERM);
    await mainButtonFor(page, LONG_PATH);
    await expect.poll(() => page.locator('.sb-searchresult').count(), { timeout: 15000 }).toBe(1);
  });
});

test('hits with a home deep-link to it', async ({ app }) => {
  const { page } = app;

  const cases: { term: string; path: string; home: string }[] = [
    { term: JOURNAL_TERM, path: JOURNAL_PATH, home: JOURNAL_HOME },
    { term: PROJECT_TERM, path: PROJECT_PATH, home: PROJECT_HOME },
    { term: AREA_TERM, path: AREA_PATH, home: AREA_HOME },
    { term: WIKI_TERM, path: WIKI_PATH, home: WIKI_HOME },
    { term: CONDENSED_TERM, path: CONDENSED_PATH, home: CONDENSED_HOME },
  ];

  for (const { term, path, home } of cases) {
    await test.step(`search — ${path} opens at its real home, not the generic reader`, async () => {
      await openSearch(page, term);
      const button = await mainButtonFor(page, path);
      await button.click();
      await expect.poll(() => page.url().split('#')[1] ?? '').toBe(home);
    });
  }
});

/** The one field this spec's own `globalThis` patch below stashes calls
    into — mirrors `reader.spec.ts`'s own `OpenPathRecorder`. */
interface OpenPathRecorder {
  sbOpenPathCalls?: string[];
}

test('open externally is a secondary action, the default stays in the app', async ({ app }) => {
  const { page } = app;

  await test.step('search — patch shell.openPath in the main process to record calls', async () => {
    // Same approach `reader.spec.ts` uses and confirms works for this app:
    // `shell` is the one singleton `electron` hands out everywhere, and the
    // `shell:openPath` handler looks the method up fresh on every call.
    await app.app.evaluate(({ shell }) => {
      const store = globalThis as typeof globalThis & OpenPathRecorder;
      store.sbOpenPathCalls = [];
      const original = shell.openPath.bind(shell);
      shell.openPath = (path: string) => {
        store.sbOpenPathCalls?.push(path);
        return original(path);
      };
    });
  });

  const readsExternalCalls = () =>
    app.app.evaluate(
      () => (globalThis as typeof globalThis & OpenPathRecorder).sbOpenPathCalls ?? [],
    );

  await test.step('search — clicking the row opens it in the app, never the OS editor', async () => {
    await openSearch(page, EXTERNAL_TERM);
    const button = await mainButtonFor(page, EXTERNAL_PATH);
    await button.click();
    await expect
      .poll(() => page.url().split('#')[1] ?? '')
      .toBe(`/read?path=${encodeURIComponent(EXTERNAL_PATH)}`);
    expect(await readsExternalCalls()).toEqual([]);
  });

  await test.step('search — the external-open button is the one thing that calls shell.openPath', async () => {
    await openSearch(page, EXTERNAL_TERM);
    const row = page.locator('.sb-searchresult', {
      has: page.locator('.sb-searchresult-meta', { hasText: EXTERNAL_PATH }),
    });
    await expect.poll(() => row.count(), { timeout: 15000 }).toBeGreaterThan(0);
    const externalButton = row.locator('.sb-searchresult-external');
    await externalButton.click();

    await expect
      .poll(async () =>
        (await readsExternalCalls()).some((call) =>
          call.replace(/\\/g, '/').endsWith(EXTERNAL_PATH),
        ),
      )
      .toBe(true);
    // No navigation away from the results view: the click stayed a secondary action.
    expect(page.url().split('#')[1] ?? '').toBe(`/search?q=${encodeURIComponent(EXTERNAL_TERM)}`);
  });
});
