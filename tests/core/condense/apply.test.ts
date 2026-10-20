/* The accepted document (story 038, D3). What is at stake here is not assembly —
   `condenseArea()` does that — but that accepting a proposal writes exactly what
   the human saw in the preview, with the parts the app does not own still in it:
   the human's directives and frontmatter keys nobody in this codebase knows.
   These tests drive the real run, so they fail if that carry-through ever breaks
   upstream of the accept path, not just if this module changes. */

import { describe, expect, it } from 'vitest';
import { buildAcceptedDocument } from '@core/condense/apply';
import { condenseArea, CONDENSE_AREA_TASK } from '@core/condense/run';
import type { CondenseAreaProposal } from '@core/condense/run';
import { parseCondensedArtifact } from '@core/condense/artifact';
import type { IndexedDoc } from '@core/index/types';
import { createFakeGateway } from '../../fakes/llm';
import { makeDoc } from '../index/fixtures';

const NOW = '2026-08-10';
const AREA_PATH = 'areas/gesundheit.md';
const DIRECTIVE = 'Immer die Schlafzeiten zuerst.';

const AREA_BODY = ['## Notizen', '', '### 2026-07-28', '', 'Der Rücken meldet sich.', ''].join(
  '\n',
);

/** An artifact carrying both things a rewrite could silently drop. */
const EXISTING = [
  '---',
  'type: condensed',
  'title: Gesundheit',
  'custom_field: x',
  '---',
  '',
  '## Stand',
  '',
  'Alt.',
  '',
  `Aus: ${AREA_PATH}`,
  '',
  '## Direktiven',
  '',
  DIRECTIVE,
  '',
].join('\n');

function docs(): IndexedDoc[] {
  return [
    makeDoc({
      path: AREA_PATH,
      docType: 'area',
      title: 'Gesundheit',
      bodyLine: 5,
      frontmatter: { type: 'area', title: 'Gesundheit' },
      body: AREA_BODY,
    }),
  ];
}

const REPLY = JSON.stringify({
  state: { text: 'Der Rücken ist das Thema.', sources: [AREA_PATH] },
  patterns: { text: 'Sitzen macht es schlechter.', sources: [AREA_PATH] },
  open: { text: 'Termin steht aus.', sources: [AREA_PATH] },
});

async function proposalWith(existing?: string): Promise<CondenseAreaProposal> {
  const setup = createFakeGateway();
  setup.provider.setReply(CONDENSE_AREA_TASK, REPLY);
  const result = await condenseArea(
    {
      docs: docs(),
      gateway: setup.gateway,
      now: NOW,
      ...(existing === undefined ? {} : { existing }),
    },
    'gesundheit',
  );
  expect(result.kind).toBe('proposal');
  return result as CondenseAreaProposal;
}

describe('buildAcceptedDocument', () => {
  it('keeps an unknown frontmatter key and the human directives section', async () => {
    const document = buildAcceptedDocument(await proposalWith(EXISTING));

    expect(document).toContain('custom_field: x');
    expect(document).toContain(DIRECTIVE);

    const artifact = parseCondensedArtifact(document);
    expect(artifact.extraFrontmatter).toEqual({ custom_field: 'x' });
    expect(artifact.directives.content).toBe(DIRECTIVE);
    // The run replaced the machine section it owns, and only that one.
    expect(artifact.sections.state.text).toBe('Der Rücken ist das Thema.');
  });

  it('is what the preview showed: the proposal content, unchanged', async () => {
    const proposal = await proposalWith(EXISTING);

    expect(buildAcceptedDocument(proposal)).toBe(proposal.content);
  });

  it('works for a first condensation, where no artifact exists yet', async () => {
    const proposal = await proposalWith();
    const document = buildAcceptedDocument(proposal);

    expect(document).toContain('type: condensed');
    expect(document).toContain(`condensed_at: ${proposal.condensedAt}`);
  });
});
