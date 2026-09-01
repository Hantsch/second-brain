/* The condensation run (story 037, D7). The run is the place where Guardrail 3
   stops being an instruction in a prompt and becomes a check in code: a section
   citing a path the run never read fails the whole run, and no artifact content
   comes back. The four refusal paths — no model, no inputs, bad attribution,
   failed call — are each their own result, and none of them writes anything. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { condenseArea, CONDENSE_AREA_TASK } from '@core/condense/run';
import type { CondenseAreaProposal } from '@core/condense/run';
import { CONDENSE_DAY_WINDOW_DAYS } from '@core/condense/inputs';
import { sha256 } from '@core/vault/hash';
import type { IndexedDoc } from '@core/index/types';
import { createEmptyGateway, createFakeGateway } from '../../fakes/llm';
import { makeDoc } from '../index/fixtures';

/** "Now" every window computation and every `condensed_at` in this file uses. */
const NOW = '2026-08-10';

const AREA_PATH = 'areas/gesundheit.md';
const RECENT_DAY_PATH = 'journal/2026/07/2026-07-15.md';
const CONDENSED_PATH = 'areas/gesundheit.condensed.md';

const AREA_BODY = [
  '## Todos',
  '',
  '- [ ] Termin beim Physiotherapeuten machen',
  '',
  '## Notizen',
  '',
  '### 2026-07-28',
  '',
  'Der Rücken meldet sich bei langen Sitzungen.',
  '',
].join('\n');

function areaDoc(): IndexedDoc {
  return makeDoc({
    path: AREA_PATH,
    docType: 'area',
    title: 'Gesundheit',
    bodyLine: 5,
    frontmatter: { type: 'area', title: 'Gesundheit' },
    body: AREA_BODY,
  });
}

function recentDay(): IndexedDoc {
  return makeDoc({
    path: RECENT_DAY_PATH,
    docType: 'journal',
    frontmatter: { type: 'journal', date: '2026-07-15', areas: ['gesundheit'] },
    body: 'Rückenübungen zweimal gemacht, danach deutlich besser.',
  });
}

/** Older than the 90-day window as seen from `NOW` — dropped and counted. */
function oldDay(): IndexedDoc {
  return makeDoc({
    path: 'journal/2026/01/2026-01-01.md',
    docType: 'journal',
    frontmatter: { type: 'journal', date: '2026-01-01', areas: ['gesundheit'] },
    body: 'Vorsatz gefasst.',
  });
}

function docs(): IndexedDoc[] {
  return [areaDoc(), recentDay()];
}

/** The paths the run reads for `docs()` — exactly what a section may cite. */
const READ_PATHS = [AREA_PATH, RECENT_DAY_PATH];

function reply(patch: Record<string, { text: string; sources: string[] }> = {}): string {
  return JSON.stringify({
    state: { text: 'Der Rücken ist das Thema.', sources: [AREA_PATH] },
    patterns: { text: 'Sitzen macht es schlechter.', sources: READ_PATHS },
    open: { text: 'Termin steht aus.', sources: [AREA_PATH] },
    ...patch,
  });
}

/** A gateway whose `condense-area` route answers with `body`. */
function gatewayWith(body: string): ReturnType<typeof createFakeGateway> {
  const setup = createFakeGateway();
  setup.provider.setReply(CONDENSE_AREA_TASK, body);
  return setup;
}

function asProposal(result: { kind: string }): CondenseAreaProposal {
  expect(result.kind).toBe('proposal');
  return result as CondenseAreaProposal;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('condenseArea', () => {
  it('returns a proposal with the composed artifact, its base hash and the sources list', async () => {
    const { gateway } = gatewayWith(reply());

    const proposal = asProposal(
      await condenseArea({ docs: docs(), gateway, now: NOW }, 'gesundheit'),
    );

    expect(proposal.path).toBe(CONDENSED_PATH);
    expect(proposal.sources).toEqual(READ_PATHS);
    // No artifact existed, so D8 must write with "must not exist" rather than a hash.
    expect(proposal.baseHash).toBeNull();
    expect(proposal.condensedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(proposal.content).toContain('type: condensed');
    expect(proposal.content).toContain(`condensed_at: ${proposal.condensedAt}`);
    expect(proposal.content).toContain(`- ${AREA_PATH}`);
    expect(proposal.content).toContain(`- ${RECENT_DAY_PATH}`);
    expect(proposal.content).toContain('Der Rücken ist das Thema.');
    expect(proposal.content).toContain(`Aus: ${AREA_PATH}, ${RECENT_DAY_PATH}`);
    expect(proposal.truncated).toBeNull();
  });

  it('carries the hash of the artifact it was built from, for D8 to write against', async () => {
    const existing = [
      '---',
      'type: condensed',
      'title: Gesundheit',
      '---',
      '',
      '## Stand',
      '',
      'Alt.',
      '',
    ].join('\n');
    const { gateway } = gatewayWith(reply());

    const proposal = asProposal(
      await condenseArea({ docs: docs(), gateway, now: NOW, existing }, 'gesundheit'),
    );

    expect(proposal.baseHash).toBe(sha256(existing));
  });

  it('carries an existing artifact’s directives and unknown keys into the proposal', async () => {
    const existing = [
      '---',
      'type: condensed',
      'title: Gesundheit',
      'obsidian_pin: true',
      '---',
      '',
      '## Stand',
      '',
      'Alt.',
      '',
      '## Direktiven',
      '',
      'Immer die Schlafzeiten zuerst.',
      '',
    ].join('\n');
    const { gateway } = gatewayWith(reply());

    const proposal = asProposal(
      await condenseArea({ docs: docs(), gateway, now: NOW, existing }, 'gesundheit'),
    );

    expect(proposal.content).toContain('obsidian_pin: true');
    expect(proposal.content).toContain('Immer die Schlafzeiten zuerst.');
  });

  it('does not start without a configured model and names the missing task kind', async () => {
    const result = await condenseArea(
      { docs: docs(), gateway: createEmptyGateway(), now: NOW },
      'gesundheit',
    );

    expect(result).toEqual({ kind: 'no-model', slug: 'gesundheit', task: 'condense-area' });
    expect(result).not.toHaveProperty('content');
  });

  it('returns a no-inputs result and no artifact content for an area with nothing to read', async () => {
    const { gateway, provider } = gatewayWith(reply());

    const result = await condenseArea({ docs: [], gateway, now: NOW }, 'gesundheit');

    expect(result).toEqual({ kind: 'no-inputs', slug: 'gesundheit' });
    expect(result).not.toHaveProperty('content');
    // Nothing to condense means nothing to ask about.
    expect(provider.callCount).toBe(0);
  });

  it('fails the whole run when a section cites a path that was not read', async () => {
    const { gateway } = gatewayWith(
      reply({ patterns: { text: 'Behauptung.', sources: ['journal/2026/08/2026-08-06.md'] } }),
    );

    const result = await condenseArea({ docs: docs(), gateway, now: NOW }, 'gesundheit');

    expect(result).toEqual({
      kind: 'attribution-failure',
      slug: 'gesundheit',
      problems: [
        {
          section: 'patterns',
          reason: 'unknown-source',
          sources: ['journal/2026/08/2026-08-06.md'],
        },
      ],
    });
    // Not a repaired artifact and not a dropped sentence — no content at all.
    expect(result).not.toHaveProperty('content');
  });

  it('fails the run when a section makes a claim without citing anything', async () => {
    const { gateway } = gatewayWith(
      reply({ open: { text: 'Behauptung ohne Beleg.', sources: [] } }),
    );

    const result = await condenseArea({ docs: docs(), gateway, now: NOW }, 'gesundheit');

    expect(result).toMatchObject({
      kind: 'attribution-failure',
      problems: [{ section: 'open', reason: 'no-source' }],
    });
  });

  it('puts the truncation notice into the artifact body, in the document language', async () => {
    const { gateway } = gatewayWith(reply());

    const proposal = asProposal(
      await condenseArea(
        { docs: [...docs(), oldDay()], gateway, now: NOW, docLanguage: 'en' },
        'gesundheit',
      ),
    );

    expect(proposal.truncated).toEqual({ count: 1, reason: expect.any(String) });
    expect(proposal.content).toContain('did not read every available input');
    expect(proposal.content).toContain(String(CONDENSE_DAY_WINDOW_DAYS));
  });

  it('does not stack the truncation notice across runs', async () => {
    const { gateway } = gatewayWith(reply());
    const all = [...docs(), oldDay()];

    const first = asProposal(
      await condenseArea({ docs: all, gateway, now: NOW, docLanguage: 'en' }, 'gesundheit'),
    );
    const second = asProposal(
      await condenseArea(
        { docs: all, gateway, now: NOW, docLanguage: 'en', existing: first.content },
        'gesundheit',
      ),
    );

    const notices = second.content.split('did not read every available input').length - 1;
    expect(notices).toBe(1);
  });

  it('reports a failed run instead of throwing when the gateway cannot answer', async () => {
    const setup = createFakeGateway();
    setup.provider.fail(CONDENSE_AREA_TASK, 'Modell nicht erreichbar');

    const result = await condenseArea(
      { docs: docs(), gateway: setup.gateway, now: NOW },
      'gesundheit',
    );

    expect(result).toMatchObject({ kind: 'failed', slug: 'gesundheit' });
    expect(result).not.toHaveProperty('content');
  });

  it('reports a failed run when the reply does not match the schema', async () => {
    const { gateway } = gatewayWith(JSON.stringify({ state: { text: 'Nur einer.', sources: [] } }));

    const result = await condenseArea({ docs: docs(), gateway, now: NOW }, 'gesundheit');

    expect(result).toMatchObject({ kind: 'failed' });
  });

  it('reaches no network: the run completes with fetch stubbed to throw', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Ein Test darf nicht ins Netz.');
    });
    const { gateway, provider } = gatewayWith(reply());

    const proposal = asProposal(
      await condenseArea({ docs: docs(), gateway, now: NOW }, 'gesundheit'),
    );

    expect(proposal.content.length).toBeGreaterThan(0);
    expect(provider.countFor(CONDENSE_AREA_TASK)).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never writes: the module has no store, no filesystem and no fetch', () => {
    const source = readFileSync(resolve(__dirname, '../../../src/core/condense/run.ts'), 'utf8');
    const code = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/*'));
    expect(code.join('\n')).not.toMatch(/VaultStore|node:fs|fetch\(|\.write\(/);
  });
});
