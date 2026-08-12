/* Seiten lesen und schreiben. Drei Zusagen stehen hier auf dem Pruefstand:
   Anhaengen statt Ueberschreiben, Konflikt statt stillem Verlust, und „vor jeder
   neuen Seite suchen" — unscharf genug, dass „Auth0" und „auth0" dieselbe Seite
   finden. */

import { describe, expect, it } from 'vitest';
import {
  appendParagraph,
  createPage,
  findPage,
  mergeSources,
  pageKey,
  pagePath,
  pageRefOf,
  readPage,
  writePage,
} from '@core/wiki';
import { NOW_MS, TODAY } from '../../helpers/time';
import { MODULE, OAUTH_PATH, TOKEN_PATH, wikiFixture } from './fixtures';

describe('pageRefOf', () => {
  it('erkennt Seiten und weist Struktur-Dateien ab', () => {
    expect(pageRefOf(OAUTH_PATH)?.type).toBe('entity');
    expect(pageRefOf(TOKEN_PATH)?.slug).toBe('token-lebensdauer');
    expect(pageRefOf(`modules/${MODULE}/wiki/overview.md`)?.type).toBe('overview');
    expect(pageRefOf(`modules/${MODULE}/wiki/index.md`)).toBeNull();
    expect(pageRefOf(`modules/${MODULE}/wiki/log.md`)).toBeNull();
    expect(pageRefOf('projects/work/x/project.md')).toBeNull();
  });

  it('nimmt den Titel aus dem Frontmatter, sonst den Dateinamen', () => {
    expect(pageRefOf(OAUTH_PATH, { title: 'OAuth 2.1' })?.title).toBe('OAuth 2.1');
    expect(pageRefOf(OAUTH_PATH)?.title).toBe('oauth2');
  });
});

describe('pagePath', () => {
  it('legt jeden Typ in seinen Ordner', () => {
    expect(pagePath(MODULE, 'entity', 'auth0')).toBe(`modules/${MODULE}/wiki/entities/auth0.md`);
    expect(pagePath(MODULE, 'concept', 'rbac')).toBe(`modules/${MODULE}/wiki/concepts/rbac.md`);
    expect(pagePath(MODULE, 'source', 's-2026-08-10-x')).toBe(
      `modules/${MODULE}/wiki/sources/s-2026-08-10-x.md`,
    );
    expect(pagePath(MODULE, 'overview', 'egal')).toBe(`modules/${MODULE}/wiki/overview.md`);
  });
});

describe('createPage', () => {
  it('schreibt Frontmatter nach VAULT-FORMAT.md', async () => {
    const fixture = await wikiFixture();

    const created = await createPage(fixture.store, {
      module: MODULE,
      type: 'concept',
      title: 'Mandantentrennung',
      body: 'Jeder Mandant hat eigene Rollen.',
      tags: ['auth'],
      sources: ['s-2026-08-10-neu'],
      now: NOW_MS,
    });

    expect(created.ref.path).toBe(`modules/${MODULE}/wiki/concepts/mandantentrennung.md`);
    const doc = await fixture.store.read(created.ref.path);
    expect(doc?.frontmatter).toMatchObject({
      type: 'concept',
      title: 'Mandantentrennung',
      module: MODULE,
      created: TODAY,
      updated: TODAY,
      tags: ['auth'],
      sources: ['s-2026-08-10-neu'],
      lang: 'de',
    });
  });

  it('haengt bei Kollision einen Zaehler an, statt zu ueberschreiben', async () => {
    const fixture = await wikiFixture();

    const again = await createPage(fixture.store, {
      module: MODULE,
      type: 'entity',
      title: 'OAuth2',
      body: 'Zweite Seite mit demselben Namen.',
      now: NOW_MS,
    });

    expect(again.ref.slug).toBe('oauth2-2');
    expect(await fixture.text(OAUTH_PATH)).toContain('PKCE ist Pflicht');
  });
});

describe('writePage', () => {
  it('setzt updated, mergt sources und laesst unbekannte Felder stehen', async () => {
    const fixture = await wikiFixture();

    await writePage(
      fixture.store,
      TOKEN_PATH,
      {
        appendBody: 'Rotation gilt auch fuer Dienstkonten.',
        addSources: ['s-2026-08-10-neu'],
        now: NOW_MS,
      },
      'de',
    );

    const doc = await fixture.store.read(TOKEN_PATH);
    expect(doc?.frontmatter['updated']).toBe(TODAY);
    expect(doc?.frontmatter['sources']).toEqual([
      's-2026-08-04-token-lifetimes-blog',
      's-2026-08-10-neu',
    ]);
    // `contradicts` kennt die App nicht — und laesst es genau deshalb in Ruhe.
    expect(doc?.frontmatter['contradicts']).toEqual(['altes-token-konzept']);
  });

  it('haengt den Absatz vor die Widersprueche, nicht dahinter', async () => {
    const fixture = await wikiFixture();

    await writePage(fixture.store, TOKEN_PATH, { appendBody: 'Neuer Absatz.' }, 'de');

    const body = (await fixture.store.read(TOKEN_PATH))?.body ?? '';
    expect(body).toContain('Aktueller Stand: Access-Token 15 Minuten');
    expect(body.indexOf('Neuer Absatz.')).toBeLessThan(body.indexOf('## Widersprüche'));
    expect(body).toContain('ältere ist als `superseded` markiert');
  });

  it('meldet einen Konflikt bei veraltetem Hash', async () => {
    const fixture = await wikiFixture();
    await expect(
      writePage(fixture.store, TOKEN_PATH, { appendBody: 'x', expectedHash: 'alt' }),
    ).rejects.toThrow(/Konflikt/);
  });
});

describe('readPage', () => {
  it('liest eine Seite und weist eine fremde Datei ab', async () => {
    const fixture = await wikiFixture();

    const page = await readPage(fixture.store, OAUTH_PATH);
    expect(page?.ref.title).toBe('OAuth 2.1');
    expect(page?.doc.body).toContain('PKCE ist Pflicht');
    expect(await readPage(fixture.store, pagePath(MODULE, 'entity', 'gibtsnicht'))).toBeNull();
    await expect(readPage(fixture.store, `modules/${MODULE}/wiki/index.md`)).rejects.toThrow(
      /Keine Wiki-Seite/,
    );
  });
});

describe('findPage', () => {
  it('findet dieselbe Seite unabhaengig von Schreibweise und Klammern', async () => {
    const fixture = await wikiFixture();
    const lookup = { store: fixture.store, pages: fixture.index.pages() };

    for (const name of [
      'token-lebensdauer',
      'Token-Lebensdauer',
      'TOKEN LEBENSDAUER',
      'Token Lebensdauer',
      `[[${MODULE}/token-lebensdauer]]`,
      '[[token-lebensdauer|Wie lange?]]',
    ]) {
      const found = await findPage(lookup, MODULE, name);
      expect(found?.path, name).toBe(TOKEN_PATH);
    }
  });

  it('findet eine Seite auch ueber ihren Titel', async () => {
    const fixture = await wikiFixture();
    const lookup = { store: fixture.store, pages: fixture.index.pages() };

    expect((await findPage(lookup, MODULE, 'OAuth 2.1'))?.path).toBe(OAUTH_PATH);
    expect((await findPage(lookup, MODULE, 'SCIM 2.0'))?.path).toContain('scim.md');
  });

  it('faellt nicht auf die Synthese zurueck und meldet Unbekanntes als null', async () => {
    const fixture = await wikiFixture();
    const lookup = { store: fixture.store, pages: fixture.index.pages() };

    expect(await findPage(lookup, MODULE, 'device-code-flow')).toBeNull();
    expect(await findPage(lookup, MODULE, '')).toBeNull();
    expect((await findPage(lookup, MODULE, 'overview'))?.type).toBe('overview');
  });

  it('sieht Seiten, die derselbe Lauf gerade angelegt hat', async () => {
    const fixture = await wikiFixture();
    const lookup = { store: fixture.store, pages: fixture.index.pages() };
    await createPage(fixture.store, {
      module: MODULE,
      type: 'entity',
      title: 'Auth0',
      body: 'Der Anbieter.',
      now: NOW_MS,
    });

    // Der Index weiss davon noch nichts — der Store schon.
    expect((await findPage(lookup, MODULE, 'auth0'))?.slug).toBe('auth0');
    expect((await findPage(lookup, MODULE, 'Auth0'))?.slug).toBe('auth0');
  });
});

describe('Textwerkzeug', () => {
  it('haengt einen Absatz an und stellt ihn vor einen Abschnitt', () => {
    expect(appendParagraph('Erster Absatz.\n', 'Zweiter.')).toBe('Erster Absatz.\n\nZweiter.\n');
    expect(appendParagraph('Text.\n\n## Widersprüche\n\n- alt\n', 'Neu.', 'Widersprüche')).toBe(
      'Text.\n\nNeu.\n\n## Widersprüche\n\n- alt\n',
    );
    expect(appendParagraph('Text.\n', '   ')).toBe('Text.\n');
  });

  it('mergt sources ohne Dubletten und ohne Verlust', () => {
    expect(mergeSources(['a'], ['a', 'b'])).toEqual(['a', 'b']);
    expect(mergeSources('a', ['b'])).toEqual(['a', 'b']);
    expect(mergeSources(undefined, ['b'])).toEqual(['b']);
    expect(mergeSources([1, 'a'], [])).toEqual(['a']);
  });

  it('faltet Namen auf eine Suchform', () => {
    expect(pageKey('Auth0')).toBe(pageKey('auth 0'));
    expect(pageKey('Rückmeldung')).toBe(pageKey('rueckmeldung'));
  });
});
