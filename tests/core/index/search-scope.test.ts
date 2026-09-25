import { describe, expect, it } from 'vitest';
import { SearchEngine } from '@core/index/search';
import type { SearchHit, SearchQuery } from '@shared/types';
import { makeDoc } from './fixtures';

/**
 * `SearchQuery.scope` must narrow results to a matching `IndexedDoc.scope` —
 * and it must do so *before* the result count is cut down to `limit`, not
 * after. A related bug (story 052) came from exactly the wrong order: a
 * filter applied after the limit cut can silently lose a matching document
 * because non-matching documents already consumed the limited slots.
 */
describe('SearchEngine: scope', () => {
  function docsFor() {
    // Four 'work' documents, all with the query term in the title — the
    // strongest possible score (BOOST.title in search.ts) — plus one
    // 'private' document that only carries the term in its body, the
    // weakest score. Ranked by relevance alone, every 'work' doc outranks
    // the 'private' one.
    const work = ['one', 'two', 'three', 'four'].map((suffix) =>
      makeDoc({
        path: `projects/work/${suffix}.md`,
        docType: 'project',
        title: `Kobalt Vorhaben ${suffix}`,
        scope: 'work',
        body: 'Nichts weiter von Belang.',
      }),
    );
    const private_ = makeDoc({
      path: 'areas/kobalt-notiz.md',
      docType: 'area',
      title: 'Etwas anderes',
      scope: 'private',
      body: 'Kobalt taucht hier nur im Fliesstext auf.',
    });
    return [...work, private_];
  }

  function search(query: SearchQuery): SearchHit[] {
    const docs = docsFor();
    const engine = SearchEngine.from(docs);
    const byPath = new Map(docs.map((doc) => [doc.path, doc]));
    return engine.search(query, byPath);
  }

  it('nur Dokumente mit passendem Scope', () => {
    const hits = search({ text: 'Kobalt', scope: 'work' });
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect([
        'projects/work/one.md',
        'projects/work/two.md',
        'projects/work/three.md',
        'projects/work/four.md',
      ]).toContain(hit.path);
    }
  });

  it('wendet den Scope-Filter vor dem Limit an — sonst verdraengen bessere, aber falsche Treffer den richtigen', () => {
    // Without correct ordering, the top-ranked 'work' doc would be taken
    // by `limit: 1` first and only then discarded by the scope filter,
    // leaving an empty result even though a matching 'private' doc exists.
    const hits = search({ text: 'Kobalt', scope: 'private', limit: 1 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.path).toBe('areas/kobalt-notiz.md');
  });

  it('liefert nichts, wenn kein Dokument den Scope hat, statt den Filter zu ignorieren', () => {
    const docs = docsFor().filter((doc) => doc.scope !== 'private');
    const engine = SearchEngine.from(docs);
    const byPath = new Map(docs.map((doc) => [doc.path, doc]));
    expect(engine.search({ text: 'Kobalt', scope: 'private' }, byPath)).toEqual([]);
  });
});

describe('SearchEngine: project', () => {
  function docsFor() {
    // Four docs in an unrelated project (or no project at all), all with the
    // query term in the title — the strongest possible score (BOOST.title in
    // search.ts) — plus one doc in the wanted project that only carries the
    // term in its body, the weakest score. Ranked by relevance alone, every
    // other-project doc outranks the wanted one.
    const other = ['one', 'two', 'three', 'four'].map((suffix) =>
      makeDoc({
        path: `projects/work/other-project/${suffix}.md`,
        docType: 'project',
        title: `Kobalt Vorhaben ${suffix}`,
        project: 'other-project',
        body: 'Nichts weiter von Belang.',
      }),
    );
    const inProject = makeDoc({
      path: 'projects/work/wanted-project/notes.md',
      docType: 'note',
      title: 'Etwas anderes',
      project: 'wanted-project',
      body: 'Kobalt taucht hier nur im Fliesstext auf.',
    });
    return [...other, inProject];
  }

  function search(query: SearchQuery): SearchHit[] {
    const docs = docsFor();
    const engine = SearchEngine.from(docs);
    const byPath = new Map(docs.map((doc) => [doc.path, doc]));
    return engine.search(query, byPath);
  }

  it('a project filter keeps the weak in-project hit that the limit would have cut', () => {
    // Without correct ordering, the top-ranked other-project doc would be
    // taken by `limit: 1` first and only then discarded by the project
    // filter, leaving an empty result even though a matching in-project doc
    // exists.
    const hits = search({ text: 'Kobalt', project: 'wanted-project', limit: 1 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.path).toBe('projects/work/wanted-project/notes.md');
  });
});
