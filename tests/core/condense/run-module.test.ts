/* The module overview condensation run. Mirror of `run-project.test.ts`: the run
   is where Guardrail 3 stops being an instruction in a prompt and becomes a check
   in code, and where the overview on disk stays untouched until a human accepts. */

import { describe, expect, it } from 'vitest';
import { condenseModule, CONDENSE_MODULE_TASK } from '@core/condense/run-module';
import type {
  CondenseModuleDeps,
  CondenseModuleProposal,
  CondenseModuleResult,
} from '@core/condense/run-module';
import { moduleInputs } from '@core/condense/inputs-module';
import { moduleOverviewPath } from '@core/condense/paths';
import { CONDENSE_ITEM_CHARS } from '@core/llm/prompts/shared';
import type { IndexedDoc } from '@core/index/types';
import { sha256 } from '@core/vault/hash';
import { recordedSources } from '@core/condense/sources';
import { parse } from '@core/vault/frontmatter';
import { sectionMap } from '@core/vault/sections';
import { createEmptyGateway, createFakeGateway } from '../../fakes/llm';
import { makeDoc } from '../index/fixtures';

const SLUG = 'identity-management';
const NOW = '2026-08-10';
const RBAC = `modules/${SLUG}/wiki/concepts/rbac.md`;
const GUIDE = `modules/${SLUG}/wiki/sources/s-2026-07-02-auth0-rbac-guide.md`;
const OVERVIEW = moduleOverviewPath(SLUG);

function page(path: string, type: string, body: string): IndexedDoc {
  return makeDoc({ path, docType: 'note', title: path, module: SLUG, frontmatter: { type }, body });
}

/** The stub a new module starts with: overview, catalogue and chronicle only. */
function stubDocs(): IndexedDoc[] {
  return [
    page(OVERVIEW, 'overview', '## Seiten\n'),
    makeDoc({ path: `modules/${SLUG}/wiki/index.md`, module: SLUG, body: '# Index\n' }),
    makeDoc({ path: `modules/${SLUG}/wiki/log.md`, module: SLUG, body: '# Log\n' }),
  ];
}

function docs(): IndexedDoc[] {
  return [
    ...stubDocs(),
    page(RBAC, 'concept', 'Rollen werden pro Tenant vergeben.'),
    page(GUIDE, 'source', 'Der Guide nennt eine Token-Laufzeit von einer Stunde.'),
    // another module's page must never be read
    makeDoc({
      path: 'modules/other/wiki/concepts/x.md',
      module: 'other',
      frontmatter: { type: 'concept' },
      body: 'Fremd.',
    }),
  ];
}

function reply(patch: Record<string, { text: string; sources: string[] }> = {}): string {
  return JSON.stringify({
    decided: { text: 'Rollen pro Tenant.', sources: [RBAC] },
    open: { text: 'Token-Laufzeit offen.', sources: [GUIDE] },
    contradictions: { text: '', sources: [] },
    ...patch,
  });
}

function gatewayWith(body: string): ReturnType<typeof createFakeGateway> {
  const setup = createFakeGateway();
  setup.provider.setReply(CONDENSE_MODULE_TASK, body);
  return setup;
}

function deps(patch: Partial<CondenseModuleDeps> = {}): CondenseModuleDeps {
  return { docs: docs(), gateway: gatewayWith(reply()).gateway, now: NOW, ...patch };
}

function asProposal(result: CondenseModuleResult): CondenseModuleProposal {
  expect(result.kind).toBe('proposal');
  return result as CondenseModuleProposal;
}

describe('condenseModule', () => {
  it('without a model for condense-module the run names the task and reads nothing', async () => {
    const result = await condenseModule(deps({ gateway: createEmptyGateway() }), SLUG);

    expect(result).toEqual({ kind: 'no-model', slug: SLUG, task: 'condense-module' });
    expect(result).not.toHaveProperty('content');

    const setup = createFakeGateway({ tasks: [] });
    setup.provider.setReply(CONDENSE_MODULE_TASK, reply());
    expect((await condenseModule(deps({ gateway: setup.gateway }), SLUG)).kind).toBe('no-model');
    expect(setup.provider.callCount).toBe(0);
  });

  it('a module with only its stub has nothing to condense', async () => {
    const setup = gatewayWith(reply());

    const result = await condenseModule(deps({ docs: stubDocs(), gateway: setup.gateway }), SLUG);

    expect(result).toEqual({ kind: 'no-inputs', slug: SLUG });
    expect(setup.provider.callCount).toBe(0);
  });

  it('a proposal records every page read in sources and source_hashes', async () => {
    const all = docs();

    const proposal = asProposal(await condenseModule(deps({ docs: all }), SLUG));

    expect(proposal.path).toBe(OVERVIEW);
    expect(proposal.baseHash).toBeNull();
    expect(proposal.sources).toEqual([RBAC, GUIDE]);
    expect(proposal.sources).not.toContain(OVERVIEW);
    expect(proposal).not.toHaveProperty('partialInputs');
    const { frontmatter } = parse(proposal.content);
    expect(frontmatter['type']).toBe('overview');
    expect(frontmatter['condensed_at']).toBe(proposal.condensedAt);
    // the same inventory a later freshness check asks for
    expect(recordedSources(frontmatter)).toEqual(moduleInputs(all, SLUG));
    expect(proposal.sourceHashes).toEqual({
      [RBAC]: all.find((doc) => doc.path === RBAC)?.hash,
      [GUIDE]: all.find((doc) => doc.path === GUIDE)?.hash,
    });
    // an empty section carries no source line
    expect(sectionMap(parse(proposal.content).body, 2).get('Widersprüche')).toBe('');
    expect(proposal.content).toContain(`Aus: ${RBAC}`);
  });

  it('a section citing a page that was not read fails the whole run', async () => {
    const { gateway } = gatewayWith(
      reply({
        decided: { text: 'Behauptung.', sources: [`modules/${SLUG}/wiki/concepts/erfunden.md`] },
      }),
    );

    const result = await condenseModule(deps({ gateway }), SLUG);

    expect(result).toEqual({
      kind: 'attribution-failure',
      slug: SLUG,
      problems: [
        {
          section: 'decided',
          reason: 'unknown-source',
          sources: [`modules/${SLUG}/wiki/concepts/erfunden.md`],
        },
      ],
    });
    expect(result).not.toHaveProperty('content');
  });

  it("the next run's prompt carries the directives a rejection left", async () => {
    const existing = [
      '---',
      'type: overview',
      `title: Identity — Synthese`,
      '---',
      '',
      '## Entschieden',
      '',
      'Alt.',
      '',
      '## Direktiven',
      '',
      'Kundennamen nie nennen.',
      '',
    ].join('\n');
    const setup = gatewayWith(reply());

    await condenseModule(deps({ gateway: setup.gateway, existing }), SLUG);

    const prompt = setup.provider
      .lastCall(CONDENSE_MODULE_TASK)
      ?.messages.map((message) => message.content)
      .join('\n');
    expect(prompt).toContain('Kundennamen nie nennen.');
    expect(prompt).toContain('Alt.');
  });

  it('a proposal keeps the directives section and every unknown frontmatter key verbatim', async () => {
    const existing = [
      '---',
      'type: overview',
      'title: Mein eigener Titel',
      `module: ${SLUG}`,
      'review_cycle: 30',
      '---',
      '',
      '## Entschieden',
      '',
      'Alt.',
      '',
      '## Direktiven',
      '',
      'Kundennamen nie nennen.',
      '',
    ].join('\n');

    const proposal = asProposal(await condenseModule(deps({ existing }), SLUG));

    const { frontmatter, body } = parse(proposal.content);
    expect(frontmatter['module']).toBe(SLUG);
    expect(frontmatter['review_cycle']).toBe(30);
    expect(frontmatter['title']).toBe('Mein eigener Titel');
    expect(body).toContain('## Direktiven\n\nKundennamen nie nennen.');
    expect(proposal.baseHash).toBe(sha256(existing));
  });

  it('titles a first overview after its module and the synthesis phrase', async () => {
    const all = [
      ...docs(),
      makeDoc({ path: `modules/${SLUG}/module.md`, title: 'Identity Management', module: SLUG }),
    ];

    const proposal = asProposal(await condenseModule(deps({ docs: all, docLanguage: 'en' }), SLUG));

    expect(parse(proposal.content).frontmatter['title']).toBe('Identity Management — Synthesis');
  });

  it('a page clamped for the prompt is stated in the artifact', async () => {
    const long = page(RBAC, 'concept', 'x'.repeat(CONDENSE_ITEM_CHARS + 40));
    const all = [...stubDocs(), long, page(GUIDE, 'source', 'Kurz.')];

    const proposal = asProposal(await condenseModule(deps({ docs: all, docLanguage: 'en' }), SLUG));

    expect(proposal.content).toContain('40 characters trimmed');
    // read in full, cited in full: only what the model saw was capped
    expect(proposal.sources).toContain(RBAC);
  });

  it('reports a failed run without content when the gateway cannot answer', async () => {
    const setup = createFakeGateway();
    setup.provider.fail(CONDENSE_MODULE_TASK, 'Modell nicht erreichbar');

    const result = await condenseModule(deps({ gateway: setup.gateway }), SLUG);

    expect(result).toMatchObject({ kind: 'failed', slug: SLUG });
    expect(result).not.toHaveProperty('content');
  });
});

describe('moduleInputs', () => {
  it('lists the pages of the module by path, without overview, index, log or other modules', () => {
    expect(moduleInputs(docs(), SLUG).map((input) => input.path)).toEqual([GUIDE, RBAC].sort());
  });
});
