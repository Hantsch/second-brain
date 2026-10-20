/* Story 059, D4 — the generic reading view: where any vault document with no
 * dedicated home (`src/renderer/lib/doc-home.ts`'s fallback) opens.
 *
 * The fixture lives at `projects/work/orbit-sso-migration/notes/…` — exactly
 * the "project note" case `doc-home.test.ts` already names as one of
 * `homeOf`'s fallback examples (`docs/VAULT-FORMAT.md`: `notes/` under a
 * project is "optional long-form notes", never the project's own home). The
 * project itself (`orbit-sso-migration`) is real seed data
 * (`scripts/seed/projects.mjs`), so the fixture's wikilink and vault-path
 * reference can point at other real, already-indexed documents
 * (`modules/identity-management/wiki/entities/oauth2.md` and the project file
 * itself) without needing the index to catch up on the fixture file's own
 * existence first: `search:resolveLinks` resolves *targets*, and both of
 * those targets were already in the index before this spec ever wrote a
 * byte — only `vault:read` (a plain filesystem read, not index-backed) needs
 * the fixture file to exist, and that is true the moment `writeFileSync`
 * returns.
 *
 * Reached by setting `location.hash` directly (`#/read?path=…`), the same
 * technique `task-run-failure.spec.ts`/`task-no-model.spec.ts` already use
 * for a deep-linked address — search/palette wiring into this reader lands
 * in later deliverables (D5/D6) of this story, so direct navigation is the
 * accepted way in here for now.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

test.use({ specId: 'reader' });

const FIXTURE_PATH = 'projects/work/orbit-sso-migration/notes/reader-fixture-059.md';

/* A real page in the seeded `identity-management` module
   (`scripts/seed/module-identity-pages.mjs`) and the real project file this
   fixture's own note lives under (`scripts/seed/projects.mjs`) — two
   different reference *forms* (a `[[module/slug]]` wikilink and a plain
   vault path), two different resolved homes, so a click on each can be told
   apart by where it lands. */
const WIKILINK_TARGET = 'identity-management/oauth2';
const WIKILINK_HOME =
  '/knowledge?m=identity-management&p=' +
  encodeURIComponent('modules/identity-management/wiki/entities/oauth2.md');
const RAW_PATH_TARGET = 'projects/work/orbit-sso-migration/project.md';
const RAW_PATH_HOME = '/projects?p=orbit-sso-migration';

const FIXTURE_BODY = `---
type: note
title: Reader fixture
created: 2026-01-01
updated: 2026-01-02
status: active
scope: work
tags: [fixture, reader-059]
---

This is the reader fixture body for story 059.

Background: [[${WIKILINK_TARGET}]] explains the OAuth flow this note leans on.

See also ${RAW_PATH_TARGET} for the related project.
`;

function writeFixture(vaultPath: string): void {
  const full = join(vaultPath, FIXTURE_PATH);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, FIXTURE_BODY, 'utf8');
}

/** Direct navigation to the reader — the address is the state, exactly as
    `homeOf()` produces it, so this is also what a real "open" click would
    have landed on. Waits for the document's own heading, not just any `h1`:
    the not-found state renders no `.sb-pageview` at all. */
async function openReader(page: Page, path: string = FIXTURE_PATH): Promise<void> {
  const hash = `#/read?path=${encodeURIComponent(path)}`;
  /* A string, not an arrow function: this project's test tsconfig carries no
     `dom` lib, so a function body referencing `window` would not typecheck —
     the same reason `task-run-failure.spec.ts` passes a string here too. */
  await page.evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await page.locator('.sb-pageview h1').first().waitFor({ state: 'visible', timeout: 8000 });
}

test.beforeEach(async ({ app, vaultPath }) => {
  writeFixture(vaultPath);
  await openReader(app.page);
});

test('a hit without a home opens rendered, with facts instead of raw frontmatter', async ({
  app,
}) => {
  const { page } = app;
  const view = page.locator('.sb-pageview');

  await test.step('reader — title renders and takes focus (AC6)', async () => {
    const heading = view.getByRole('heading', { level: 1, name: 'Reader fixture' });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(view.locator('.sb-mono', { hasText: FIXTURE_PATH })).toBeVisible();
  });

  await test.step('reader — the facts row shows real frontmatter values', async () => {
    await expect(view.getByText('active', { exact: true })).toBeVisible();
    await expect(view.getByText('reader-059', { exact: true })).toBeVisible();
  });

  await test.step('reader — no raw frontmatter dump anywhere in the rendered view', async () => {
    // The whole point of AC2: no raw frontmatter delimiter or `key: value`
    // line anywhere in the rendered view — only the facts row's own markup.
    const text = await view.innerText();
    expect(text).not.toContain('---');
    expect(text).not.toMatch(/type:\s*note/);
  });
});

test('a wikilink and a vault path in the reader navigate in-app', async ({ app }) => {
  const { page } = app;

  await test.step('reader — a [[module/slug]] wikilink opens its wiki page in-app', async () => {
    await page.getByRole('button', { name: `Open page ${WIKILINK_TARGET}` }).click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe(WIKILINK_HOME);
  });

  await test.step('reader — a plain vault path opens its project in-app', async () => {
    await openReader(page);
    await page.getByRole('button', { name: `Open page ${RAW_PATH_TARGET}` }).click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe(RAW_PATH_HOME);
  });
});

/** The one field this spec's own `globalThis` patch below stashes calls
    into — named so the two `evaluate` calls agree on its shape without a
    shared `any`. */
interface OpenPathRecorder {
  sbOpenPathCalls?: string[];
}

test('the reader offers open externally', async ({ app }) => {
  const { page } = app;

  await test.step('reader — patch shell.openPath in the main process to record calls', async () => {
    /* `shell` is the one singleton object `electron` hands out everywhere
       (`import { shell } from 'electron'`), and `src/main/ipc/shell.ts`'s
       handler looks the method up on it fresh on every call rather than
       capturing a bound reference at import time — so mutating the property
       here is visible to that later call. If this ever stops being
       observable (e.g. a bundler start binding the method eagerly), the
       fallback is a renderer-level test asserting the button calls
       `api.shell.openPath(path)` directly (mocked-bridge pattern,
       `tests/renderer/mock-bridge.ts`) — not deleting this coverage. */
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

  await test.step('reader — "open externally" is visible, operable, and calls shell.openPath', async () => {
    const button = page.getByRole('button', { name: 'Open externally' });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    await button.click();

    // `shell:openPath`'s handler resolves the vault-relative path to an
    // absolute one before ever calling `shell.openPath` (`resolvePath` in
    // `src/main/ipc/shell.ts`) — the call is real, but its argument is the
    // full filesystem path, not the string this spec passed to the reader.
    await expect
      .poll(async () => {
        const calls = await app.app.evaluate(
          () => (globalThis as typeof globalThis & OpenPathRecorder).sbOpenPathCalls,
        );
        return (calls ?? []).some((call) => call.replace(/\\/g, '/').endsWith(FIXTURE_PATH));
      })
      .toBe(true);
  });
});
