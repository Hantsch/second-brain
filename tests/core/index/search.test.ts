import { beforeAll, describe, expect, it } from 'vitest';
import { SearchEngine } from '@core/index/search';
import { buildIndex } from '@core/index/build';
import { makeSnippet } from '@core/index/snippet';
import type { SearchHit, SearchQuery } from '@shared/types';
import type { IndexedDoc, VaultIndex } from '@core/index/types';
import { makeDoc, TODAY, vaultStore } from './fixtures';

let index: VaultIndex;
let engine: SearchEngine;

beforeAll(async () => {
  index = await buildIndex(vaultStore(), { now: TODAY });
  engine = SearchEngine.from(index.docs);
});

function find(query: SearchQuery): SearchHit[] {
  return engine.search(query, index.byPath);
}

function paths(hits: readonly SearchHit[]): string[] {
  return hits.map((hit) => hit.path).sort();
}

describe('SearchEngine: deutsche Woerter', () => {
  it('findet ein Umlautwort in beiden Schreibweisen', () => {
    const withUmlaut = find({ text: 'Rückmeldung' });
    const written = find({ text: 'Rueckmeldung' });
    expect(withUmlaut.length).toBeGreaterThan(0);
    expect(paths(written)).toEqual(paths(withUmlaut));
    expect(paths(written)).toContain(
      'modules/identity-management/wiki/concepts/rollenbasierte-zugriffskontrolle.md',
    );
  });

  it('findet ein Wortanfang-Fragment (Praefix)', () => {
    const hits = find({ text: 'dokum' });
    expect(paths(hits)).toContain('projects/work/nyota-auth0-migration/project.md');
  });

  it('verzeiht einen Tippfehler (fuzzy)', () => {
    const hits = find({ text: 'Terrafrom' });
    expect(paths(hits)).toContain('projects/work/nyota-auth0-migration/project.md');
  });

  it('findet die zweite Haelfte eines Kompositums als Teilwort', () => {
    const hits = find({ text: 'konzept' });
    expect(paths(hits)).toContain('inbox/2026-08-10-1432-gedanke-zur-suche.md');
    // Das ganze Wort steht im Katalog des Moduls — der Volltreffer fuehrt.
    expect(hits[0]?.path).toBe('modules/identity-management/wiki/index.md');
    expect(hits[0]?.score).toBeCloseTo(1, 5);
    // Alles, was nur als Teilwort trifft, liegt darunter und ist als solches erkennbar.
    for (const hit of hits.slice(1)) expect(hit.score).toBeCloseTo(0.3, 5);
    expect(hits.length).toBeGreaterThan(3);
  });
});

describe('SearchEngine: Bereiche', () => {
  /* Areas (`areas/<slug>.md`, `docType: 'area'`) are indexed like every other
     document — `SearchEngine.from` never branches on `docType`. This proves
     it: a phrase that only occurs in the area fixture (`areas/gesundheit.md`)
     is findable, and the hit carries `docType: 'area'` so the palette can
     route it to the Notes screen (story 005, D10). */
  it('findet eine Notiz in einem Bereich wie jedes andere Dokument', () => {
    const hits = find({ text: 'Schlafprotokoll' });
    const hit = hits.find((candidate) => candidate.path === 'areas/gesundheit.md');
    expect(hit).toBeDefined();
    expect(hit?.docType).toBe('area');
  });
});

describe('SearchEngine: Snippet', () => {
  it('markiert die Fundstelle mit ** und bleibt in der Laenge', () => {
    const hit = find({ text: 'konzept' }).find(
      (candidate) => candidate.path === 'inbox/2026-08-10-1432-gedanke-zur-suche.md',
    );
    expect(hit?.snippet).toContain('Rollen**konzept**');
    expect((hit?.snippet ?? '').length).toBeLessThanOrEqual(260);
  });

  it('markiert auch, wenn die Anfrage die ASCII-Form eines Umlauts benutzt', () => {
    const hit = find({ text: 'Rueckmeldung' }).find((candidate) =>
      candidate.path.endsWith('rollenbasierte-zugriffskontrolle.md'),
    );
    expect(hit?.snippet).toContain('**Rückmeldung**');
  });

  it('zentriert das Fenster und schneidet an Wortgrenzen', () => {
    const body = [
      'Ein langer Vorlauf, der nur dazu da ist, das Fenster zu verschieben und die',
      'Grenzen zu pruefen, damit kein Wort mitten entzwei geht und der Anfang',
      'gekuerzt wird, weil der Treffer weit hinten steht.',
      'Hier steht das Rollenkonzept mitten im Text.',
      'Danach folgt noch einiges an Nachlauf, damit auch hinten gekuerzt werden muss',
      'und beide Auslassungszeichen erscheinen.',
    ].join(' ');
    const snippet = makeSnippet(body, ['rollenkonzept'], 120);
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('**Rollenkonzept**');
    expect(snippet).not.toContain('  ');
    expect(snippet.length).toBeLessThanOrEqual(140);
  });

  it('nimmt den Textanfang, wenn es nichts zu markieren gibt', () => {
    expect(makeSnippet('Kurzer Text ohne Treffer.', ['zebra'])).toBe('Kurzer Text ohne Treffer.');
    expect(makeSnippet('', ['zebra'])).toBe('');
  });
});

describe('SearchEngine: Filter', () => {
  it('nach Dokumenttyp', () => {
    const hits = find({ text: 'Rollenkonzept', types: ['project'] });
    expect(paths(hits)).toEqual(['projects/work/nyota-auth0-migration/project.md']);
  });

  it('findet ein Verdichtungs-Artefakt wie jedes Dokument und filtert es ueber `types` (039, AC8)', () => {
    // Ein Artefakt ist ein ganz normales `IndexedDoc` mit `docType: 'condensed'` —
    // `SearchEngine.from` verzweigt nirgends nach `docType`, das ist keine
    // Sonderbehandlung, sondern die Abwesenheit einer.
    const artifact = makeDoc({
      path: 'areas/gesundheit.condensed.md',
      docType: 'condensed',
      title: 'Gesundheit — verdichtet',
      body: 'Vor Mitternacht ins Bett wirkt spuerbar auf die Konzentration am Vormittag.',
    });
    const docs = [...index.docs, artifact];
    const combined = SearchEngine.from(docs);
    const byPath = new Map(docs.map((doc) => [doc.path, doc]));
    const search = (query: SearchQuery): SearchHit[] => combined.search(query, byPath);

    const plain = search({ text: 'Konzentration am Vormittag' });
    expect(plain.some((hit) => hit.path === artifact.path)).toBe(true);

    const scoped = search({ text: 'Konzentration am Vormittag', types: ['condensed'] });
    expect(scoped.map((hit) => hit.path)).toEqual([artifact.path]);
    expect(scoped[0]?.docType).toBe('condensed');

    const wrongType = search({ text: 'Konzentration am Vormittag', types: ['project'] });
    expect(wrongType).toEqual([]);
  });

  it('findet ein Projekt-Verdichtungs-Artefakt ebenso und filtert es ueber `types` (046, D3)', () => {
    // Dieselbe Abwesenheit einer Sonderbehandlung wie beim Area-Artefakt oben,
    // nur mit dem Projekt-Pfad `projects/<scope>/<slug>/condensed.md`.
    const artifact = makeDoc({
      path: 'projects/work/nyota/condensed.md',
      docType: 'condensed',
      title: 'Nyota — verdichtet',
      body: 'Kartoffelsuppe und Bahnhofsuhr stehen als Beispiele nebeneinander im Testtext.',
    });
    const docs = [...index.docs, artifact];
    const combined = SearchEngine.from(docs);
    const byPath = new Map(docs.map((doc) => [doc.path, doc]));
    const search = (query: SearchQuery): SearchHit[] => combined.search(query, byPath);

    const plain = search({ text: 'Kartoffelsuppe Bahnhofsuhr' });
    expect(plain.some((hit) => hit.path === artifact.path)).toBe(true);

    const scoped = search({ text: 'Kartoffelsuppe Bahnhofsuhr', types: ['condensed'] });
    expect(scoped.map((hit) => hit.path)).toEqual([artifact.path]);
    expect(scoped[0]?.docType).toBe('condensed');

    const wrongType = search({ text: 'Kartoffelsuppe Bahnhofsuhr', types: ['project'] });
    expect(wrongType).toEqual([]);
  });

  it('nach Modul', () => {
    const hits = find({ text: 'Rollen', module: 'identity-management' });
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) expect(hit.module).toBe('identity-management');
  });

  it('nach Tags — alle angegebenen muessen dran sein', () => {
    expect(paths(find({ text: 'Rollen', tags: ['rbac'] }))).toEqual([
      'modules/identity-management/wiki/concepts/rollenbasierte-zugriffskontrolle.md',
      'modules/identity-management/wiki/sources/s-2026-07-02-auth0-rbac-guide.md',
    ]);
    expect(find({ text: 'Rollen', tags: ['rbac', 'gibt-es-nicht'] })).toEqual([]);
  });

  it('nach Datum', () => {
    expect(find({ text: 'Rollen', since: '2026-08-09' }).length).toBeGreaterThan(0);
    expect(find({ text: 'Rollen', since: '2026-08-11' })).toEqual([]);
  });

  it('haelt sich an das Limit', () => {
    expect(find({ text: 'Rollen', limit: 2 })).toHaveLength(2);
  });
});

describe('SearchEngine: Werte und Leerzustand', () => {
  it('normalisiert auf 0..1 mit dem besten Treffer bei 1', () => {
    const hits = find({ text: 'Rollenkonzept' });
    expect(hits[0]?.score).toBeCloseTo(1, 5);
    for (const hit of hits) {
      expect(hit.score).toBeGreaterThan(0);
      expect(hit.score).toBeLessThanOrEqual(1);
    }
  });

  it('wiegt den Titel schwerer als den Rumpf', () => {
    const docs = [
      makeDoc({ path: 'a.md', title: 'Nur Rumpf', body: 'Rollen Rollen Rollen Rollen Rollen.' }),
      makeDoc({ path: 'b.md', title: 'Rollen im Ueberblick', body: 'Nichts zur Sache.' }),
    ];
    const small = SearchEngine.from(docs);
    const hits = small.search({ text: 'Rollen' }, new Map(docs.map((doc) => [doc.path, doc])));
    expect(hits[0]?.path).toBe('b.md');
  });

  it('antwortet auf eine leere Anfrage mit den juengsten Dokumenten', () => {
    const hits = find({ text: '   ', limit: 3 });
    expect(hits).toHaveLength(3);
    expect(hits[0]?.path).toBe('inbox/2026-08-10-1432-gedanke-zur-suche.md');
    expect(hits[0]?.score).toBe(0);
    expect(hits[0]?.snippet.length).toBeGreaterThan(0);
    const sorted = [...hits].sort((a, b) => (a.updated < b.updated ? 1 : -1));
    expect(hits.map((hit) => hit.path)).toEqual(sorted.map((hit) => hit.path));
  });

  it('filtert auch die leere Anfrage', () => {
    const hits = find({ text: '', types: ['dump'] });
    expect(paths(hits)).toEqual(['inbox/2026-08-10-1432-gedanke-zur-suche.md']);
  });

  it('liefert nichts, aber wirft nicht, wenn es keinen Treffer gibt', () => {
    expect(find({ text: 'zebrastreifenmalerei' })).toEqual([]);
  });
});

describe('SearchEngine: Nachziehen', () => {
  it('ersetzt und entfernt einzelne Dokumente', () => {
    const doc = makeDoc({ path: 'a.md', title: 'Erst so', body: 'Anfangstext.' });
    const engineTwo = SearchEngine.from([doc]);
    const lookup = new Map([[doc.path, doc]]);
    expect(engineTwo.size).toBe(1);

    const changed = makeDoc({ path: 'a.md', title: 'Jetzt anders', body: 'Kaffeemaschine.' });
    engineTwo.replace(changed);
    lookup.set(changed.path, changed);
    expect(engineTwo.size).toBe(1);
    expect(engineTwo.search({ text: 'Kaffeemaschine' }, lookup)).toHaveLength(1);
    expect(engineTwo.search({ text: 'Anfangstext' }, lookup)).toEqual([]);

    // Der Dienst haelt Suchindex und Dokumentliste zusammen — der Teilwort-Notausgang
    // sieht nur die Dokumentliste, deshalb muss beides weg.
    engineTwo.remove('a.md');
    lookup.delete('a.md');
    expect(engineTwo.has('a.md')).toBe(false);
    expect(engineTwo.search({ text: 'Kaffeemaschine' }, lookup)).toEqual([]);
  });
});

// ── 053: passages, not whole files ──────────────────────────────────────────

/** One paragraph just under the passage target, so every paragraph is its own passage. */
function paragraph(lead: string): string {
  return `${lead} ${'fuellwort '.repeat(270)}`.trim();
}

/** A body of `count` paragraphs; `lead(i)` opens paragraph i. Long enough to be split. */
function longBody(count: number, lead: (i: number) => string): string {
  return Array.from({ length: count }, (_, i) => paragraph(lead(i))).join('\n\n');
}

function lookupOf(docs: readonly IndexedDoc[]): Map<string, IndexedDoc> {
  return new Map(docs.map((doc) => [doc.path, doc]));
}

describe('SearchEngine: passages (053)', () => {
  const LONG = 'raw/youtube/lang/transcript.md';

  it('a long document matching in several passages is one search hit', () => {
    const long = makeDoc({
      path: LONG,
      body: longBody(10, (i) => ([1, 4, 7].includes(i) ? 'zitronenfalter' : 'absatz')),
    });
    expect(long.passages).toHaveLength(10);
    const other = makeDoc({ path: 'notes/other.md', body: 'Nichts Passendes hier.' });
    const docs = [long, other];
    const hits = SearchEngine.from(docs).search({ text: 'zitronenfalter' }, lookupOf(docs));
    expect(hits.map((hit) => hit.path)).toEqual([LONG]);
  });

  it('collapsing happens before the limit cut', () => {
    const MARKED = [0, 2, 4, 6, 8];
    // The term ten times per passage: the long file's passages outrank every short file,
    // so cutting to the limit before collapsing would leave a single path.
    const long = makeDoc({
      path: LONG,
      body: longBody(10, (i) => (MARKED.includes(i) ? 'zitronenfalter '.repeat(10) : 'absatz')),
    });
    const shorts = ['a', 'b', 'c'].map((name) =>
      makeDoc({ path: `notes/${name}.md`, body: paragraph('zitronenfalter') }),
    );
    const docs = [long, ...shorts];
    const engine = SearchEngine.from(docs);
    // Precondition of the claim: uncollapsed, the top three all belong to the long file.
    const top = engine.searchPassages({ text: 'zitronenfalter', limit: 3 }, lookupOf(docs));
    expect(top.map((hit) => hit.path)).toEqual([LONG, LONG, LONG]);

    const hits = engine.search({ text: 'zitronenfalter', limit: 3 }, lookupOf(docs));
    expect(hits).toHaveLength(3);
    expect(new Set(hits.map((hit) => hit.path)).size).toBe(3);
    expect(hits[0]?.path).toBe(LONG);
  });

  it('searchPassages returns several passages of one document with their lines', () => {
    const long = makeDoc({
      path: LONG,
      bodyLine: 6,
      body: longBody(10, (i) => ([1, 4, 7].includes(i) ? 'zitronenfalter' : 'absatz')),
    });
    const docs = [long];
    const hits = SearchEngine.from(docs).searchPassages({ text: 'zitronenfalter' }, lookupOf(docs));
    expect(hits).toHaveLength(3);
    const expected = [1, 4, 7].map((n) => {
      const passage = long.passages[n];
      return { path: LONG, startLine: passage?.startLine, endLine: passage?.endLine };
    });
    const got = hits
      .map(({ path, startLine, endLine }) => ({ path, startLine, endLine }))
      .sort((a, b) => a.startLine - b.startLine);
    expect(got).toEqual(expected);
    expect(got[0]?.startLine).toBeGreaterThan(6);
    for (let i = 1; i < hits.length; i += 1) {
      expect(hits[i]?.score).toBeLessThanOrEqual(hits[i - 1]?.score ?? 0);
    }
  });

  it('replacing a long document leaves no stale passage', () => {
    const before = makeDoc({
      path: LONG,
      body: longBody(10, (i) => (i === 8 ? 'schmetterling' : 'absatz')),
    });
    const after = makeDoc({ path: LONG, body: longBody(2, () => 'absatz') });
    expect(after.passages).toHaveLength(2);
    const engine = SearchEngine.from([before]);
    expect(engine.search({ text: 'schmetterling' }, lookupOf([before]))).toHaveLength(1);

    engine.replace(after);
    const lookup = lookupOf([after]);
    expect(engine.search({ text: 'schmetterling' }, lookup)).toEqual([]);
    expect(engine.searchPassages({ text: 'schmetterling' }, lookup)).toEqual([]);
    expect(engine.serialize().documentCount).toBe(2);
    expect(engine.size).toBe(1);

    engine.remove(LONG);
    expect(engine.has(LONG)).toBe(false);
    expect(engine.serialize().documentCount).toBe(0);
  });

  it('a persisted engine reloads and still replaces per path', () => {
    const before = makeDoc({
      path: LONG,
      body: longBody(10, (i) => (i === 8 ? 'schmetterling' : 'absatz')),
    });
    const other = makeDoc({ path: 'notes/other.md', body: 'Ein kurzer Eintrag.' });
    const saved = JSON.parse(JSON.stringify(SearchEngine.from([before, other]).serialize()));
    const restored = SearchEngine.restore(saved);
    if (restored === null) throw new Error('restore rejected its own state');
    expect(restored.size).toBe(2);
    expect(restored.has(LONG)).toBe(true);

    const after = makeDoc({ path: LONG, body: longBody(2, () => 'absatz') });
    restored.replace(after);
    const lookup = lookupOf([after, other]);
    expect(restored.search({ text: 'schmetterling' }, lookup)).toEqual([]);
    expect(restored.serialize().documentCount).toBe(3);
    expect(restored.search({ text: 'kurzer Eintrag' }, lookup).map((hit) => hit.path)).toEqual([
      'notes/other.md',
    ]);
  });
});

describe('SearchEngine: evidence passages', () => {
  const GARDEN = 'notes/garten.md';
  const COMPOST = 'notes/kompost.md';
  const WATER = 'notes/wasser.md';

  it('drops a passage that shares only one of four words with the query', () => {
    const docs = [
      makeDoc({ path: GARDEN, body: 'Kompost und Erde für das Hochbeet im Garten.' }),
      makeDoc({ path: COMPOST, body: 'Der Kompost braucht Zeit.' }),
    ];
    const hits = SearchEngine.from(docs).searchPassages(
      { text: 'Kompost Erde Hochbeet Regen' },
      lookupOf(docs),
    );
    expect(hits.map((hit) => hit.path)).toEqual([GARDEN]);
  });

  it('does not match function words fuzzily', () => {
    const docs = [makeDoc({ path: WATER, body: 'Die sieben Wasser, die sie sah.' })];
    expect(
      SearchEngine.from(docs).searchPassages({ text: 'was sind agents?' }, lookupOf(docs)),
    ).toEqual([]);
  });

  it('leaves out excluded files before the cut', () => {
    const docs = [
      makeDoc({ path: GARDEN, body: 'Kompost.' }),
      makeDoc({ path: COMPOST, body: 'Kompost.' }),
    ];
    const hits = SearchEngine.from(docs).searchPassages(
      { text: 'Kompost', limit: 1 },
      lookupOf(docs),
      {
        exclude: (path) => path === GARDEN,
      },
    );
    expect(hits.map((hit) => hit.path)).toEqual([COMPOST]);
  });
});
