/* A module's condensation handed to the agent. The vault has no model, so the hand-over is the
   only way to a proposal. The agent is simulated by writing its result file in the job format
   while the app stays open: what it answers goes through the same attribution check as an in-app
   run, becomes the same diff, and is written only on Accept. */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { parse } from '../../src/core/vault/frontmatter';
import { expect, test } from './fixtures/app';

test.use({ specId: 'module-condense-agent' });

const MODULE = 'second-brain-methodik';
const WIKI = `modules/${MODULE}/wiki`;
const OUTSIDE = 'wiki/sources/x.md';

const agentDir = (vault: string, dir: string): string => join(vault, '.secondbrain', 'agent', dir);

function jobFiles(vault: string): string[] {
  try {
    return readdirSync(agentDir(vault, 'jobs')).filter((name) => name.endsWith('.md'));
  } catch {
    return [];
  }
}

/** The one job file of this hand-over, as its id and the pages it lists as readable. */
function openJob(vault: string, known: readonly string[]): { id: string; inputs: string[] } {
  const name = jobFiles(vault).find((file) => !known.includes(file)) ?? '';
  const raw = readFileSync(join(agentDir(vault, 'jobs'), name), 'utf8');
  return { id: name.replace(/\.md$/, ''), inputs: parse(raw).frontmatter['inputs'] as string[] };
}

function writeResult(vault: string, id: string, reply: object): void {
  mkdirSync(agentDir(vault, 'results'), { recursive: true });
  const body = ['```json', JSON.stringify(reply, null, 2), '```', ''].join('\n');
  writeFileSync(
    join(agentDir(vault, 'results'), `${id}.md`),
    `---\njob: ${id}\nstatus: done\n---\n\n${body}`,
  );
}

/** The replies cite the module's seeded pages, picked from what the job lists. */
function pageOf(inputs: readonly string[], name: string): string {
  const path = inputs.find((input) => input === `${WIKI}/${name}`);
  expect(path, `job lists ${name}`).toBeDefined();
  return path as string;
}

function replyCiting(decided: string[], open: string[], contradictions: string[]): object {
  return {
    decided: { text: 'Every claim carries its source page.', sources: decided },
    open: { text: 'How fast a collection decays is not settled.', sources: open },
    contradictions: { text: 'PARA is called sufficient and weak.', sources: contradictions },
  };
}

async function openCondensedTab(page: Page): Promise<void> {
  await page.evaluate(`location.hash = "#/knowledge?m=${MODULE}&tab=condensed"`);
  await expect(page.getByRole('tab', { name: 'Condensed', selected: true })).toBeVisible();
}

function panelParts(page: Page): { hand: Locator; condense: Locator; withAgent: Locator } {
  return {
    hand: page.getByTestId(`hand-condense-${MODULE}`),
    // With no model the panel offers no Condense at all; the locator proves it stays that way.
    condense: page.getByRole('button', { name: /^Condense (this module|again)$/ }),
    withAgent: page.getByText("This module's condensation is with the agent."),
  };
}

test('with no model a module’s condensation is handed to the agent once and its result is accepted as a diff', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const overview = join(vaultPath, WIKI, 'overview.md');
  const original = readFileSync(overview, 'utf8');
  const { hand, condense, withAgent } = panelParts(page);
  const diff = page.locator('.sb-condensediff');
  const known = jobFiles(vaultPath);

  await test.step('no model — the note and the hand-over are offered, Condense is not', async () => {
    await openCondensedTab(page);
    await expect(hand).toBeVisible();
    await expect(hand).toHaveText('Hand to agent');
    await expect(condense).toHaveCount(0);
  });

  await test.step('one click files exactly one job and the panel says who has it', async () => {
    await hand.click();
    await expect(withAgent).toBeVisible();
    await expect(hand).toBeDisabled();
    await expect(hand).toHaveText('With the agent');
    expect(jobFiles(vaultPath).filter((name) => !known.includes(name))).toHaveLength(1);
    expect(readFileSync(overview, 'utf8')).toBe(original);
  });

  const job = openJob(vaultPath, known);

  await test.step('the agent answers — the proposal is a diff and nothing is written yet', async () => {
    writeResult(
      vaultPath,
      job.id,
      replyCiting(
        [pageOf(job.inputs, 'concepts/belegpflicht.md')],
        [pageOf(job.inputs, 'concepts/wissensverfall.md')],
        [pageOf(job.inputs, 'entities/para-methode.md')],
      ),
    );
    await expect(diff).toBeVisible();
    await expect(diff.locator('.sb-condensediff-row--removed')).not.toHaveCount(0);
    await expect(diff.locator('.sb-condensediff-row--added')).not.toHaveCount(0);
    expect(readFileSync(overview, 'utf8')).toBe(original);
    await expect(withAgent).toHaveCount(0);
  });

  await test.step('accept — the overview is condensed and the previous file is in the trash', async () => {
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(diff).toHaveCount(0);
    await expect.poll(() => readFileSync(overview, 'utf8')).not.toBe(original);

    const written = readFileSync(overview, 'utf8');
    expect(/^---\n([\s\S]*?)\n---\n/.exec(written)?.[1]).toMatch(/^condensed_at: \S+/m);
    for (const heading of ['Entschieden', 'Offen', 'Widersprüche']) {
      expect(written).toMatch(new RegExp(`^## ${heading}$`, 'm'));
    }

    const trash = join(vaultPath, '.secondbrain', 'trash');
    const kept = readdirSync(trash, { recursive: true, encoding: 'utf8' })
      .filter((path) => path.replace(/\\/g, '/').endsWith(`${WIKI}/overview.md`))
      .map((path) => readFileSync(join(trash, path), 'utf8'));
    expect(kept).toContain(original);
  });
});

test('an agent result citing a page outside the module fails with its reason and offers no diff', async ({
  app,
  vaultPath,
}) => {
  const { page } = app;
  const overview = join(vaultPath, WIKI, 'overview.md');
  const before = readFileSync(overview);
  const { hand, withAgent } = panelParts(page);
  const known = jobFiles(vaultPath);

  await test.step('the module is handed over again', async () => {
    await openCondensedTab(page);
    await expect(hand).toHaveText('Hand to agent');
    await expect(hand).toBeEnabled();
    await hand.click();
    await expect(withAgent).toBeVisible();
  });

  const job = openJob(vaultPath, known);

  await test.step('a result citing another module’s page fails and names the path', async () => {
    const own = pageOf(job.inputs, 'concepts/belegpflicht.md');
    writeResult(vaultPath, job.id, replyCiting([OUTSIDE], [own], [own]));

    await expect(page.getByText(new RegExp(`Reason:.*${OUTSIDE}`))).toBeVisible();
    await expect(page.locator('.sb-condensediff')).toHaveCount(0);
    await expect(withAgent).toHaveCount(0);
    expect(readFileSync(overview).equals(before)).toBe(true);
  });

  await test.step('the hand-over is offered again', async () => {
    await expect(hand).toHaveText('Hand to agent');
    await expect(hand).toBeEnabled();
  });
});
