/* Die Ausschlussliste ist die einzige Stelle, die entscheidet, welche Dokumenttypen
   nie als Beleg zitiert werden. Diese Tests stellen sicher, dass die Filterung
   ueber die Liste laeuft (datengetrieben) statt ueber einen fest verdrahteten
   `type !== 'condensed'`-Vergleich — ein zweiter Eintrag braeuchte sonst keine
   weitere Codeaenderung. */

import { describe, expect, it } from 'vitest';
import { EVIDENCE_EXCLUDED_TYPES, evidenceTypesFor, isEvidenceExcluded } from '@core/wiki/evidence';
import { ALL_DOC_TYPES } from '@shared/types/vault';
import type { DocType } from '@shared/types/vault';

describe('EVIDENCE_EXCLUDED_TYPES', () => {
  it('contains exactly condensed and overview', () => {
    expect(EVIDENCE_EXCLUDED_TYPES).toEqual(['condensed', 'overview']);
  });
});

describe('isEvidenceExcluded', () => {
  it('is true for every type in the exclusion list', () => {
    for (const type of EVIDENCE_EXCLUDED_TYPES) {
      expect(isEvidenceExcluded(type)).toBe(true);
    }
  });

  it('is false for a type not in the exclusion list', () => {
    const included = ALL_DOC_TYPES.filter((type) => !EVIDENCE_EXCLUDED_TYPES.includes(type));
    for (const type of included) {
      expect(isEvidenceExcluded(type)).toBe(false);
    }
  });
});

describe('evidenceTypesFor', () => {
  it('with no argument returns every DocType except the excluded ones', () => {
    const expected = ALL_DOC_TYPES.filter((type) => !EVIDENCE_EXCLUDED_TYPES.includes(type));
    expect(evidenceTypesFor(undefined)).toEqual(expected);
  });

  it('removes condensed from a requested list that includes it', () => {
    const requested: DocType[] = ['note', 'condensed', 'project'];
    expect(evidenceTypesFor(requested)).toEqual(['note', 'project']);
  });

  it('returns an empty list when only condensed was requested', () => {
    expect(evidenceTypesFor(['condensed'])).toEqual([]);
  });

  it('matches a hand-written expectation for every DocType member, independent of EVIDENCE_EXCLUDED_TYPES', () => {
    // Deliberately does NOT derive its expectation from EVIDENCE_EXCLUDED_TYPES (unlike
    // the tests above) — that would make the test tautological, since it would pass
    // for any implementation, including a hardcoded `type !== 'condensed'` comparison
    // or one that just echoes the list back. Instead every member of ALL_DOC_TYPES is
    // listed here by hand with the outcome we expect today, so this test can only pass
    // if isEvidenceExcluded's actual observable behavior matches that hand-written
    // expectation, type by type.
    expect(isEvidenceExcluded('dump')).toBe(false);
    expect(isEvidenceExcluded('note')).toBe(false);
    expect(isEvidenceExcluded('project')).toBe(false);
    expect(isEvidenceExcluded('area')).toBe(false);
    expect(isEvidenceExcluded('condensed')).toBe(true);
    expect(isEvidenceExcluded('journal')).toBe(false);
    expect(isEvidenceExcluded('source')).toBe(false);
    expect(isEvidenceExcluded('entity')).toBe(false);
    expect(isEvidenceExcluded('concept')).toBe(false);
    expect(isEvidenceExcluded('overview')).toBe(true);
    expect(isEvidenceExcluded('raw')).toBe(false);

    const result = evidenceTypesFor(ALL_DOC_TYPES);
    expect(result).toEqual([
      'dump',
      'note',
      'project',
      'area',
      'journal',
      'source',
      'entity',
      'concept',
      'raw',
    ]);
  });

  it('a module overview is never offered as evidence', () => {
    // The overview is a condensed digest of its module's pages; the pages are the evidence.
    expect(evidenceTypesFor(undefined)).not.toContain('overview');
    expect(evidenceTypesFor(['overview'])).toEqual([]);
    expect(evidenceTypesFor(['concept', 'overview', 'source'])).toEqual(['concept', 'source']);
  });
});
