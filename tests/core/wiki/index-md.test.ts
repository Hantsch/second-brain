/* `wiki/index.md` ist eine gemeinsame Datei: die App traegt Einzeiler ein, der
   Mensch schreibt daneben. Deshalb wird hier vor allem geprueft, was **nicht**
   passiert — keine Nutzerzeile verschwindet, keine Rubrik wird umbenannt. */

import { describe, expect, it } from 'vitest';
import { diffIndex, entryLine, parseIndex, upsertEntries } from '@core/wiki';
import type { WikiIndexEntry } from '@core/wiki';
import { INDEX_PATH, wikiFixture } from './fixtures';

const USER_CATALOG = [
  '# Katalog — Identitätsmanagement',
  '',
  'Meine Ordnung: erst lesen, dann fragen.',
  '',
  '## Quellen',
  '',
  '- [[s-2026-08-04-token-lifetimes-blog]] — Praxisbericht zu 15-Minuten-Tokens',
  '',
  '## Begriffe',
  '',
  '- [[token-lebensdauer]] — Aktueller Stand: 15 Minuten Access',
  '',
  '## Meine offenen Fragen',
  '',
  '- Erben Unterorganisationen die Rollen? Beim Kunden nachfassen.',
  '',
].join('\n');

function entry(patch: Partial<WikiIndexEntry> = {}): WikiIndexEntry {
  return { type: 'concept', slug: 'mandantentrennung', summary: 'Trennung je Mandant', ...patch };
}

describe('parseIndex', () => {
  it('liest Kategorie, Slug und Einzeiler aus dem gewachsenen Katalog', async () => {
    const fixture = await wikiFixture();

    const entries = parseIndex(await fixture.text(INDEX_PATH));

    expect(entries).toEqual([
      {
        type: 'source',
        slug: 's-2026-08-04-token-lifetimes-blog',
        summary: 'Praxisbericht zu 15-Minuten-Tokens',
      },
      { type: 'entity', slug: 'oauth2', summary: 'Das Protokoll, auf dem alles aufsetzt' },
      {
        type: 'concept',
        slug: 'token-lebensdauer',
        summary: 'Aktueller Stand: 15 Minuten Access, 8 Stunden Refresh',
      },
      { type: 'overview', slug: 'overview', summary: 'Was entschieden ist und was offen ist' },
    ]);
  });

  it('erkennt „Begriffe" als Konzept-Rubrik', () => {
    expect(parseIndex(USER_CATALOG).find((item) => item.slug === 'token-lebensdauer')?.type).toBe(
      'concept',
    );
  });

  it('schreibt eine Zeile mit Gedankenstrich, ohne Einzeiler ohne', () => {
    expect(entryLine(entry())).toBe('- [[mandantentrennung]] — Trennung je Mandant');
    expect(entryLine(entry({ summary: '' }))).toBe('- [[mandantentrennung]]');
  });
});

describe('upsertEntries', () => {
  it('haengt an, aktualisiert und laesst jede Nutzerzeile stehen', () => {
    const next = upsertEntries(USER_CATALOG, [
      entry(),
      entry({ type: 'concept', slug: 'token-lebensdauer', summary: 'Jetzt mit Rotation' }),
    ]);

    expect(next).toContain('Meine Ordnung: erst lesen, dann fragen.');
    expect(next).toContain('## Meine offenen Fragen');
    expect(next).toContain('- Erben Unterorganisationen die Rollen? Beim Kunden nachfassen.');
    expect(next).toContain('- [[token-lebensdauer]] — Jetzt mit Rotation');
    expect(next).toContain('- [[mandantentrennung]] — Trennung je Mandant');
    // Die Rubrik heisst weiter „Begriffe": eine Umbenennung waere ein fremder Eingriff.
    expect(next).toContain('## Begriffe');
    expect(next).not.toContain('## Konzepte');
    // Der neue Eintrag steht in der bestehenden Konzept-Rubrik, nicht am Dateiende.
    expect(next.indexOf('- [[mandantentrennung]]')).toBeLessThan(next.indexOf('## Meine offenen'));
  });

  it('behaelt einen von Hand geschriebenen Einzeiler, wenn nichts Besseres kommt', () => {
    const next = upsertEntries(USER_CATALOG, [entry({ slug: 'token-lebensdauer', summary: '  ' })]);
    expect(next).toContain('- [[token-lebensdauer]] — Aktueller Stand: 15 Minuten Access');
  });

  it('legt fehlende Rubriken in stabiler Reihenfolge an', () => {
    const next = upsertEntries('# Katalog\n', [
      entry({ type: 'concept', slug: 'rollenvererbung', summary: 'Wie Rollen erben' }),
      entry({ type: 'source', slug: 's-2026-08-10-quelle', summary: 'Eine Quelle' }),
      entry({ type: 'entity', slug: 'auth0', summary: 'Der Anbieter' }),
    ]);

    expect(next.indexOf('## Quellen')).toBeGreaterThan(0);
    expect(next.indexOf('## Quellen')).toBeLessThan(next.indexOf('## Entitäten'));
    expect(next.indexOf('## Entitäten')).toBeLessThan(next.indexOf('## Konzepte'));
    expect(parseIndex(next).map((item) => item.slug)).toEqual([
      's-2026-08-10-quelle',
      'auth0',
      'rollenvererbung',
    ]);
  });

  it('bleibt bei zweimaligem Aufruf gleich', () => {
    const once = upsertEntries(USER_CATALOG, [entry()]);
    expect(upsertEntries(once, [entry()])).toBe(once);
  });

  it('nennt die Rubriken in der Dokumentsprache', () => {
    const next = upsertEntries('# Catalogue\n', [entry({ type: 'entity', slug: 'auth0' })], {
      language: 'en',
    });
    expect(next).toContain('## Entities');
  });
});

describe('diffIndex', () => {
  it('meldet fehlende Seiten, leere Einzeiler und Eintraege ohne Seite', async () => {
    const fixture = await wikiFixture();
    const pages = fixture.index
      .pages()
      .map((page) => ({ slug: page.slug, type: page.type, title: page.title }));

    const diff = diffIndex(await fixture.text(INDEX_PATH), pages);

    // `scim` ist der absichtliche Index-Drift des Fixture-Vaults.
    expect(diff.missing.map((page) => page.slug)).toEqual(['scim']);
    expect(diff.outdated).toEqual([]);
    expect(diff.orphaned).toEqual([]);
  });

  it('nennt einen Eintrag ohne Einzeiler veraltet', () => {
    const diff = diffIndex('## Entitäten\n\n- [[auth0]]\n', [
      { slug: 'auth0', type: 'entity', title: 'Auth0' },
    ]);
    expect(diff.outdated.map((item) => item.slug)).toEqual(['auth0']);
  });

  it('nennt einen Eintrag verwaist, wenn die Seite fehlt', () => {
    const diff = diffIndex('## Entitäten\n\n- [[weg]] — war mal da\n', []);
    expect(diff.orphaned.map((item) => item.slug)).toEqual(['weg']);
  });
});
