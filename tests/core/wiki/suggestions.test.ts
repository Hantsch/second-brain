/* Die harte Pruefung der Modellantwort. Was hier durchfaellt, wird nicht repariert,
   sondern verworfen: eine erfundene Seite ist keine Verknuepfung. */

import { describe, expect, it } from 'vitest';
import { MAX_PATCH_CHARS, cleanPatch, readIngestReply, suggestionSlug } from '@core/wiki';

const MODULE = 'identity-management';

function page(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'mandantentrennung',
    type: 'concept',
    title: 'Mandantentrennung',
    action: 'create',
    patch: 'Ein Absatz.',
    ...patch,
  };
}

describe('suggestionSlug', () => {
  it('normalisiert und erlaubt das eigene Modul als Praefix', () => {
    expect(suggestionSlug('Rollenbasierte Zugriffskontrolle', '', MODULE)).toBe(
      'rollenbasierte-zugriffskontrolle',
    );
    expect(suggestionSlug(`${MODULE}/auth0`, '', MODULE)).toBe('auth0');
    expect(suggestionSlug('[[auth0|Der Anbieter]]', '', MODULE)).toBe('auth0');
    expect(suggestionSlug(undefined, 'Aus dem Titel', MODULE)).toBe('aus-dem-titel');
  });

  it('verwirft fremde Module, Struktur-Dateien und Source-Slugs', () => {
    expect(suggestionSlug('fremdes-modul/auth0', '', MODULE)).toBeNull();
    expect(suggestionSlug('a/b/c', '', MODULE)).toBeNull();
    expect(suggestionSlug('index', '', MODULE)).toBeNull();
    expect(suggestionSlug('log', '', MODULE)).toBeNull();
    expect(suggestionSlug('overview', '', MODULE)).toBeNull();
    expect(suggestionSlug('s-2026-08-10-quelle', '', MODULE)).toBeNull();
    expect(suggestionSlug('', '', MODULE)).toBeNull();
  });
});

describe('cleanPatch', () => {
  it('entfernt Frontmatter und Titelzeile — die schreibt die App', () => {
    expect(cleanPatch('---\ntype: concept\n---\n\nDer Absatz.', MODULE)).toBe('Der Absatz.');
    expect(cleanPatch('# Mandantentrennung\n\nDer Absatz.', MODULE)).toBe('Der Absatz.');
  });

  it('kuerzt Wikilinks des eigenen Moduls auf den Slug', () => {
    expect(cleanPatch(`Siehe [[${MODULE}/auth0]].`, MODULE)).toBe('Siehe [[auth0]].');
    expect(cleanPatch(`Siehe [[${MODULE}/auth0|Anbieter]].`, MODULE)).toBe(
      'Siehe [[auth0|Anbieter]].',
    );
    expect(cleanPatch('Siehe [[andere/seite]].', MODULE)).toBe('Siehe [[andere/seite]].');
  });

  it('begrenzt die Laenge und meldet Leeres als null', () => {
    const long = cleanPatch('x'.repeat(MAX_PATCH_CHARS + 500), MODULE) ?? '';
    expect(long.length).toBeLessThanOrEqual(MAX_PATCH_CHARS + 6);
    expect(long.endsWith('[…]')).toBe(true);
    expect(cleanPatch('   ', MODULE)).toBeNull();
    expect(cleanPatch(42, MODULE)).toBeNull();
  });
});

describe('readIngestReply', () => {
  it('nimmt brauchbare Seiten und meldet die Synthese-Aenderung', () => {
    const reply = readIngestReply(
      {
        pages: [page(), page({ slug: 'auth0', type: 'entity', title: 'Auth0', action: 'extend' })],
        overviewChange: 'Mandanten sind Organisationen.',
      },
      MODULE,
    );

    expect(reply.suggestions.map((entry) => entry.slug)).toEqual(['mandantentrennung', 'auth0']);
    expect(reply.suggestions[1]?.action).toBe('extend');
    expect(reply.overviewChange).toBe('Mandanten sind Organisationen.');
  });

  it('verwirft erfundene Modulnamen, falsche Typen und leere Patches', () => {
    const reply = readIngestReply(
      {
        pages: [
          page({ module: 'anderes-modul' }),
          page({ slug: 'x', type: 'source' }),
          page({ slug: 'y', type: undefined }),
          page({ slug: 'z', patch: '' }),
          page({ slug: 'fremdes/seite' }),
          'kein Objekt',
        ],
      },
      MODULE,
    );

    expect(reply.suggestions).toEqual([]);
    expect(reply.overviewChange).toBeNull();
  });

  it('nimmt jeden Slug nur einmal und haelt die Obergrenze ein', () => {
    const reply = readIngestReply(
      { pages: [page(), page({ title: 'Dublette' }), page({ slug: 'zweite' })] },
      MODULE,
      2,
    );
    expect(reply.suggestions.map((entry) => entry.slug)).toEqual(['mandantentrennung', 'zweite']);
  });

  it('liest einen Widerspruch nur vollstaendig', () => {
    const withNote = readIngestReply(
      {
        pages: [page({ contradicts: { page: 'token-lebensdauer', note: '30 statt 15 Minuten' } })],
      },
      MODULE,
    );
    expect(withNote.suggestions[0]?.contradicts).toEqual({
      page: 'token-lebensdauer',
      note: '30 statt 15 Minuten',
    });

    const halfNote = readIngestReply(
      { pages: [page({ contradicts: { page: 'token-lebensdauer' } })] },
      MODULE,
    );
    expect(halfNote.suggestions[0]?.contradicts).toBeNull();
  });

  it('begrenzt Tags und uebersteht jede Form von Muell', () => {
    const tagged = readIngestReply(
      { pages: [page({ tags: ['#Auth', 'auth', 42, 'a', 'b', 'c', 'd', 'e', 'f'] })] },
      MODULE,
    );
    expect(tagged.suggestions[0]?.tags).toEqual(['auth', 'a', 'b', 'c', 'd', 'e']);
    expect(readIngestReply(null, MODULE).suggestions).toEqual([]);
    expect(readIngestReply('kaputt', MODULE).suggestions).toEqual([]);
    expect(readIngestReply({ pages: 'keine Liste' }, MODULE).suggestions).toEqual([]);
  });
});
