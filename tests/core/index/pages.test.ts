import { describe, expect, it } from 'vitest';
import { derivePages, deriveSources, parseWikilinks } from '@core/index/pages';
import { buildIndex } from '@core/index/build';
import type { VaultIndex } from '@core/index/types';
import { makeDoc, TODAY, vaultStore } from './fixtures';

const AUTH0 = 'identity-management/auth0';
const CONCEPT = 'identity-management/rollenbasierte-zugriffskontrolle';
const SOURCE = 'identity-management/s-2026-07-02-auth0-rbac-guide';
const KARPATHY = 'second-brain-methodik/karpathy';

async function index(): Promise<VaultIndex> {
  return buildIndex(vaultStore(), { now: TODAY });
}

describe('parseWikilinks', () => {
  it('liest `[[slug]]`, `[[modul/slug]]` und `[[slug|Text]]`', () => {
    const links = parseWikilinks('Siehe [[auth0]], [[identity/rbac]] und [[auth0|Auth0 selbst]].');
    expect(links).toEqual([
      { module: null, slug: 'auth0', label: null, raw: 'auth0' },
      { module: 'identity', slug: 'rbac', label: null, raw: 'identity/rbac' },
      { module: null, slug: 'auth0', label: 'Auth0 selbst', raw: 'auth0' },
    ]);
  });

  it('uebergeht Links in Code-Zaeunen und leere Klammern', () => {
    const body = ['[[echt]]', '```', '[[beispiel]]', '```', '[[]]', '[[ | ]]'].join('\n');
    expect(parseWikilinks(body).map((link) => link.slug)).toEqual(['echt']);
  });
});

describe('derivePages: Graph', () => {
  it('findet die Seiten, aber nicht Katalog und Chronik', async () => {
    const { pages } = await index();
    expect(pages.map((page) => page.slug).sort()).toEqual([
      'auth0',
      'karpathy',
      'overview',
      'rollenbasierte-zugriffskontrolle',
      's-2026-07-02-auth0-rbac-guide',
    ]);
    expect(pages.some((page) => page.path.endsWith('wiki/index.md'))).toBe(false);
  });

  it('nimmt Modul und Typ aus dem Ort, wenn das Frontmatter schweigt', async () => {
    const { pages } = await index();
    const page = pages.find((candidate) => candidate.slug === 'auth0');
    expect(page).toMatchObject({ module: 'identity-management', type: 'entity' });
    expect(page?.sources).toEqual(['s-2026-07-02-auth0-rbac-guide']);
    expect(page?.wordCount).toBeGreaterThan(5);
  });

  it('sammelt outbound modulweit und ueber Modulgrenzen', async () => {
    const { pages } = await index();
    const auth0 = pages.find((page) => `${page.module}/${page.slug}` === AUTH0);
    expect(auth0?.outbound).toEqual([SOURCE, KARPATHY]);
  });

  it('invertiert inbound ausschliesslich aus outbound', async () => {
    const { pages } = await index();
    const byId = new Map(pages.map((page) => [`${page.module}/${page.slug}`, page]));
    expect(byId.get(AUTH0)?.inbound).toEqual(['identity-management/overview', CONCEPT]);
    expect(byId.get(SOURCE)?.inbound).toEqual([AUTH0, CONCEPT]);
    expect(byId.get(KARPATHY)?.inbound).toEqual([AUTH0]);
    // Was in einem Code-Zaun steht, taucht im Graphen nirgends auf.
    for (const page of pages) {
      expect(page.outbound.some((target) => target.endsWith('nur-ein-beispiel'))).toBe(false);
    }
  });

  it('meldet kaputte Links statt sie zu verschlucken', async () => {
    const { brokenLinks } = await index();
    expect(brokenLinks).toEqual([
      {
        from: AUTH0,
        target: 'gibt-es-nicht',
        path: 'modules/identity-management/wiki/entities/auth0.md',
      },
    ]);
  });

  it('zaehlt je Modul, auch wenn ein Modul keine Seiten hat', async () => {
    const { counts } = await index();
    expect(counts.get('identity-management')).toEqual({ sources: 1, entities: 1, concepts: 1 });
    expect(counts.get('second-brain-methodik')).toEqual({ sources: 0, entities: 1, concepts: 0 });
  });

  it('nimmt ein Verdichtungs-Artefakt nicht in den Seitengraphen auf (039, AC7/AC8)', () => {
    // `isWikiPage()` verlangt `modules/*/wiki/**` — ein `areas/<slug>.condensed.md`
    // passt nie, egal welchen `docType` das Dokument traegt. Das ist die
    // strukturelle Ausnahme, die 039 mit einem Test statt einer neuen Regel belegt.
    const docs = [
      makeDoc({
        path: 'modules/m/wiki/concepts/a.md',
        docType: 'concept',
        frontmatter: { type: 'concept', title: 'A' },
        body: 'Ein Begriff.',
      }),
      makeDoc({
        path: 'areas/gesundheit.condensed.md',
        docType: 'condensed',
        frontmatter: { type: 'condensed', title: 'Gesundheit — verdichtet' },
        body: 'Laufen, schlafen, weniger Kaffee.',
      }),
    ];
    const { pages, counts } = derivePages(docs);
    expect(pages.some((page) => page.path === 'areas/gesundheit.condensed.md')).toBe(false);
    expect(pages.map((page) => page.slug)).toEqual(['a']);
    // Ein Artefakt gehoert zu keinem Modul — die Zaehlung von `m` bleibt unberuehrt.
    expect(counts.get('m')).toEqual({ sources: 0, entities: 0, concepts: 1 });
    expect(counts.has('areas')).toBe(false);
  });

  it('nimmt ein Projekt-Verdichtungs-Artefakt ebenfalls nicht in den Seitengraphen auf (046, D3)', () => {
    // Dieselbe strukturelle Ausnahme wie beim Area-Artefakt oben: `isWikiPage()`
    // verlangt `modules/*/wiki/**`, und `projects/<scope>/<slug>/condensed.md`
    // passt da nie hinein — kein Sonderfall, keine neue Regel.
    const docs = [
      makeDoc({
        path: 'modules/m/wiki/concepts/a.md',
        docType: 'concept',
        frontmatter: { type: 'concept', title: 'A' },
        body: 'Ein Begriff.',
      }),
      makeDoc({
        path: 'projects/work/nyota/condensed.md',
        docType: 'condensed',
        frontmatter: { type: 'condensed', title: 'Nyota — verdichtet' },
        body: 'Rollenkonzept liegt bei Stefan.',
      }),
    ];
    const { pages, counts } = derivePages(docs);
    expect(pages.some((page) => page.path === 'projects/work/nyota/condensed.md')).toBe(false);
    expect(pages.map((page) => page.slug)).toEqual(['a']);
    expect(counts.get('m')).toEqual({ sources: 0, entities: 0, concepts: 1 });
    expect(counts.has('projects')).toBe(false);
  });

  it('nimmt einen Selbstverweis nicht in den Graphen', () => {
    const docs = [
      makeDoc({
        path: 'modules/m/wiki/concepts/a.md',
        frontmatter: { type: 'concept', title: 'A' },
        body: 'Ich verweise auf [[a]] und auf [[b]].',
      }),
      makeDoc({
        path: 'modules/m/wiki/concepts/b.md',
        frontmatter: { type: 'concept', title: 'B' },
        body: 'Nichts.',
      }),
    ];
    const { pages, brokenLinks } = derivePages(docs);
    expect(pages[0]?.outbound).toEqual(['m/b']);
    expect(brokenLinks).toEqual([]);
  });
});

describe('deriveSources', () => {
  it('liest `.ingest.json` und zaehlt die Bytes der Quelle', async () => {
    const { sources } = await index();
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      path: 'raw/youtube/xOFkpf9KgKg',
      kind: 'youtube',
      title: 'Your AI Second Brain Is Slowly Rotting',
      ingestedAt: '2026-08-10T14:40:00+02:00',
      sourcePage: 's-2026-08-10-ai-second-brain-rotting',
      origin: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
      modules: ['second-brain-methodik'],
    });
    expect(sources[0]?.bytes).toBeGreaterThan(100);
  });

  it('versteckt eine Quelle nicht, wenn das Protokoll kaputt ist', () => {
    const sources = deriveSources([
      { path: 'raw/files/2026-08-10-vertrag', json: '{ kaputt', bytes: 12, modified: 'M1' },
      { path: 'raw/web/2026-08-10-artikel', json: null, bytes: 3, modified: 'M2' },
    ]);
    expect(sources.map((source) => [source.kind, source.title, source.ingestedAt])).toEqual([
      ['url', '2026-08-10-artikel', 'M2'],
      ['file', '2026-08-10-vertrag', 'M1'],
    ]);
  });
});
