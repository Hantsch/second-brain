/* An agent's module condensation result goes through the same composition and the same
   attribution check as an in-app run, against the overview and the pages as they were
   handed over. */

import { describe, expect, it } from 'vitest';
import {
  condenseModuleJobPayload,
  validateCondenseModuleResult,
  type CondenseModuleCheck,
  type CondenseModuleResultInput,
} from '@core/agent/job-condense-module';
import { condenseModule, CONDENSE_MODULE_TASK } from '@core/condense/run-module';
import { moduleOverviewPath } from '@core/condense/paths';
import type { IndexedDoc } from '@core/index/types';
import { parse } from '@core/vault/frontmatter';
import { sha256 } from '@core/vault/hash';
import type { CondenseProposal } from '@shared/types';
import { createFakeGateway } from '../../fakes/llm';
import { makeDoc } from '../index/fixtures';

const SLUG = 'identity-management';
const NOW = '2026-08-10';
const RBAC = `modules/${SLUG}/wiki/concepts/rbac.md`;
const GUIDE = `modules/${SLUG}/wiki/sources/s-2026-07-02-auth0-rbac-guide.md`;
const LATER = `modules/${SLUG}/wiki/concepts/sso.md`;
const FOREIGN = 'modules/other/wiki/concepts/x.md';
const OVERVIEW = moduleOverviewPath(SLUG);
const EXISTING = '---\ntype: overview\ntitle: Identity\n---\n\n## Seiten\n\n- [[rbac]]\n';

function page(path: string, type: string, body: string, module = SLUG): IndexedDoc {
  return makeDoc({ path, docType: 'note', title: path, module, frontmatter: { type }, body });
}

function docs(): IndexedDoc[] {
  return [
    page(OVERVIEW, 'overview', '## Seiten\n'),
    page(RBAC, 'concept', 'Rollen werden pro Tenant vergeben.'),
    page(GUIDE, 'source', 'Der Guide nennt eine Token-Laufzeit von einer Stunde.'),
    page(FOREIGN, 'concept', 'Fremd.', 'other'),
  ];
}

type Section = { text: string; sources: string[] };

function reply(patch: Record<string, Section | undefined> = {}): Record<string, unknown> {
  return {
    decided: { text: 'Rollen pro Tenant.', sources: [RBAC] },
    open: { text: 'Token-Laufzeit offen.', sources: [GUIDE] },
    contradictions: { text: '', sources: [] },
    ...patch,
  };
}

function resultBody(json: Record<string, unknown>): string {
  return `Condensed the module.\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n`;
}

function check(patch: Partial<CondenseModuleResultInput> = {}): CondenseModuleCheck {
  return validateCondenseModuleResult({
    job: condenseModuleJobPayload(docs(), SLUG, EXISTING),
    resultBody: resultBody(reply()),
    docs: docs(),
    existing: EXISTING,
    docLanguage: 'de',
    now: NOW,
    ...patch,
  });
}

function asProposal(result: CondenseModuleCheck): CondenseProposal {
  expect(result.kind).toBe('proposal');
  return (result as { proposal: CondenseProposal }).proposal;
}

function reasonOf(result: CondenseModuleCheck): string {
  expect(result.kind).toBe('failed');
  return (result as { reason: string }).reason;
}

describe('validateCondenseModuleResult', () => {
  it('a valid agent result becomes the proposal an in-app run would compose', async () => {
    const setup = createFakeGateway();
    setup.provider.setReply(CONDENSE_MODULE_TASK, JSON.stringify(reply()));
    const inApp = await condenseModule(
      { docs: docs(), gateway: setup.gateway, existing: EXISTING, docLanguage: 'de', now: NOW },
      SLUG,
    );
    expect(inApp.kind).toBe('proposal');
    if (inApp.kind !== 'proposal') return;

    const proposal = asProposal(check());

    expect(proposal).toEqual({
      unit: 'module',
      slug: SLUG,
      path: OVERVIEW,
      baseHash: sha256(EXISTING),
      before: EXISTING,
      after: inApp.content,
      sources: [RBAC, GUIDE],
    });
  });

  it('a result missing a section fails and names the section', () => {
    const reason = reasonOf(check({ resultBody: resultBody(reply({ open: undefined })) }));

    expect(reason).toContain('"open"');
  });

  it('a section with text and no source line fails', () => {
    const body = resultBody(reply({ contradictions: { text: 'Laufzeit unklar.', sources: [] } }));

    const reason = reasonOf(check({ resultBody: body }));

    expect(reason).toContain('"contradictions"');
    expect(reason).toContain('cites no page');
  });

  it('a result citing a path that is not a page of the module fails', () => {
    const body = resultBody(reply({ decided: { text: 'Fremd.', sources: [RBAC, FOREIGN] } }));

    const reason = reasonOf(check({ resultBody: body }));

    expect(reason).toContain('"decided"');
    expect(reason).toContain(FOREIGN);
    expect(reason).not.toContain(RBAC);
  });

  it('a result after overview.md changed since the hand-over fails with that reason', () => {
    const edited = `${EXISTING}\nEine Notiz von Hand.\n`;

    expect(reasonOf(check({ existing: edited }))).toBe(
      'overview.md changed since it was handed to the agent.',
    );
    // An overview created after a hand-over that had none counts as a change too.
    expect(reasonOf(check({ job: condenseModuleJobPayload(docs(), SLUG, undefined) }))).toContain(
      'overview.md changed',
    );
  });

  it('a page added after the hand-over is not recorded as read', () => {
    const job = condenseModuleJobPayload(docs(), SLUG, EXISTING);
    const now = [...docs(), page(LATER, 'concept', 'SSO kommt später.')];

    const proposal = asProposal(check({ job, docs: now }));
    expect(proposal.sources).toEqual([RBAC, GUIDE]);
    const recorded = parse(proposal.after).frontmatter;
    expect(JSON.stringify(recorded)).not.toContain(LATER);

    const citing = resultBody(reply({ open: { text: 'SSO offen.', sources: [GUIDE, LATER] } }));
    expect(reasonOf(check({ job, docs: now, resultBody: citing }))).toContain(LATER);
  });

  it('a result without a fenced json block fails', () => {
    expect(reasonOf(check({ resultBody: JSON.stringify(reply()) }))).toContain('json block');
  });
});
