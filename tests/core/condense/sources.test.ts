/* The hash contract of a condensed area (story 039, D1). The whole point of this
   module is that a *missing* hash is an answer, not a gap: an artifact written
   before the contract existed, or a path a user typed into `sources:` by hand,
   must read back as `hash: null` so the maintenance check calls it changed
   instead of assuming it is still current. */

import { describe, expect, it } from 'vitest';
import {
  composeCondensedArtifact,
  emptyCondensedArtifact,
  parseCondensedArtifact,
} from '@core/condense/artifact';
import { areaInputs } from '@core/condense/inputs';
import {
  recordedSources,
  SOURCE_HASHES_FIELD,
  sourceHashesIn,
  sourceHashesOf,
  sourcePaths,
} from '@core/condense/sources';
import { parse } from '@core/vault/frontmatter';
import { makeDoc } from '../index/fixtures';

const AREA_PATH = 'areas/gesundheit.md';
const DAY_PATH = 'journal/2026/07/2026-07-15.md';
const AREA_HASH = 'a'.repeat(64);
const DAY_HASH = 'b'.repeat(64);

/** An artifact as this contract writes it: paths plus their hashes. */
const CURRENT = [
  '---',
  'type: condensed',
  'title: Gesundheit — verdichtet',
  'condensed_at: 2026-08-10T09:15:00+02:00',
  `sources: [${AREA_PATH}, ${DAY_PATH}]`,
  'source_hashes:',
  `  ${AREA_PATH}: ${AREA_HASH}`,
  `  ${DAY_PATH}: ${DAY_HASH}`,
  '---',
  '',
  '## Stand',
  '',
  'Der Rücken ist das Thema.',
  '',
].join('\n');

/** A story-037 artifact: the same `sources:` list, no hashes anywhere. */
const LEGACY = [
  '---',
  'type: condensed',
  'title: Gesundheit — verdichtet',
  'condensed_at: 2026-08-10T09:15:00+02:00',
  `sources: [${AREA_PATH}]`,
  '---',
  '',
  '## Stand',
  '',
  'Der Rücken ist das Thema.',
  '',
].join('\n');

function frontmatterOf(content: string): Record<string, unknown> {
  return parse(content).frontmatter;
}

describe('recordedSources', () => {
  it('pairs every sources entry with the hash recorded for it', () => {
    expect(recordedSources(frontmatterOf(CURRENT))).toEqual([
      { path: AREA_PATH, hash: AREA_HASH },
      { path: DAY_PATH, hash: DAY_HASH },
    ]);
  });

  it('yields hash null for every entry of a pre-039 artifact', () => {
    expect(recordedSources(frontmatterOf(LEGACY))).toEqual([{ path: AREA_PATH, hash: null }]);
  });

  it('yields hash null for a path a user added to sources by hand', () => {
    const handEdited = CURRENT.replace(
      `sources: [${AREA_PATH}, ${DAY_PATH}]`,
      `sources: [${AREA_PATH}, ${DAY_PATH}, journal/2026/08/2026-08-01.md]`,
    );

    expect(recordedSources(frontmatterOf(handEdited))).toContainEqual({
      path: 'journal/2026/08/2026-08-01.md',
      hash: null,
    });
  });

  it('ignores a hash entry whose path is no longer listed in sources', () => {
    const dropped = CURRENT.replace(
      `sources: [${AREA_PATH}, ${DAY_PATH}]`,
      `sources: [${AREA_PATH}]`,
    );
    // `sources:` is the authority on which inputs there were; a leftover hash
    // must not resurrect one.
    expect(recordedSources(frontmatterOf(dropped))).toEqual([{ path: AREA_PATH, hash: AREA_HASH }]);
  });

  it('reads nothing rather than throwing when the field is not a map', () => {
    expect(recordedSources({ sources: [AREA_PATH], [SOURCE_HASHES_FIELD]: 'kaputt' })).toEqual([
      { path: AREA_PATH, hash: null },
    ]);
    expect(sourceHashesIn({ [SOURCE_HASHES_FIELD]: ['a', 'b'] })).toEqual({});
    expect(sourceHashesIn({})).toEqual({});
  });

  it('drops an entry whose hash is not a non-empty string', () => {
    expect(
      sourceHashesIn({ [SOURCE_HASHES_FIELD]: { [AREA_PATH]: '  ', [DAY_PATH]: 42 } }),
    ).toEqual({});
  });

  it('returns nothing for an artifact without a sources field', () => {
    expect(recordedSources({})).toEqual([]);
    expect(sourcePaths({ sources: AREA_PATH })).toEqual([AREA_PATH]);
    expect(sourcePaths({ sources: 17 })).toEqual([]);
  });
});

describe('sourceHashesOf', () => {
  it('turns an areaInputs inventory into the frontmatter map', () => {
    const docs = [
      makeDoc({
        path: AREA_PATH,
        docType: 'area',
        frontmatter: { type: 'area', title: 'Gesundheit' },
        body: '## Notizen\n\n### 2026-07-28\n\nDer Rücken.\n',
      }),
      makeDoc({
        path: DAY_PATH,
        docType: 'journal',
        frontmatter: { type: 'journal', date: '2026-07-15', areas: ['gesundheit'] },
        body: 'Rückenübungen gemacht.',
      }),
    ];
    const inventory = areaInputs(docs, 'gesundheit', { now: '2026-08-10' });

    expect(sourceHashesOf(inventory)).toEqual({
      [AREA_PATH]: docs[0]?.hash,
      [DAY_PATH]: docs[1]?.hash,
    });
  });
});

describe('the artifact round trip', () => {
  it('reads the hashes into the artifact and writes them back unchanged', () => {
    const artifact = parseCondensedArtifact(CURRENT);

    expect(artifact.sources).toEqual([AREA_PATH, DAY_PATH]);
    expect(artifact.sourceHashes).toEqual({ [AREA_PATH]: AREA_HASH, [DAY_PATH]: DAY_HASH });
    expect(recordedSources(frontmatterOf(composeCondensedArtifact(artifact, 'de')))).toEqual(
      recordedSources(frontmatterOf(CURRENT)),
    );
  });

  it('rewrites a pre-039 artifact without inventing hashes for it', () => {
    const composed = composeCondensedArtifact(parseCondensedArtifact(LEGACY), 'de');

    expect(composed).toContain(`- ${AREA_PATH}`);
    // No hashes were known, so the field stays absent — an empty map would claim
    // the same thing with an extra line of noise.
    expect(composed).not.toContain(SOURCE_HASHES_FIELD);
    expect(recordedSources(frontmatterOf(composed))).toEqual([{ path: AREA_PATH, hash: null }]);
  });

  it('writes source_hashes directly after sources', () => {
    const artifact = emptyCondensedArtifact();
    artifact.sources = [AREA_PATH];
    artifact.sourceHashes = { [AREA_PATH]: AREA_HASH };
    const composed = composeCondensedArtifact(artifact, 'de');

    const keys = composed
      .split('\n')
      .slice(1)
      .filter((line) => /^[a-z_]+:/.test(line))
      .map((line) => line.split(':')[0]);
    expect(keys).toEqual(['type', 'sources', SOURCE_HASHES_FIELD]);
  });
});
