import { describe, expect, it } from 'vitest';
import { CatalogueParseError, loadCatalogue, parseCatalogue } from '@core/llm';

describe('loadCatalogue', () => {
  it('parses the bundled catalogue and returns entries', () => {
    const catalogue = loadCatalogue();

    expect(typeof catalogue.generatedAt).toBe('string');
    expect(catalogue.generatedAt.length).toBeGreaterThan(0);
    expect(catalogue.entries.length).toBeGreaterThan(0);
  });

  it('every entry has a dataPolicy and a policySource', () => {
    const catalogue = loadCatalogue();

    for (const entry of catalogue.entries) {
      expect(['no-training', 'trains', 'unknown']).toContain(entry.dataPolicy);
      expect(typeof entry.policySource).toBe('string');
      expect(entry.policySource.length).toBeGreaterThan(0);
    }
  });

  it('includes at least one local, one no-training cloud, and one trains/unknown cloud entry', () => {
    const catalogue = loadCatalogue();

    expect(
      catalogue.entries.some(
        (e) => e.providerKind === 'openai-compatible' && e.sizeOnDiskGb !== null,
      ),
    ).toBe(true);
    expect(
      catalogue.entries.some((e) => e.dataPolicy === 'no-training' && e.priceInPerMTok !== null),
    ).toBe(true);
    expect(
      catalogue.entries.some((e) => e.dataPolicy === 'trains' || e.dataPolicy === 'unknown'),
    ).toBe(true);
  });
});

describe('parseCatalogue validation', () => {
  it('rejects an entry missing dataPolicy with a named error identifying the field', () => {
    const malformed = {
      generatedAt: '2026-08-01',
      entries: [
        {
          id: 'broken/model',
          providerKind: 'openai-compatible',
          // dataPolicy intentionally omitted
          policySource: 'https://example.com',
        },
      ],
    };

    expect(() => parseCatalogue(malformed)).toThrow(CatalogueParseError);
    expect(() => parseCatalogue(malformed)).toThrow(/dataPolicy/);
  });

  it('rejects an entry missing policySource', () => {
    const malformed = {
      generatedAt: '2026-08-01',
      entries: [{ id: 'broken/model', providerKind: 'anthropic', dataPolicy: 'unknown' }],
    };

    expect(() => parseCatalogue(malformed)).toThrow(/policySource/);
  });

  it('rejects a top-level shape missing "entries"', () => {
    expect(() => parseCatalogue({ generatedAt: '2026-08-01' })).toThrow(CatalogueParseError);
  });
});
