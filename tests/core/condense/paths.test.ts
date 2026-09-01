import { describe, expect, it } from 'vitest';
import {
  areaSlugFromCondensedPath,
  condensedAreaPath,
  isCondensedAreaPath,
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
