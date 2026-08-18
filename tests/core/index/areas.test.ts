/* Areas read from the files. This is the read path for something that was
   write-only until now: the filing path has been appending dated blocks into
   `areas/<slug>.md` for a while, and nothing in the app ever looked at them.

   Three things are checked hard, because getting them wrong loses content without
   ever raising an error:

   - "Notizen" and "Notes" are the same section (folded), so a file written by the
     filing path and a file written per VAULT-FORMAT.md both read.
   - An entry with an unparsable heading — or none at all — survives, at the end,
     in file order. It is the user's text; being untidy is not a reason to drop it.
   - The persisted index carries areas, so a restart shows the same screen. */

import { describe, expect, it } from 'vitest';
import { deriveAreas, parseAreaNotes } from '@core/index/areas';
import { buildIndex } from '@core/index/build';
import { VaultIndexStore } from '@core/index/persist';
import { IndexService } from '@core/index/service';
import { parseTodos } from '@core/index/todos';
import type { IndexedDoc } from '@core/index/types';
import { TODAY, makeDoc, vaultStore } from './fixtures';

/** Frontmatter of the fixture below takes eight lines, the body starts on nine. */
const BODY_LINE = 9;

const GERMAN_BODY = [
  '## Worum es geht',
  '',
  'Rücken, Schlaf, Bewegung.',
  '',
  '## Todos',
  '',
  '- [ ] Termin beim Physiotherapeuten machen',
  '- [x] Schlafzeiten mitgeschrieben',
  '',
  '## Notizen',
  '',
  '### 2026-07-28',
  '',
  'Der Rücken meldet sich bei langen Sitzungen.',
  '',
  '### 2026-08-04',
  '',
  'Zwei Wochen Schlafprotokoll.',
  '',
].join('\n');

/** The same content as VAULT-FORMAT.md writes it: English heading. */
const ENGLISH_BODY = [
  '## Notes',
  '',
  '### 2026-07-28',
  '',
  'Der Rücken meldet sich bei langen Sitzungen.',
  '',
  '### 2026-08-04',
  '',
  'Zwei Wochen Schlafprotokoll.',
  '',
].join('\n');

function areaDoc(body: string, partial: Partial<IndexedDoc> = {}): IndexedDoc {
  return makeDoc({
    path: 'areas/gesundheit.md',
    docType: 'area',
    title: 'Gesundheit',
    bodyLine: BODY_LINE,
    frontmatter: { type: 'area', title: 'Gesundheit', scope: 'privat' },
    body,
    ...partial,
  });
}

/** The todos of a document, exactly as `deriveIndex` hands them over. */
function todosOf(doc: IndexedDoc) {
  return parseTodos(doc.body, {
    path: doc.path,
    frontmatter: doc.frontmatter,
    lineOffset: doc.bodyLine,
    today: TODAY,
  });
}

describe('deriveAreas', () => {
  it('reads an area with its notes, newest first', () => {
    const doc = areaDoc(GERMAN_BODY);
    const areas = deriveAreas([doc], todosOf(doc));

    expect(areas).toHaveLength(1);
    const area = areas[0];
    expect(area).toMatchObject({
      path: 'areas/gesundheit.md',
      slug: 'gesundheit',
      title: 'Gesundheit',
      scope: 'private',
      hash: doc.hash,
      noteCount: 2,
      openTodoCount: 1,
    });
    expect(area?.notes).toEqual([
      {
        day: '2026-08-04',
        heading: '2026-08-04',
        // Body line 15 of the fixture, plus the eight frontmatter lines.
        line: BODY_LINE + 15,
        excerpt: 'Zwei Wochen Schlafprotokoll.',
      },
      {
        day: '2026-07-28',
        heading: '2026-07-28',
        line: BODY_LINE + 11,
        excerpt: 'Der Rücken meldet sich bei langen Sitzungen.',
      },
    ]);
  });

  it('reads the English heading exactly the same way', () => {
    const german = deriveAreas([areaDoc(GERMAN_BODY)]);
    const english = deriveAreas([areaDoc(ENGLISH_BODY)]);
    expect(english[0]?.notes.map((note) => note.day)).toEqual(['2026-08-04', '2026-07-28']);
    expect(english[0]?.notes.map((note) => note.excerpt)).toEqual(
      german[0]?.notes.map((note) => note.excerpt),
    );
  });

  it('ignores everything that is not an area file', () => {
    const docs = [
      makeDoc({ path: 'projects/work/nyota/project.md', docType: 'project', body: GERMAN_BODY }),
      makeDoc({ path: 'journal/2026/08/2026-08-04.md', docType: 'journal', body: GERMAN_BODY }),
      areaDoc(GERMAN_BODY),
    ];
    expect(deriveAreas(docs).map((area) => area.path)).toEqual(['areas/gesundheit.md']);
  });

  it('counts only the open todos of its own file', () => {
    const area = areaDoc(GERMAN_BODY);
    const other = makeDoc({
      path: 'areas/kueche.md',
      docType: 'area',
      body: '## Todos\n\n- [ ] Kalk entfernen\n- [ ] Dichtung tauschen\n',
    });
    const todos = [...todosOf(area), ...todosOf(other)];
    const counts = new Map(deriveAreas([area, other], todos).map((one) => [one.slug, one]));
    expect(counts.get('gesundheit')?.openTodoCount).toBe(1);
    expect(counts.get('kueche')?.openTodoCount).toBe(2);
  });

  it('falls back to private when nothing names a scope, and reads a tag', () => {
    const bare = areaDoc(GERMAN_BODY, { frontmatter: {} });
    expect(deriveAreas([bare])[0]?.scope).toBe('private');
    const tagged = areaDoc(GERMAN_BODY, { frontmatter: { tags: ['arbeit'] } });
    expect(deriveAreas([tagged])[0]?.scope).toBe('work');
  });

  it('sorts the areas by their newest entry, areas without one last', () => {
    const docs = [
      areaDoc('## Notizen\n\n### 2026-06-01\n\nAlt.\n', { path: 'areas/alt.md', title: 'Alt' }),
      areaDoc('## Worum es geht\n\nNoch nichts notiert.\n', {
        path: 'areas/leer.md',
        title: 'Leer',
      }),
      areaDoc('## Notizen\n\n### 2026-08-04\n\nFrisch.\n', {
        path: 'areas/frisch.md',
        title: 'Frisch',
      }),
    ];
    expect(deriveAreas(docs).map((area) => area.slug)).toEqual(['frisch', 'alt', 'leer']);
  });
});

describe('parseAreaNotes: nothing gets lost', () => {
  it('keeps entries without a parsable date, at the end, in file order', () => {
    const body = [
      '## Notizen',
      '',
      'Lose Prosa ohne Überschrift.',
      '',
      '### Gedanke ohne Datum',
      '',
      'Kam mir beim Laufen.',
      '',
      '### 2026-08-01',
      '',
      'Mit Datum.',
      '',
      '### 1. August',
      '',
      'Von Hand geschrieben.',
      '',
    ].join('\n');

    expect(parseAreaNotes(body)).toEqual([
      { day: '2026-08-01', heading: '2026-08-01', line: 9, excerpt: 'Mit Datum.' },
      { day: null, heading: null, line: 3, excerpt: 'Lose Prosa ohne Überschrift.' },
      { day: null, heading: 'Gedanke ohne Datum', line: 5, excerpt: 'Kam mir beim Laufen.' },
      { day: null, heading: '1. August', line: 13, excerpt: 'Von Hand geschrieben.' },
    ]);
  });

  it('keeps two entries of the same day in file order', () => {
    const body = [
      '## Notizen',
      '',
      '### 2026-08-04',
      '',
      'Erster Eintrag des Tages.',
      '',
      '### 2026-08-04',
      '',
      'Zweiter Eintrag des Tages.',
      '',
    ].join('\n');
    expect(parseAreaNotes(body).map((note) => note.excerpt)).toEqual([
      'Erster Eintrag des Tages.',
      'Zweiter Eintrag des Tages.',
    ]);
  });

  it('reads both halves when a file carries the notes section twice', () => {
    const body = [
      '## Notizen',
      '',
      '### 2026-08-01',
      '',
      'Eins.',
      '',
      '## Notes',
      '',
      '### 2026-08-02',
      '',
      'Zwei.',
      '',
    ].join('\n');
    expect(parseAreaNotes(body).map((note) => note.day)).toEqual(['2026-08-02', '2026-08-01']);
  });

  it('does not read entries that stand outside the notes section', () => {
    const body = [
      '## Worum es geht',
      '',
      '### 2026-08-01',
      '',
      'Gehört nicht zu den Notizen.',
      '',
      '## Notizen',
      '',
      '### 2026-08-02',
      '',
      'Gehört dazu.',
      '',
    ].join('\n');
    expect(parseAreaNotes(body).map((note) => note.excerpt)).toEqual(['Gehört dazu.']);
  });

  it('is empty for a file without a notes section and for an empty section', () => {
    expect(parseAreaNotes('## Worum es geht\n\nNur Prosa.\n')).toEqual([]);
    expect(parseAreaNotes('## Notizen\n\n')).toEqual([]);
    expect(parseAreaNotes('')).toEqual([]);
  });
});

describe('areas in the index', () => {
  it('the built index carries the areas of the vault', async () => {
    const index = await buildIndex(vaultStore(), { now: TODAY });
    expect(index.areas.map((area) => area.slug)).toEqual(['gesundheit']);
    expect(index.areas[0]).toMatchObject({
      path: 'areas/gesundheit.md',
      title: 'Gesundheit',
      noteCount: 2,
      openTodoCount: 2,
      scope: 'private',
    });
    expect(index.areas[0]?.notes.map((note) => note.day)).toEqual(['2026-08-04', '2026-07-28']);
  });

  it('survives the round trip through the persisted index', async () => {
    const store = vaultStore();
    const persistence = new VaultIndexStore(store);
    const index = await buildIndex(store, { now: TODAY });
    await persistence.save(index);

    const loaded = await persistence.load();
    expect(loaded?.index.areas).toEqual(index.areas);
    expect(loaded?.index.areas[0]?.notes).toHaveLength(2);
  });

  it('`IndexService.areas()` hands out the same list', async () => {
    const service = await IndexService.open(vaultStore(), {
      now: () => new Date(`${TODAY}T09:00:00.000Z`),
      persistence: null,
    });
    expect(service.areas()).toBe(service.index().areas);
    expect(service.areas().map((area) => area.slug)).toEqual(['gesundheit']);
  });
});
