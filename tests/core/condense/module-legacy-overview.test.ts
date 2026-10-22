/* A module overview written before condensation existed — a bullet list with a
   `## Seiten` catalogue — is replaced whole by its first condensation; once an
   overview carries `condensed_at`, its hand-added sections survive every run. */

import { describe, expect, it } from 'vitest';
import { condenseModule, CONDENSE_MODULE_TASK } from '@core/condense/run-module';
import type { CondenseModuleProposal, CondenseModuleResult } from '@core/condense/run-module';
import { diffLines } from '@core/condense/diff';
import { moduleOverviewPath } from '@core/condense/paths';
import type { IndexedDoc } from '@core/index/types';
import { parse } from '@core/vault/frontmatter';
import { createFakeGateway } from '../../fakes/llm';
import { makeDoc } from '../index/fixtures';

const SLUG = 'identity-management';
const RBAC = `modules/${SLUG}/wiki/concepts/rbac.md`;
const GUIDE = `modules/${SLUG}/wiki/sources/s-2026-07-02-auth0-rbac-guide.md`;

const PREAMBLE = 'Alles zu Identität und Rollen in diesem Modul.';
const DECIDED_BULLETS = [
  '- Rollen werden pro Tenant vergeben.',
  '- Auth0 ist als Anbieter gesetzt.',
];
const PAGE_BULLETS = ['- [[rbac]] — RBAC', '- [[s-2026-07-02-auth0-rbac-guide]] — Auth0-Guide'];

/** The overview as the wiki ingest used to maintain it; `extra` adds frontmatter lines. */
function overview(extra: readonly string[] = []): string {
  return [
    '---',
    'type: overview',
    'title: Identity Management',
    `module: ${SLUG}`,
    ...extra,
    'review_cycle: 30',
    '---',
    '',
    PREAMBLE,
    '',
    '## Was entschieden ist',
    '',
    ...DECIDED_BULLETS,
    '',
    '## Seiten',
    '',
    ...PAGE_BULLETS,
    '',
    '## Direktiven',
    '',
    'Kundennamen nie nennen.',
    '',
  ].join('\n');
}

function page(path: string, type: string, body: string): IndexedDoc {
  return makeDoc({ path, docType: 'note', title: path, module: SLUG, frontmatter: { type }, body });
}

async function proposalFor(existing: string): Promise<CondenseModuleProposal> {
  const setup = createFakeGateway();
  setup.provider.setReply(
    CONDENSE_MODULE_TASK,
    JSON.stringify({
      decided: { text: 'Rollen pro Tenant.', sources: [RBAC] },
      open: { text: 'Token-Laufzeit offen.', sources: [GUIDE] },
      contradictions: { text: '', sources: [] },
    }),
  );
  const docs = [
    page(moduleOverviewPath(SLUG), 'overview', existing),
    page(RBAC, 'concept', 'Rollen werden pro Tenant vergeben.'),
    page(GUIDE, 'source', 'Der Guide nennt eine Token-Laufzeit von einer Stunde.'),
  ];
  const result: CondenseModuleResult = await condenseModule(
    { docs, gateway: setup.gateway, existing, now: '2026-08-10' },
    SLUG,
  );
  expect(result.kind).toBe('proposal');
  return result as CondenseModuleProposal;
}

describe('the first condensation of a module overview', () => {
  it('a bullet-list overview without condensed_at is replaced whole — every old bullet is a removal', async () => {
    const before = overview();

    const proposal = await proposalFor(before);

    const removed = diffLines(before, proposal.content)
      .rows.filter((row) => row.kind === 'removed')
      .map((row) => row.text);
    for (const bullet of [...DECIDED_BULLETS, ...PAGE_BULLETS]) {
      expect(removed).toContain(bullet);
      expect(proposal.content).not.toContain(bullet);
    }
    expect(proposal.content).not.toContain(PREAMBLE);
    expect(proposal.content).not.toContain('## Seiten');

    // what belongs to the human survives the replacement
    const { frontmatter, body } = parse(proposal.content);
    expect(frontmatter['review_cycle']).toBe(30);
    expect(frontmatter['module']).toBe(SLUG);
    expect(body).toContain('## Direktiven\n\nKundennamen nie nennen.');
  });

  it('a condensed overview keeps its hand-added sections on the next run', async () => {
    const before = overview(['condensed_at: 2026-08-01T09:15:00+02:00']);

    const proposal = await proposalFor(before);

    expect(proposal.content).toContain(`## Seiten\n\n${PAGE_BULLETS.join('\n')}`);
    expect(proposal.content).toContain(PREAMBLE);
    expect(parse(proposal.content).frontmatter['review_cycle']).toBe(30);
    // the machine section is still rewritten from the reply, not carried over
    for (const bullet of DECIDED_BULLETS) expect(proposal.content).not.toContain(bullet);
  });
});
