/* A module's overview as a condensation: found through maintenance, proposed as
   a diff, and written only when the person accepts it. The fake provider answers
   `condense-module` with a reply that cites real pages of the seeded module, so
   the whole path — queue, run, citation check, diff, hash-guarded write — is the
   shipped one; only the model's words are scripted. */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

const MODULE = 'second-brain-methodik';
const MODULE_TITLE = 'Second-Brain-Methodik';
const WIKI = `modules/${MODULE}/wiki`;

const CITED = {
  decided: [`${WIKI}/concepts/belegpflicht.md`, `${WIKI}/concepts/verdichtung-statt-sammeln.md`],
  open: [`${WIKI}/concepts/wissensverfall.md`],
  contradictions: [`${WIKI}/entities/para-methode.md`, `${WIKI}/entities/zettelkasten.md`],
};

const REPLY = JSON.stringify({
  decided: {
    text: 'Every claim carries its source page; two kept sentences per source, otherwise no page.',
    sources: CITED.decided,
  },
  open: {
    text: 'How quickly a collection decays without regular upkeep is not settled.',
    sources: CITED.open,
  },
  contradictions: {
    text: 'PARA is called sufficient for knowledge on one page and weak for it on another.',
    sources: CITED.contradictions,
  },
});

test.use({ specId: 'module-condense', fakeProvider: { replies: { 'condense-module': REPLY } } });

const hashOf = (page: Page): string => page.url().split('#')[1] ?? '';

/** Task rows for one subject label — the helper the other task specs use. */
function rowsFor(page: Page, label: string): Locator {
  return page
    .locator('.sb-trow')
    .filter({ has: page.locator('.sb-trow-subject', { hasText: label }) });
}

/** Every `.md` file below `dir`, as paths relative to `root`, forward slashes. */
function markdownFiles(root: string, dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return markdownFiles(root, path);
    return entry.name.endsWith('.md') ? [relative(root, join(root, path)).replace(/\\/g, '/')] : [];
  });
}

/** The module's pages the way a condensation counts them: everything in its wiki
    except the overview itself, the catalogue and the chronicle. */
function modulePages(vault: string): string[] {
  const own = new Set([`${WIKI}/overview.md`, `${WIKI}/index.md`, `${WIKI}/log.md`]);
  return markdownFiles(vault, WIKI).filter((path) => !own.has(path));
}

test('maintenance says a module’s condensation is due and opens its module view', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const overview = join(vaultPath, WIKI, 'overview.md');
  const before = readFileSync(overview);

  await test.step('maintenance — run a check', async () => {
    await page.locator('.sb-rail a[href="#/garden"]').click();
    await expect.poll(() => hashOf(page)).toBe('/garden');
    await page
      .getByRole('button', { name: /^Check (now|again)$/ })
      .first()
      .click();
  });

  const finding = page.locator('.sb-finding').filter({
    has: page.getByRole('heading', { name: new RegExp(`module "${MODULE}"`) }),
  });

  await test.step('maintenance — the module’s condensation is listed as due', async () => {
    await expect(finding).toBeVisible({ timeout: 30_000 });
    await expect(finding).toContainText(`${WIKI}/overview.md`);
  });

  await test.step('maintenance — the overview opens the module’s condensed tab', async () => {
    await finding.getByRole('button', { name: `Open “${WIKI}/overview.md”` }).click();
    await expect.poll(() => hashOf(page)).toBe(`/knowledge?m=${MODULE}&tab=condensed`);
    await expect(page.getByRole('tab', { name: 'Condensed', selected: true })).toBeVisible();
  });

  await test.step('maintenance — the overview was only looked at', async () => {
    expect(readFileSync(overview).equals(before)).toBe(true);
  });
});

test('a module condensation is proposed as a diff, rejected with a reason, refused on a stale file and accepted', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const overview = join(vaultPath, WIKI, 'overview.md');
  const read = (): string => readFileSync(overview, 'utf8');
  const original = read();
  const REASON = 'Name the pages each decision rests on.';
  const condense = page.getByRole('button', { name: /^Condense (this module|again)$/ });
  const diff = page.locator('.sb-condensediff');
  const dialog = page.getByRole('dialog');

  const openCondensedTab = async (): Promise<void> => {
    await page.evaluate(`location.hash = "#/knowledge?m=${MODULE}&tab=condensed"`);
    await expect(page.getByRole('tab', { name: 'Condensed', selected: true })).toBeVisible();
  };
  const openTasks = async (): Promise<void> => {
    await page.locator('.sb-rail a[href="#/tasks"]').click();
    await expect.poll(() => hashOf(page)).toBe('/tasks');
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();
  };

  await test.step('queue — nothing is condensing before the click, one task after it', async () => {
    await openTasks();
    await expect(rowsFor(page, MODULE_TITLE)).toHaveCount(0);
    await openCondensedTab();
    await condense.click();
    await expect(diff).toBeVisible();
    await openTasks();
    await expect(rowsFor(page, MODULE_TITLE)).toHaveCount(1);
    await openCondensedTab();
  });

  await test.step('proposal — the diff shows what goes and what comes, and nothing is written', async () => {
    await expect(diff).toBeVisible();
    const removed = diff.locator('.sb-condensediff-row--removed');
    const added = diff.locator('.sb-condensediff-row--added');
    expect(await removed.count()).toBeGreaterThan(0);
    expect(await added.count()).toBeGreaterThan(0);
    // The seeded overview's recorded sources are replaced by the module's pages.
    await expect(
      removed.filter({ hasText: /s-\d{4}-\d{2}-\d{2}-ai-second-brain-rotting/ }),
    ).not.toHaveCount(0);
    await expect(added.filter({ hasText: CITED.decided[0] as string })).not.toHaveCount(0);
    expect(read()).toBe(original);
  });

  await test.step('reject — a reason is required, and only the directive line lands', async () => {
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    const submit = dialog.getByRole('button', { name: 'Reject', exact: true });
    await expect(submit).toBeDisabled();
    expect(read()).toBe(original);
    await dialog.getByLabel('Reason').fill(REASON);
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(diff).toHaveCount(0);

    const rejected = read();
    // Everything that was there stays byte for byte; the addition is the directives heading and the reason.
    expect(rejected.startsWith(original.trimEnd())).toBe(true);
    const added = rejected
      .slice(original.trimEnd().length)
      .split('\n')
      .filter((line) => line.trim().length > 0);
    expect(added).toHaveLength(2);
    expect(added[0]).toMatch(/^## (Direktiven|Directives)$/);
    expect(added[1]).toBe(REASON);
  });

  await test.step('stale — an edit made on disk after the proposal wins over Accept', async () => {
    await condense.click();
    await expect(diff).toBeVisible();
    const edited = `${read().trimEnd()}\n\nAdded in another editor.\n`;
    writeFileSync(overview, edited, 'utf8');
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(page.getByText(/changed since this proposal was made/)).toBeVisible();
    await expect(diff).toHaveCount(0);
    expect(read()).toBe(edited);
  });

  const beforeAccept = read();

  await test.step('accept — the proposal is written as the module’s overview', async () => {
    await condense.click();
    await expect(diff).toBeVisible();
    expect(read()).toBe(beforeAccept);
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(diff).toHaveCount(0);
    await expect.poll(read).not.toBe(beforeAccept);
  });

  await test.step('accept — frontmatter, headings, source lines and the human parts', async () => {
    const written = read();
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(written)?.[1] ?? '';
    expect(frontmatter).toMatch(/^condensed_at: \S+/m);
    expect(frontmatter).toMatch(new RegExp(`^module: ${MODULE}$`, 'm'));
    for (const path of modulePages(vaultPath)) expect(frontmatter).toContain(path);

    const body = written.slice(written.indexOf('\n---\n', 4) + 5);
    const sectionOf = (heading: string): string =>
      body.split(/^## /m).find((part) => part.startsWith(`${heading}\n`)) ?? '';
    const cited = [
      ['Entschieden', CITED.decided],
      ['Offen', CITED.open],
      ['Widersprüche', CITED.contradictions],
    ] as const;
    for (const [heading, paths] of cited) {
      const section = sectionOf(heading);
      expect(section, `section ${heading}`).not.toBe('');
      const sourceLine = section.split('\n').find((line) => line.startsWith('Aus: '));
      expect(sourceLine, `source line of ${heading}`).toBe(`Aus: ${paths.join(', ')}`);
    }
    expect(body).toContain(REASON);
    expect(sectionOf('Direktiven')).toContain(REASON);
  });

  await test.step('accept — the previous file is in the trash and no delete is offered', async () => {
    const trash = join(vaultPath, '.secondbrain', 'trash');
    expect(existsSync(trash)).toBe(true);
    const kept = markdownFiles(vaultPath, '.secondbrain/trash')
      .filter((path) => path.endsWith(`${WIKI}/overview.md`))
      .map((path) => readFileSync(join(vaultPath, path), 'utf8'));
    expect(kept).toContain(beforeAccept);
    // The module view has its own "Delete module"; the condensed panel itself offers none.
    const panel = page.locator('.sb-condensed');
    await expect(panel.getByText('Condensed ', { exact: false }).first()).toBeVisible();
    await expect(panel.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
  });
});
