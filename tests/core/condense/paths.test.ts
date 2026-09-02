import { describe, expect, it } from 'vitest';
import {
  areaSlugFromCondensedPath,
  condensedAreaPath,
  condensedProjectPath,
  isCondensedAreaPath,
  isCondensedProjectPath,
  projectRefFromCondensedPath,
} from '@core/condense/paths';
import { docTypeFromPath } from '@core/index/build';

describe('condensedAreaPath', () => {
  it('builds the vault-relative dotted-sibling path', () => {
    expect(condensedAreaPath('health')).toBe('areas/health.condensed.md');
  });

  it('slugifies its input, like other area paths', () => {
    expect(condensedAreaPath('Über Gesundheit')).toBe('areas/ueber-gesundheit.condensed.md');
  });
});

describe('isCondensedAreaPath', () => {
  it('is true for a condensed area file', () => {
    expect(isCondensedAreaPath('areas/health.condensed.md')).toBe(true);
  });

  it('is false for the plain area file and for other folders', () => {
    expect(isCondensedAreaPath('areas/health.md')).toBe(false);
    expect(isCondensedAreaPath('projects/work/x/project.md')).toBe(false);
  });
});

describe('areaSlugFromCondensedPath', () => {
  it('extracts the slug from a condensed area path', () => {
    expect(areaSlugFromCondensedPath('areas/health.condensed.md')).toBe('health');
  });

  it('returns undefined for anything that does not match', () => {
    expect(areaSlugFromCondensedPath('areas/health.md')).toBeUndefined();
    expect(areaSlugFromCondensedPath('areas/nested/health.condensed.md')).toBeUndefined();
  });
});

describe('docTypeFromPath for condensed areas', () => {
  it('resolves the dotted sibling to condensed, not area', () => {
    expect(docTypeFromPath('areas/health.condensed.md')).toBe('condensed');
    expect(docTypeFromPath('areas/health.md')).toBe('area');
  });
});

describe('condensedProjectPath', () => {
  it('builds the vault-relative sibling path inside the project folder', () => {
    expect(condensedProjectPath('work', 'nyota')).toBe('projects/work/nyota/condensed.md');
  });

  it('slugifies its slug, like other project paths', () => {
    expect(condensedProjectPath('work', 'Über Nyota')).toBe(
      'projects/work/ueber-nyota/condensed.md',
    );
  });
});

describe('isCondensedProjectPath', () => {
  it('is true for a condensed project file', () => {
    expect(isCondensedProjectPath('projects/work/nyota/condensed.md')).toBe(true);
  });

  it('is false for the plain project file and for other folders', () => {
    expect(isCondensedProjectPath('projects/work/nyota/project.md')).toBe(false);
    expect(isCondensedProjectPath('areas/health.condensed.md')).toBe(false);
  });
});

describe('projectRefFromCondensedPath', () => {
  it('extracts scope and slug from a condensed project path', () => {
    expect(projectRefFromCondensedPath('projects/work/nyota/condensed.md')).toEqual({
      scope: 'work',
      slug: 'nyota',
    });
  });

  it('returns undefined for anything that does not match', () => {
    expect(projectRefFromCondensedPath('projects/work/nyota/project.md')).toBeUndefined();
    expect(projectRefFromCondensedPath('projects/work/nyota/notes/x/condensed.md')).toBeUndefined();
  });
});

describe('docTypeFromPath for condensed projects', () => {
  it('resolves the plain sibling file to condensed, not project', () => {
    expect(docTypeFromPath('projects/work/nyota/condensed.md')).toBe('condensed');
    expect(docTypeFromPath('projects/work/nyota/project.md')).toBe('project');
    expect(docTypeFromPath('projects/work/nyota/notes/x.md')).toBe('note');
  });
});
