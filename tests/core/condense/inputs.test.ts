/* Input selection for condensing an area (story 037, D5). Deterministic and
   model-free: given the indexed docs, the selector must return exactly the
   area's notes, its todos, and the day entries carrying its slug within the
   last ~90 days — nothing guessed, nothing silently dropped without being
   counted. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONDENSE_DAY_WINDOW_DAYS, selectCondenseInputs } from '@core/condense/inputs';
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
