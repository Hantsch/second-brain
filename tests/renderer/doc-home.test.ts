/* Story 059, D3: `homeOf` always names an in-app route — never a file, never
   `null`. One case per row of the home table, plus the fallback that is the
   whole point of this helper: an unrecognized path still lands somewhere in
   the app (the generic reader), not on an external opener. */

import { describe, expect, it } from 'vitest';
import { homeOf } from '@renderer/lib/doc-home';

describe('homeOf — wiki', () => {
  it('routes a wiki page to its module, with the page as `p`', () => {
    expect(homeOf('modules/identity/wiki/concepts/token-lifetime.md')).toBe(
      '/knowledge?m=identity&p=modules%2Fidentity%2Fwiki%2Fconcepts%2Ftoken-lifetime.md',
    );
  });

  it('routes the module overview the same way as any other page', () => {
    expect(homeOf('modules/identity/wiki/overview.md')).toBe(
      '/knowledge?m=identity&p=modules%2Fidentity%2Fwiki%2Foverview.md',
    );
  });

  it('routes the log to the module log tab, not the page view', () => {
    expect(homeOf('modules/identity/wiki/log.md')).toBe('/knowledge?m=identity&tab=log');
  });
});

describe('homeOf — projects', () => {
  it('routes the plain project file to its overview', () => {
    expect(homeOf('projects/work/orbit-sso/project.md')).toBe('/projects?p=orbit-sso');
  });

  it('routes the condensed project artifact to the knowledge tab', () => {
    expect(homeOf('projects/work/orbit-sso/condensed.md')).toBe(
      '/projects?p=orbit-sso&tab=knowledge',
    );
  });

  it('routes a private-scope condensed project artifact the same way', () => {
    expect(homeOf('projects/private/orbit-sso/condensed.md')).toBe(
      '/projects?p=orbit-sso&tab=knowledge',
    );
  });
});

describe('homeOf — areas', () => {
  it('routes the plain area file to the notes screen, no tab', () => {
    expect(homeOf('areas/health.md')).toBe('/notes?a=health');
  });

  it('routes the condensed area artifact to the condensed tab', () => {
    expect(homeOf('areas/health.condensed.md')).toBe('/notes?a=health&tab=condensed');
  });
});

describe('homeOf — journal', () => {
  it('routes a day file to the journal on that date', () => {
    expect(homeOf('journal/2026/08/2026-08-10.md')).toBe('/journal?d=2026-08-10');
  });
});

describe('homeOf — fallback', () => {
  it('sends an inbox dump to the generic reader, URL-encoded', () => {
    expect(homeOf('inbox/2026-08-10-1432-kurz-slug.md')).toBe(
      `/read?path=${encodeURIComponent('inbox/2026-08-10-1432-kurz-slug.md')}`,
    );
  });

  it('sends a raw source file to the generic reader', () => {
    expect(homeOf('raw/2026-08-10-example/transcript.md')).toBe(
      `/read?path=${encodeURIComponent('raw/2026-08-10-example/transcript.md')}`,
    );
  });

  it('sends a project note to the generic reader, not the project overview', () => {
    expect(homeOf('projects/work/orbit-sso/notes/2026-08-10.md')).toBe(
      `/read?path=${encodeURIComponent('projects/work/orbit-sso/notes/2026-08-10.md')}`,
    );
  });

  it('sends the module catalog (no frontmatter, no page view) to the generic reader', () => {
    expect(homeOf('modules/identity/module.md')).toBe(
      `/read?path=${encodeURIComponent('modules/identity/module.md')}`,
    );
    expect(homeOf('wiki/index.md')).toBe(`/read?path=${encodeURIComponent('wiki/index.md')}`);
  });

  it('sends an arbitrary, unrecognized path to the generic reader', () => {
    expect(homeOf('notes/2026-01-01.md')).toBe(
      `/read?path=${encodeURIComponent('notes/2026-01-01.md')}`,
    );
  });
});
