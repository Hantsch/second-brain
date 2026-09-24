/* Story 059, D5: the six user-facing filter chips must cover every raw
 * `DocType` exactly once — a group that misses a type would make that kind of
 * document unreachable through the type filter, and two groups sharing a type
 * would double-count it in whatever narrows by group. `ALL_DOC_TYPES` is the
 * one place the type union is enumerated at runtime (`shared/types/vault.ts`),
 * so this test fails loudly the moment a `DocType` is added without a home in
 * `TYPE_GROUPS`, instead of the group chips silently going stale.
 */

import { describe, expect, it } from 'vitest';
import { ALL_DOC_TYPES } from '@shared/types';
import { TYPE_GROUPS } from '@renderer/screens/search/SearchFilters';

describe('TYPE_GROUPS', () => {
  it('covers every DocType exactly once', () => {
    const seen = Object.values(TYPE_GROUPS).flat();
    expect(seen.sort()).toEqual([...ALL_DOC_TYPES].sort());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('maps the composite groups the story names by name', () => {
    expect(TYPE_GROUPS.knowledge.slice().sort()).toEqual(
      ['concept', 'entity', 'overview', 'source'].sort(),
    );
    expect(TYPE_GROUPS.notes.slice().sort()).toEqual(['dump', 'note'].sort());
  });
});
