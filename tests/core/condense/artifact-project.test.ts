import { describe, expect, it } from 'vitest';
import {
  composeArtifact,
  CONDENSED_SECTIONS,
  emptyArtifact,
  parseArtifact,
  PROJECT_SECTIONS,
  sourceLineFor,
  type CondensedProjectArtifact,
} from '@core/condense/artifact';
import { parse } from '@core/vault/frontmatter';
import { sectionMap } from '@core/vault/sections';

/* Dieselbe Probe wie in `artifact.test.ts`, eine Ebene hoeher: ein von Hand
   gepflegtes `projects/<scope>/<slug>/condensed.md` mit Praeambel, unbekannten
   Frontmatter-Feldern, eigenwilligen Direktiven und einem fremden Abschnitt. */
const EXISTING = `---
type: condensed
title: Nyota Auth0 Migration — verdichtet
condensed_at: 2026-08-10T09:15:00+02:00
sources:
  - projects/work/nyota-auth0-migration/project.md
  - journal/2026-08-09.md
source_hashes:
  projects/work/nyota-auth0-migration/project.md: 9f2c1b
  journal/2026-08-09.md: 4ad8e0
created: 2026-07-01
lang: de
review_cycle: 30
---

Von Hand darübergeschrieben: noch nicht mit A. abgestimmt.

## Stand

Die Migration hängt am Tenant-Setup.

Aus: projects/work/nyota-auth0-migration/project.md

## Nächster Schritt

Tenant anlegen, danach die Redirect-URIs eintragen.

Aus: projects/work/nyota-auth0-migration/project.md

## Wartet auf

A. muss den Tenant freigeben.

Aus: journal/2026-08-09.md

## Gelernt

Auth0 zuerst im Staging, nie direkt in Produktion.

Aus: projects/work/nyota-auth0-migration/project.md, journal/2026-08-09.md

## Direktiven

- Nie meine Zugangsdaten zusammenfassen.
- \`staging\` heißt bei mir der Kunden-Tenant, nichts anderes.

> Notiz aus dem Gespräch mit A.:
>     „erst der Tenant“

## Eigene Notizen

Steht hier, weil ich das so will.
`;

const DIRECTIVES_BLOCK = EXISTING.slice(EXISTING.indexOf('## Direktiven'));

function projectWithContent(): CondensedProjectArtifact {
  const artifact = emptyArtifact(PROJECT_SECTIONS);
  artifact.title = 'Nyota Auth0 migration — condensed';
  artifact.condensedAt = '2026-09-01T08:00:00+02:00';
  artifact.sources = ['projects/work/nyota-auth0-migration/project.md', 'journal/2026-08-30.md'];
  artifact.sourceHashes = { 'projects/work/nyota-auth0-migration/project.md': 'aa11bb' };
  artifact.sections.state = {
    text: 'The migration waits on the tenant.',
    sources: ['projects/work/nyota-auth0-migration/project.md'],
  };
  artifact.sections['next-step'] = {
    text: 'Create the tenant.',
    sources: ['projects/work/nyota-auth0-migration/project.md'],
  };
  artifact.sections['waiting-on'] = {
    text: 'A. has to release the tenant.',
    sources: ['journal/2026-08-30.md'],
  };
  artifact.sections.learned = {
    text: 'Staging first, never production.',
    sources: ['journal/2026-08-30.md'],
  };
  return artifact;
}

describe('parseArtifact with PROJECT_SECTIONS', () => {
  it('reads frontmatter, the four machine sections and their source paths', () => {
    const artifact = parseArtifact(EXISTING, PROJECT_SECTIONS);
    expect(artifact.title).toBe('Nyota Auth0 Migration — verdichtet');
    expect(artifact.condensedAt).toBe('2026-08-10T09:15:00+02:00');
    expect(artifact.sources).toEqual([
      'projects/work/nyota-auth0-migration/project.md',
      'journal/2026-08-09.md',
    ]);
    expect(artifact.sourceHashes).toEqual({
      'projects/work/nyota-auth0-migration/project.md': '9f2c1b',
      'journal/2026-08-09.md': '4ad8e0',
    });
    expect(artifact.sections.state.text).toBe('Die Migration hängt am Tenant-Setup.');
    expect(artifact.sections['next-step'].text).toBe(
      'Tenant anlegen, danach die Redirect-URIs eintragen.',
    );
    expect(artifact.sections['waiting-on']).toEqual({
      text: 'A. muss den Tenant freigeben.',
      sources: ['journal/2026-08-09.md'],
    });
    expect(artifact.sections.learned.sources).toEqual([
      'projects/work/nyota-auth0-migration/project.md',
      'journal/2026-08-09.md',
    ]);
  });

  it('keeps the human parts apart from the machine parts', () => {
    const artifact = parseArtifact(EXISTING, PROJECT_SECTIONS);
    expect(artifact.preamble).toBe('Von Hand darübergeschrieben: noch nicht mit A. abgestimmt.');
    expect(artifact.directives.heading).toBe('Direktiven');
    expect(artifact.directives.content).toContain('Nie meine Zugangsdaten zusammenfassen.');
    expect(artifact.extraSections).toEqual([
      { heading: 'Eigene Notizen', level: 2, content: 'Steht hier, weil ich das so will.' },
    ]);
    expect(artifact.extraFrontmatter).toEqual({
      created: '2026-07-01',
      lang: 'de',
      review_cycle: 30,
    });
  });

  it('reads the English headings and source line just as well', () => {
    const artifact = parseArtifact(
      [
        '---',
        'type: condensed',
        '---',
        '',
        '## Next step',
        '',
        'Create the tenant.',
        '',
        'From: projects/work/nyota-auth0-migration/project.md',
        '',
      ].join('\n'),
      PROJECT_SECTIONS,
    );
    expect(artifact.sections['next-step']).toEqual({
      text: 'Create the tenant.',
      sources: ['projects/work/nyota-auth0-migration/project.md'],
    });
  });

  /* Der Abschnittssatz ist der Parameter, nicht eine Annahme des Moduls: eine
     Ueberschrift der anderen Ebene ist hier Fremdtext und bleibt es. */
  it('treats a section of the other level as foreign text', () => {
    const asProject = parseArtifact(EXISTING, PROJECT_SECTIONS);
    expect(asProject.extraSections.map((section) => section.heading)).toEqual(['Eigene Notizen']);

    const asArea = parseArtifact(EXISTING, CONDENSED_SECTIONS);
    expect(asArea.extraSections.map((section) => section.heading)).toEqual([
      'Nächster Schritt',
      'Wartet auf',
      'Gelernt',
      'Eigene Notizen',
    ]);
  });
});

describe('project parse → compose round trip', () => {
  it('preserves unknown frontmatter keys', () => {
    const composed = composeArtifact(parseArtifact(EXISTING, PROJECT_SECTIONS), PROJECT_SECTIONS);
    const { frontmatter } = parse(composed);
    expect(frontmatter['created']).toBe('2026-07-01');
    expect(frontmatter['lang']).toBe('de');
    expect(frontmatter['review_cycle']).toBe(30);
  });

  it('preserves the directives section byte for byte', () => {
    const composed = composeArtifact(parseArtifact(EXISTING, PROJECT_SECTIONS), PROJECT_SECTIONS);
    expect(composed.slice(composed.indexOf('## Direktiven'))).toBe(DIRECTIVES_BLOCK);
  });

  it('keeps the whole file identical when nothing changed', () => {
    const composed = composeArtifact(
      parseArtifact(EXISTING, PROJECT_SECTIONS),
      PROJECT_SECTIONS,
      'de',
    );
    expect(composed).toBe(EXISTING);
  });

  it('carries preamble, directives and the foreign section through a rewrite', () => {
    const artifact = parseArtifact(EXISTING, PROJECT_SECTIONS);
    artifact.condensedAt = '2026-09-01T08:00:00+02:00';
    artifact.sections.state = { text: 'Alles neu.', sources: ['journal/2026-08-09.md'] };
    const composed = composeArtifact(artifact, PROJECT_SECTIONS, 'de');
    expect(composed).toContain('Alles neu.');
    expect(composed).not.toContain('Die Migration hängt am Tenant-Setup.');
    expect(composed).toContain('Von Hand darübergeschrieben: noch nicht mit A. abgestimmt.');
    expect(composed).toContain('## Eigene Notizen\n\nSteht hier, weil ich das so will.');
    expect(composed.slice(composed.indexOf('## Direktiven'))).toBe(DIRECTIVES_BLOCK);
  });

  it('keeps the human directives heading even when the document language changed', () => {
    const composed = composeArtifact(
      parseArtifact(EXISTING, PROJECT_SECTIONS),
      PROJECT_SECTIONS,
      'en',
    );
    expect(composed).toContain('## Direktiven');
    expect(composed).not.toContain('## Directives');
  });
});

describe('composeArtifact with PROJECT_SECTIONS', () => {
  it('writes the four headings in document order and in the document language', () => {
    const de = composeArtifact(projectWithContent(), PROJECT_SECTIONS, 'de');
    expect(de.match(/^## .+$/gm)).toEqual([
      '## Stand',
      '## Nächster Schritt',
      '## Wartet auf',
      '## Gelernt',
      '## Direktiven',
    ]);

    const en = composeArtifact(projectWithContent(), PROJECT_SECTIONS, 'en');
    expect(en.match(/^## .+$/gm)).toEqual([
      '## Status',
      '## Next step',
      '## Waiting on',
      '## Learned',
      '## Directives',
    ]);
  });

  it('ends each of the four sections with its source line', () => {
    const sections = sectionMap(composeArtifact(projectWithContent(), PROJECT_SECTIONS, 'en'));
    expect(sections.get('Status')).toBe(
      'The migration waits on the tenant.\n\nFrom: projects/work/nyota-auth0-migration/project.md',
    );
    expect(sections.get('Next step')).toBe(
      'Create the tenant.\n\nFrom: projects/work/nyota-auth0-migration/project.md',
    );
    expect(sections.get('Waiting on')).toBe(
      'A. has to release the tenant.\n\nFrom: journal/2026-08-30.md',
    );
    expect(sections.get('Learned')).toBe(
      'Staging first, never production.\n\nFrom: journal/2026-08-30.md',
    );

    const de = sectionMap(composeArtifact(projectWithContent(), PROJECT_SECTIONS, 'de'));
    expect(de.get('Wartet auf')).toBe(
      'A. has to release the tenant.\n\nAus: journal/2026-08-30.md',
    );
    expect(sourceLineFor([], 'de')).toBe('');
  });

  it('orders the known frontmatter fields canonically, unknown ones after them', () => {
    const composed = composeArtifact(
      parseArtifact(EXISTING, PROJECT_SECTIONS),
      PROJECT_SECTIONS,
      'de',
    );
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
      'source_hashes',
      'created',
      'lang',
      'review_cycle',
    ]);
  });

  it('carries condensed_at and the sources list in its frontmatter', () => {
    const composed = composeArtifact(projectWithContent(), PROJECT_SECTIONS, 'de');
    const { frontmatter } = parse(composed);
    expect(frontmatter['type']).toBe('condensed');
    expect(frontmatter['condensed_at']).toBe('2026-09-01T08:00:00+02:00');
    expect(frontmatter['sources']).toEqual([
      'projects/work/nyota-auth0-migration/project.md',
      'journal/2026-08-30.md',
    ]);
  });

  it('writes all five headings even for an empty project artifact', () => {
    const composed = composeArtifact(emptyArtifact(PROJECT_SECTIONS), PROJECT_SECTIONS, 'de');
    expect(composed).toBe(
      '---\ntype: condensed\nsources: []\n---\n\n## Stand\n\n## Nächster Schritt\n\n## Wartet auf\n\n## Gelernt\n\n## Direktiven\n',
    );
  });
});
