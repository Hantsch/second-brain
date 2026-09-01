import { describe, expect, it } from 'vitest';
import {
  composeCondensedArtifact,
  emptyCondensedArtifact,
  parseCondensedArtifact,
  sourceLineFor,
} from '@core/condense/artifact';
import { parse } from '@core/vault/frontmatter';
import { sectionMap } from '@core/vault/sections';

/* Eine von Hand gepflegte Datei: unbekannte Frontmatter-Felder, eigenwillige
   Direktiven (Liste, Zitat, Einrueckung, Backticks) und ein fremder Abschnitt. */
const EXISTING = `---
type: condensed
title: Gesundheit — verdichtet
condensed_at: 2026-08-10T09:15:00+02:00
sources:
  - areas/gesundheit.md
  - journal/2026-08-09.md
created: 2026-07-01
lang: de
review_cycle: 30
---

## Stand

Schlaf ist stabil, Sport hakt seit zwei Wochen.

Aus: areas/gesundheit.md

## Muster

Ohne Sport kippt der Schlaf, nicht umgekehrt.

Aus: journal/2026-08-09.md

## Offen

Ob der Rücken ein Arzttermin ist.

Aus: areas/gesundheit.md, journal/2026-08-09.md

## Direktiven

- Nie meine Blutwerte zusammenfassen.
- \`sport\` heißt bei mir Klettern, nichts anderes.

> Notiz aus dem Gespräch mit A.:
>     „bleib dran“

## Eigene Notizen

Steht hier, weil ich das so will.
`;

const DIRECTIVES_BLOCK = EXISTING.slice(EXISTING.indexOf('## Direktiven'));

function artifactWithContent(): ReturnType<typeof emptyCondensedArtifact> {
  const artifact = emptyCondensedArtifact();
  artifact.title = 'Health — condensed';
  artifact.condensedAt = '2026-09-01T08:00:00+02:00';
  artifact.sources = ['areas/health.md', 'journal/2026-08-30.md'];
  artifact.sections.state = { text: 'Sleep is stable.', sources: ['areas/health.md'] };
  artifact.sections.patterns = { text: 'Two weeks without sport.', sources: ['areas/health.md'] };
  artifact.sections.open = {
    text: 'Whether the back needs a doctor.',
    sources: ['journal/2026-08-30.md'],
  };
  return artifact;
}

describe('parseCondensedArtifact', () => {
  it('reads frontmatter, the three machine sections and their source paths', () => {
    const artifact = parseCondensedArtifact(EXISTING);
    expect(artifact.title).toBe('Gesundheit — verdichtet');
    expect(artifact.condensedAt).toBe('2026-08-10T09:15:00+02:00');
    expect(artifact.sources).toEqual(['areas/gesundheit.md', 'journal/2026-08-09.md']);
    expect(artifact.sections.state.text).toBe('Schlaf ist stabil, Sport hakt seit zwei Wochen.');
    expect(artifact.sections.state.sources).toEqual(['areas/gesundheit.md']);
    expect(artifact.sections.open.sources).toEqual([
      'areas/gesundheit.md',
      'journal/2026-08-09.md',
    ]);
  });

  it('puts every field it does not own into the extra bag', () => {
    const artifact = parseCondensedArtifact(EXISTING);
    expect(artifact.extraFrontmatter).toEqual({
      created: '2026-07-01',
      lang: 'de',
      review_cycle: 30,
    });
  });

  it('reads English headings and the English source line just as well', () => {
    const artifact = parseCondensedArtifact(
      [
        '---',
        'type: condensed',
        '---',
        '',
        '## Status',
        '',
        'Fine.',
        '',
        'From: areas/health.md',
        '',
      ].join('\n'),
    );
    expect(artifact.sections.state).toEqual({ text: 'Fine.', sources: ['areas/health.md'] });
  });
});

describe('parse → compose round trip', () => {
  it('preserves unknown frontmatter keys', () => {
    const composed = composeCondensedArtifact(parseCondensedArtifact(EXISTING), 'de');
    const { frontmatter } = parse(composed);
    expect(frontmatter['created']).toBe('2026-07-01');
    expect(frontmatter['lang']).toBe('de');
    expect(frontmatter['review_cycle']).toBe(30);
  });

  it('preserves the directives section byte for byte', () => {
    const composed = composeCondensedArtifact(parseCondensedArtifact(EXISTING), 'de');
    expect(composed.slice(composed.indexOf('## Direktiven'))).toBe(DIRECTIVES_BLOCK);
  });

  it('keeps the whole file identical when nothing changed', () => {
    const composed = composeCondensedArtifact(parseCondensedArtifact(EXISTING), 'de');
    expect(composed).toBe(EXISTING);
  });

  it('keeps the human directives heading even when the document language changed', () => {
    const composed = composeCondensedArtifact(parseCondensedArtifact(EXISTING), 'en');
    expect(composed).toContain('## Direktiven');
    expect(composed).not.toContain('## Directives');
  });

  it('carries the directives through a rewrite of the machine sections', () => {
    const artifact = parseCondensedArtifact(EXISTING);
    artifact.condensedAt = '2026-09-01T08:00:00+02:00';
    artifact.sections.state = { text: 'Alles neu.', sources: ['areas/gesundheit.md'] };
    const composed = composeCondensedArtifact(artifact, 'de');
    expect(composed).toContain('Alles neu.');
    expect(composed).not.toContain('Schlaf ist stabil');
    expect(composed.slice(composed.indexOf('## Direktiven'))).toBe(DIRECTIVES_BLOCK);
  });
});

describe('composeCondensedArtifact', () => {
  it('writes the headings in the document language', () => {
    const de = composeCondensedArtifact(artifactWithContent(), 'de');
    expect(de).toContain('## Stand');
    expect(de).toContain('## Muster');
    expect(de).toContain('## Offen');
    expect(de).toContain('## Direktiven');

    const en = composeCondensedArtifact(artifactWithContent(), 'en');
    expect(en).toContain('## Status');
    expect(en).toContain('## Patterns');
    expect(en).toContain('## Open');
    expect(en).toContain('## Directives');
  });

  it('ends each machine section with its source line', () => {
    const sections = sectionMap(composeCondensedArtifact(artifactWithContent(), 'en'));
    expect(sections.get('Status')).toBe('Sleep is stable.\n\nFrom: areas/health.md');
    expect(sections.get('Patterns')).toBe('Two weeks without sport.\n\nFrom: areas/health.md');
    expect(sections.get('Open')).toBe(
      'Whether the back needs a doctor.\n\nFrom: journal/2026-08-30.md',
    );
  });

  it('writes the source line in the document language', () => {
    const sections = sectionMap(composeCondensedArtifact(artifactWithContent(), 'de'));
    expect(sections.get('Stand')).toBe('Sleep is stable.\n\nAus: areas/health.md');
    expect(sourceLineFor([], 'de')).toBe('');
  });

  it('carries condensed_at and the sources list in its frontmatter', () => {
    const composed = composeCondensedArtifact(artifactWithContent(), 'de');
    expect(composed).toMatch(/^sources:/m);
    const { frontmatter } = parse(composed);
    expect(frontmatter['type']).toBe('condensed');
    expect(frontmatter['condensed_at']).toBe('2026-09-01T08:00:00+02:00');
    expect(frontmatter['sources']).toEqual(['areas/health.md', 'journal/2026-08-30.md']);
  });

  it('orders the known frontmatter fields canonically, unknown ones after them', () => {
    const artifact = parseCondensedArtifact(EXISTING);
    const composed = composeCondensedArtifact(artifact, 'de');
    const keys = composed
      .split('\n')
      .slice(1)
      .filter((line) => /^[a-z_]+:/.test(line))
      .map((line) => line.split(':')[0]);
    expect(keys).toEqual([
      'type',
      'title',
      'condensed_at',
      'sources',
      'created',
      'lang',
      'review_cycle',
    ]);
  });

  it('writes all four headings even for an empty artifact', () => {
    const composed = composeCondensedArtifact(emptyCondensedArtifact(), 'de');
    expect(composed).toBe(
      '---\ntype: condensed\nsources: []\n---\n\n## Stand\n\n## Muster\n\n## Offen\n\n## Direktiven\n',
    );
  });
});
