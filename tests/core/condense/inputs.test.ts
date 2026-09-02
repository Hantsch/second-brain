/* Input selection for condensing an area (story 037, D5). Deterministic and
   model-free: given the indexed docs, the selector must return exactly the
   area's notes, its todos, and the day entries carrying its slug within the
   last ~90 days — nothing guessed, nothing silently dropped without being
   counted. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { areaInputs, CONDENSE_DAY_WINDOW_DAYS, selectCondenseInputs } from '@core/condense/inputs';
import type { IndexedDoc } from '@core/index/types';
import { makeDoc } from '../index/fixtures';

/** "Now" every window computation in this file is measured from. */
const NOW = '2026-08-10';

/** Frontmatter of the fixture area below takes eight lines, body starts on nine. */
const BODY_LINE = 9;

const AREA_BODY = [
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

function areaDoc(): IndexedDoc {
  return makeDoc({
    path: 'areas/gesundheit.md',
    docType: 'area',
    title: 'Gesundheit',
    bodyLine: BODY_LINE,
    frontmatter: { type: 'area', title: 'Gesundheit' },
    body: AREA_BODY,
  });
}

function journalDoc(partial: Partial<IndexedDoc> & { path: string }): IndexedDoc {
  return makeDoc({ docType: 'journal', ...partial });
}

/** Within the 90-day window as seen from `NOW`. */
const RECENT_DAY = journalDoc({
  path: 'journal/2026/07/2026-07-15.md',
  frontmatter: { type: 'journal', date: '2026-07-15', areas: ['gesundheit'] },
});

/** Older than 90 days as seen from `NOW` — must be dropped and counted. */
const OLD_DAY = journalDoc({
  path: 'journal/2026/01/2026-01-01.md',
  frontmatter: { type: 'journal', date: '2026-01-01', areas: ['gesundheit'] },
});

/** Carries no `areas` key at all — never a candidate, not a truncation. */
const NO_AREAS_DAY = journalDoc({
  path: 'journal/2026/08/2026-08-05.md',
  frontmatter: { type: 'journal', date: '2026-08-05' },
});

/** Carries a different area's slug — also never a candidate. */
const OTHER_AREA_DAY = journalDoc({
  path: 'journal/2026/08/2026-08-06.md',
  frontmatter: { type: 'journal', date: '2026-08-06', areas: ['arbeit'] },
});

function docs(): IndexedDoc[] {
  return [areaDoc(), RECENT_DAY, OLD_DAY, NO_AREAS_DAY, OTHER_AREA_DAY];
}

describe('selectCondenseInputs', () => {
  it('returns exactly the area notes, its todos and the in-window days', () => {
    const selection = selectCondenseInputs(docs(), 'gesundheit', { now: NOW });

    expect(selection.slug).toBe('gesundheit');
    expect(selection.notes.map((note) => note.day)).toEqual(['2026-08-04', '2026-07-28']);
    expect(selection.todos).toHaveLength(2);
    expect(selection.todos.map((todo) => todo.text)).toEqual([
      'Termin beim Physiotherapeuten machen',
      'Schlafzeiten mitgeschrieben',
    ]);
    expect(selection.days.map((day) => day.date)).toEqual(['2026-07-15']);
  });

  it('is stable across repeated calls', () => {
    const first = selectCondenseInputs(docs(), 'gesundheit', { now: NOW });
    const second = selectCondenseInputs(docs(), 'gesundheit', { now: NOW });
    expect(second).toEqual(first);
  });

  it('drops days outside the 90-day window and counts them as truncated', () => {
    const selection = selectCondenseInputs(docs(), 'gesundheit', { now: NOW });

    expect(selection.days.map((day) => day.date)).not.toContain('2026-01-01');
    expect(selection.truncated).toEqual({
      count: 1,
      reason: expect.stringContaining(String(CONDENSE_DAY_WINDOW_DAYS)),
    });
  });

  it('excludes days without the slug, without counting them as truncated', () => {
    const onlyExcluded = [areaDoc(), NO_AREAS_DAY, OTHER_AREA_DAY];
    const selection = selectCondenseInputs(onlyExcluded, 'gesundheit', { now: NOW });

    expect(selection.days).toEqual([]);
    // Nothing eligible was ever dropped by the window — these days were never
    // candidates for this area, so there is nothing to report as truncated.
    expect(selection.truncated).toBeNull();
  });

  it('returns empty notes and todos for a slug with no area file', () => {
    const selection = selectCondenseInputs([RECENT_DAY], 'unbekannt', { now: NOW });
    expect(selection.notes).toEqual([]);
    expect(selection.todos).toEqual([]);
    expect(selection.days).toEqual([]);
  });

  it('involves no model or gateway — the module has no such dependency', () => {
    const source = readFileSync(resolve(__dirname, '../../../src/core/condense/inputs.ts'), 'utf8');
    const importLines = source.split('\n').filter((line) => line.trim().startsWith('import'));
    expect(importLines.join('\n')).not.toMatch(/llm|gateway/i);
  });
});

/* The document inventory (story 039, D1). This is the selector both a run and the
   maintenance check ask, so what matters here is not only *which* documents come
   back but that the answer is one document per file, deterministic in order, and
   carries the index's own hash — a wrong pairing would make an artifact
   permanently due or permanently fresh without anything failing. */
describe('areaInputs', () => {
  it('returns the area file first, then the in-window days oldest first', () => {
    const inputs = areaInputs(docs(), 'gesundheit', { now: NOW });

    expect(inputs.map((input) => input.path)).toEqual([
      'areas/gesundheit.md',
      'journal/2026/07/2026-07-15.md',
    ]);
  });

  it('carries the IndexedDoc.hash of each document', () => {
    const all = docs();
    const inputs = areaInputs(all, 'gesundheit', { now: NOW });

    for (const input of inputs) {
      const doc = all.find((candidate) => candidate.path === input.path);
      expect(input.hash).toBe(doc?.hash);
      expect(input.hash.length).toBeGreaterThan(0);
    }
    // Two different documents, two different hashes — otherwise a comparison
    // over them could not tell them apart.
    expect(inputs[0]?.hash).not.toBe(inputs[1]?.hash);
  });

  it('is one entry per document, not per note or per todo', () => {
    // The fixture area holds two notes and two todos, all inside one file.
    const inputs = areaInputs([areaDoc()], 'gesundheit', { now: NOW });
    expect(inputs).toHaveLength(1);
  });

  it('lists the area file even when it holds neither a note nor a todo', () => {
    /* The pairing guard: the prompt's own input list omits an empty area file,
       so recording that list instead of this inventory would leave the area file
       unrecorded and the artifact due on every single run. */
    const emptyArea = makeDoc({
      path: 'areas/gesundheit.md',
      docType: 'area',
      title: 'Gesundheit',
      frontmatter: { type: 'area', title: 'Gesundheit' },
      body: '',
    });

    const inputs = areaInputs([emptyArea, RECENT_DAY], 'gesundheit', { now: NOW });
    expect(inputs.map((input) => input.path)).toEqual([
      'areas/gesundheit.md',
      'journal/2026/07/2026-07-15.md',
    ]);
  });

  it('uses the same 90-day window as the input selection', () => {
    const paths = areaInputs(docs(), 'gesundheit', { now: NOW }).map((input) => input.path);
    expect(paths).not.toContain(OLD_DAY.path);
    // Same bound, same source of truth — the constant is not repeated here.
    expect(CONDENSE_DAY_WINDOW_DAYS).toBe(90);
  });

  it('excludes days that do not carry the slug', () => {
    const paths = areaInputs(docs(), 'gesundheit', { now: NOW }).map((input) => input.path);
    expect(paths).not.toContain(NO_AREAS_DAY.path);
    expect(paths).not.toContain(OTHER_AREA_DAY.path);
  });

  it('returns only the days for a slug that has no area file', () => {
    const withoutArea = [RECENT_DAY, NO_AREAS_DAY, OTHER_AREA_DAY];
    const inputs = areaInputs(withoutArea, 'gesundheit', { now: NOW });
    expect(inputs.map((input) => input.path)).toEqual(['journal/2026/07/2026-07-15.md']);
  });

  it('returns nothing for an area with no file and no days', () => {
    expect(areaInputs(docs(), 'unbekannt', { now: NOW })).toEqual([]);
  });

  it('is stable across repeated calls on unchanged documents', () => {
    expect(areaInputs(docs(), 'gesundheit', { now: NOW })).toEqual(
      areaInputs(docs(), 'gesundheit', { now: NOW }),
    );
  });

  it('reports a different hash once the content of a document changed', () => {
    const before = areaInputs(docs(), 'gesundheit', { now: NOW });
    const edited = docs().map((doc) =>
      doc.path === RECENT_DAY.path
        ? journalDoc({ path: doc.path, frontmatter: doc.frontmatter, body: 'Nachtrag am Abend.' })
        : doc,
    );
    const after = areaInputs(edited, 'gesundheit', { now: NOW });

    expect(after.map((input) => input.path)).toEqual(before.map((input) => input.path));
    expect(after[1]?.hash).not.toBe(before[1]?.hash);
    // The untouched area file keeps its hash — only what changed looks changed.
    expect(after[0]?.hash).toBe(before[0]?.hash);
  });
});
