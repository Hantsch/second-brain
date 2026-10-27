/* The agent's proposals as the user meets them: files written into
   `.secondbrain/agent/proposals/` while Gaston is open show up in maintenance, and only
   an accept on a current, valid proposal ever touches the target. */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/app';

test.use({ specId: 'agent-proposals' });

const RECHNUNG = 'projects/work/rechnungsautomatisierung/project.md';
const KUNDENPORTAL = 'projects/work/kundenportal-relaunch/project.md';
const ORBIT = 'projects/work/orbit-sso-migration/project.md';

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/* The proposal is written byte-for-byte as an agent would: frontmatter, then the content. */
function writeProposal(
  vault: string,
  name: string,
  fields: Record<string, string | undefined>,
  content: string,
): void {
  const dir = join(vault, '.secondbrain', 'agent', 'proposals');
  mkdirSync(dir, { recursive: true });
  const lines = Object.entries({
    gaston: 'proposal',
    version: '1',
    kind: 'edit',
    run: '2026-10-27T09:12:00.000Z',
    ...fields,
  })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`);
  writeFileSync(join(dir, `${name}.md`), `---\n${lines.join('\n')}\n---\n${content}`);
}

function editProposal(vault: string, name: string, target: string, reason: string): string {
  const current = readFileSync(join(vault, target));
  const content = `${current.toString('utf8')}\n${reason}\n`;
  writeProposal(vault, name, { target, base_hash: sha256(current), reason }, content);
  return content;
}

async function openMaintenance(page: Page): Promise<void> {
  await page.locator('.sb-rail a[href="#/garden"]').click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/garden');
}

/* The rail badge on the maintenance entry; absent while no proposal waits. */
function gardenBadge(page: Page): Locator {
  return page.locator('.sb-rail a[href="#/garden"] .sb-rail-count');
}

function card(page: Page, text: string): Locator {
  return page.locator('.sb-finding').filter({ hasText: text });
}

test('a proposal written while Gaston is open waits in maintenance and is accepted with an undo copy', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const reason = 'Invoice automation moves to the November batch.';
  const content = editProposal(vaultPath, '20261027-091200-invoice', RECHNUNG, reason);

  await openMaintenance(page);
  const proposal = card(page, reason);

  await test.step('a proposal written while Gaston is open waits in maintenance with its diff', async () => {
    await expect(proposal).toHaveCount(1);
    await expect(proposal.locator('.sb-finding-title')).toHaveText(RECHNUNG);
    await expect(proposal.locator('.sb-condensediff-row--added', { hasText: reason })).toHaveCount(
      1,
    );
  });

  await test.step('accepting writes the target, offers undo and leaves an undo copy', async () => {
    await proposal.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(page.locator('.sb-undostrip')).toContainText(RECHNUNG);
    await expect(proposal).toHaveCount(0);

    expect(readFileSync(join(vaultPath, RECHNUNG), 'utf8')).toBe(content);
    const trash = join(vaultPath, '.secondbrain', 'trash');
    const journals = readdirSync(trash).filter((entry) =>
      existsSync(join(trash, entry, 'gardener.json')),
    );
    expect(journals.length).toBeGreaterThan(0);
    expect(readdirSync(join(vaultPath, '.secondbrain', 'agent', 'resolved'))).toContain(
      '20261027-091200-invoice.md',
    );
  });
});

test('a stale, a rejected and an invalid proposal leave their targets unchanged', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const staleReason = 'Portal relaunch gets a new date.';
  const rejectReason = 'SSO migration is blocked on the vendor.';
  editProposal(vaultPath, '20261027-100000-stale', KUNDENPORTAL, staleReason);
  editProposal(vaultPath, '20261027-100100-reject', ORBIT, rejectReason);
  const orbitBefore = readFileSync(join(vaultPath, ORBIT));
  const body = 'Content that must never land.\n';
  writeProposal(
    vaultPath,
    '20261027-100200-journal',
    { target: 'journal/2026-10-01.md', base_hash: 'a'.repeat(64), reason: 'Tidy the journal.' },
    body,
  );
  writeProposal(
    vaultPath,
    '20261027-100300-no-reason',
    { target: ORBIT, base_hash: sha256(orbitBefore) },
    body,
  );

  await openMaintenance(page);

  await test.step('a target edited after the agent read it keeps the edit and says so', async () => {
    const stale = card(page, staleReason);
    await expect(stale).toHaveCount(1);
    const edited = `${readFileSync(join(vaultPath, KUNDENPORTAL), 'utf8')}\nEdited by hand.\n`;
    writeFileSync(join(vaultPath, KUNDENPORTAL), edited);
    await stale.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(stale).toContainText('Changed since the agent read it. Nothing was written.');
    await expect(stale.getByRole('button', { name: 'Reject', exact: true })).toBeVisible();
    expect(readFileSync(join(vaultPath, KUNDENPORTAL), 'utf8')).toBe(edited);
  });

  await test.step('a rejected proposal disappears and its target is byte-identical', async () => {
    const rejected = card(page, rejectReason);
    await rejected.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(rejected).toHaveCount(0);
    expect(readFileSync(join(vaultPath, ORBIT)).equals(orbitBefore)).toBe(true);
    expect(readdirSync(join(vaultPath, '.secondbrain', 'agent', 'resolved'))).toContain(
      '20261027-100100-reject.md',
    );
  });

  await test.step('invalid proposals show their reasons and offer only Reject', async () => {
    const journal = card(page, '20261027-100200-journal.md');
    await expect(journal).toContainText('Proposals cannot change journal/2026-10-01.md.');
    const noReason = card(page, '20261027-100300-no-reason.md');
    await expect(noReason).toContainText('The proposal is missing the field reason.');
    for (const invalid of [journal, noReason]) {
      await expect(invalid.getByRole('button', { name: 'Accept' })).toHaveCount(0);
      await expect(invalid.getByRole('button', { name: 'Reject', exact: true })).toBeVisible();
    }
    expect(readFileSync(join(vaultPath, ORBIT)).equals(orbitBefore)).toBe(true);
  });
});

test('the maintenance rail counts waiting proposals', async ({ app, vaultPath }) => {
  const { page } = app;
  /* Other tests in this spec leave proposals behind; this one counts from a clean slate. */
  const dir = join(vaultPath, '.secondbrain', 'agent', 'proposals');
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir)) rmSync(join(dir, entry));
  const firstReason = 'The rail counts the first proposal.';
  /* No colon in a reason: it is a plain YAML scalar in the frontmatter. */
  const secondReason = 'The rail counts the second proposal.';

  await test.step('the rail badge follows each proposal that arrives', async () => {
    editProposal(vaultPath, '20261027-110000-rail-first', RECHNUNG, firstReason);
    await expect(gardenBadge(page)).toHaveText('1');
    editProposal(vaultPath, '20261027-110100-rail-second', KUNDENPORTAL, secondReason);
    await expect(gardenBadge(page)).toHaveText('2');
  });

  await test.step('rejecting a proposal lowers the badge', async () => {
    await openMaintenance(page);
    const rejected = card(page, secondReason);
    await rejected.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(rejected).toHaveCount(0);
    await expect(gardenBadge(page)).toHaveText('1');
  });
});
