import { describe, expect, it } from 'vitest';
import {
  composeArtifact,
  emptyArtifact,
  MODULE_SECTIONS,
  parseArtifact,
  type CondensedModuleArtifact,
} from '@core/condense/artifact';
import { moduleOverviewPath, moduleSlugFromOverviewPath } from '@core/condense/paths';
import { parse } from '@core/vault/frontmatter';
import { sectionMap } from '@core/vault/sections';

const OVERVIEW_TYPE = 'overview';

/* An overview as the module stub and earlier wiki runs left it: the long legacy
   headings, a `## Seiten` list nobody condensed, and the wiki keys `module:` and
   `created:` that the condensed layer does not own. */
const LEGACY = `---
type: overview
title: Identity Management
module: identity-management
created: 2026-07-02
tags: [auth]
---

## Was entschieden ist

- Auth0 bleibt der Identity-Provider.

## Was offen ist

- Wie werden Rollen zwischen Tenants geteilt?

## Seiten

- [[auth0]]
`;

/* A condensed module overview in its own format, with everything a human may add:
   a preamble, unknown keys, own directives, a foreign section. */
const CONDENSED = `---
type: overview
title: Identity Management
module: identity-management
condensed_at: 2026-08-10T09:15:00+02:00
created: 2026-07-02
updated: 2026-08-10
sources:
  - modules/identity-management/wiki/concepts/rbac.md
  - modules/identity-management/wiki/sources/s-2026-07-02-auth0-rbac-guide.md
source_hashes:
  modules/identity-management/wiki/concepts/rbac.md: 9f2c1b
review_cycle: 30
---

Von Hand darübergeschrieben.

## Entschieden

Auth0 bleibt der Identity-Provider.

Aus: modules/identity-management/wiki/sources/s-2026-07-02-auth0-rbac-guide.md

## Offen

Rollen zwischen Tenants.

Aus: modules/identity-management/wiki/concepts/rbac.md

## Widersprüche

Der Guide und das Whitepaper widersprechen sich bei der Token-Laufzeit.

Aus: modules/identity-management/wiki/concepts/rbac.md, modules/identity-management/wiki/sources/s-2026-07-02-auth0-rbac-guide.md

## Direktiven

- Die Kundennamen nie nennen.

## Seiten

- [[rbac]]
`;

describe('module overview as a condensed artifact', () => {
  it("a legacy overview's bullets parse as the decided section", () => {
    const artifact: CondensedModuleArtifact = parseArtifact(LEGACY, MODULE_SECTIONS);
    expect(artifact.sections.decided).toEqual({
      text: '- Auth0 bleibt der Identity-Provider.',
      sources: [],
    });
    expect(artifact.sections.open.text).toBe('- Wie werden Rollen zwischen Tenants geteilt?');
    expect(artifact.sections.contradictions).toEqual({ text: '', sources: [] });
    expect(artifact.extraSections).toEqual([
      { heading: 'Seiten', level: 2, content: '- [[auth0]]' },
    ]);
    expect(artifact.title).toBe('Identity Management');
    expect(artifact.extraFrontmatter).toEqual({
      module: 'identity-management',
      created: '2026-07-02',
      tags: ['auth'],
    });
  });

  it('reads the English legacy headings as the same sections', () => {
    const english = '## What is settled\n\n- A.\n\n## What is open\n\n- B.\n';
    const artifact = parseArtifact(english, MODULE_SECTIONS);
    expect(artifact.sections.decided.text).toBe('- A.');
    expect(artifact.sections.open.text).toBe('- B.');
    expect(artifact.extraSections).toEqual([]);
  });

  it('a composed module artifact keeps type overview and every unknown key', () => {
    const artifact = parseArtifact(LEGACY, MODULE_SECTIONS);
    artifact.condensedAt = '2026-08-10T09:15:00+02:00';
    artifact.sources = ['modules/identity-management/wiki/concepts/rbac.md'];
    artifact.sourceHashes = { 'modules/identity-management/wiki/concepts/rbac.md': 'abc' };
    const written = composeArtifact(artifact, MODULE_SECTIONS, 'de', OVERVIEW_TYPE);
    const { frontmatter } = parse(written);
    expect(frontmatter['type']).toBe('overview');
    expect(frontmatter['module']).toBe('identity-management');
    expect(frontmatter['created']).toBe('2026-07-02');
    expect(frontmatter['tags']).toEqual(['auth']);
    expect(Object.keys(frontmatter)).toEqual([
      'type',
      'title',
      'module',
      'condensed_at',
      'created',
      'tags',
      'sources',
      'source_hashes',
    ]);
  });

  it('leaves type condensed when no type is given', () => {
    const written = composeArtifact(parseArtifact(LEGACY, MODULE_SECTIONS), MODULE_SECTIONS);
    expect(parse(written).frontmatter['type']).toBe('condensed');
  });

  it('compose of parse of a module artifact loses nothing', () => {
    const once = parseArtifact(CONDENSED, MODULE_SECTIONS);
    const written = composeArtifact(once, MODULE_SECTIONS, 'de', OVERVIEW_TYPE);
    expect(parseArtifact(written, MODULE_SECTIONS)).toEqual(once);
    expect(written).toBe(CONDENSED);
    expect(once.sections.contradictions.sources).toEqual([
      'modules/identity-management/wiki/concepts/rbac.md',
      'modules/identity-management/wiki/sources/s-2026-07-02-auth0-rbac-guide.md',
    ]);
    expect(once.directives).toEqual({
      heading: 'Direktiven',
      content: '- Die Kundennamen nie nennen.',
    });
    expect(once.extraFrontmatter['review_cycle']).toBe(30);
  });

  it('module headings follow the document language', () => {
    const artifact = emptyArtifact(MODULE_SECTIONS);
    artifact.sections.decided = { text: 'A.', sources: ['modules/m/wiki/concepts/a.md'] };
    const en = sectionMap(parse(composeArtifact(artifact, MODULE_SECTIONS, 'en')).body, 2);
    const de = sectionMap(parse(composeArtifact(artifact, MODULE_SECTIONS, 'de')).body, 2);
    expect([...en.keys()]).toEqual(['Decided', 'Open', 'Contradictions', 'Directives']);
    expect([...de.keys()]).toEqual(['Entschieden', 'Offen', 'Widersprüche', 'Direktiven']);
    expect(en.get('Decided')).toContain('From: modules/m/wiki/concepts/a.md');
    expect(de.get('Entschieden')).toContain('Aus: modules/m/wiki/concepts/a.md');
  });

  it('addresses the overview of a module by its slug and back', () => {
    expect(moduleOverviewPath('identity-management')).toBe(
      'modules/identity-management/wiki/overview.md',
    );
    expect(moduleSlugFromOverviewPath('modules/identity-management/wiki/overview.md')).toBe(
      'identity-management',
    );
    expect(moduleSlugFromOverviewPath('modules/m/wiki/concepts/overview.md')).toBeUndefined();
    expect(moduleSlugFromOverviewPath('areas/m.condensed.md')).toBeUndefined();
  });
});
