/* The sections of an area file. The one rule nailed down here: **the user's file
   sets the tone.** If it says "## Notizen", content is appended below that — even
   when the document language has since become English. Otherwise one file would
   end up with two sections for the same thing.

   The second rule is the reason this is its own test: heading and alias list must
   never drift apart. A heading that isn't recognized doesn't produce an error, it
   produces an area whose notes have silently vanished. */

import { describe, expect, it } from 'vitest';
import {
  areaSectionIn,
  areaSectionRanges,
  areaSections,
  isAreaSectionOf,
  type AreaSectionKind,
} from '@core/areas';
import { SECTION_NOTES, SECTION_TODOS } from '@core/capture';

const GERMAN = [
  '## Worum es geht',
  '',
  'Rücken, Schlaf, Bewegung.',
  '',
  '## Todos',
  '',
  '- [ ] Termin machen',
  '',
  '## Notizen',
  '',
  '### 2026-08-04',
  '',
  'Vor Mitternacht ins Bett.',
  '',
].join('\n');

const ENGLISH = ['## Notes', '', '### 2026-08-04', '', 'Went to bed before midnight.', ''].join(
  '\n',
);

const KINDS: readonly AreaSectionKind[] = ['notes', 'todos'];

describe('areaSections', () => {
  it('knows both document languages', () => {
    expect(areaSections('de')).toEqual({ notes: 'Notizen', todos: 'Todos' });
    expect(areaSections('en')).toEqual({ notes: 'Notes', todos: 'Todos' });
  });

  it('uses the headings the filing path writes', () => {
    expect(areaSections('de').notes).toBe(SECTION_NOTES);
    expect(areaSections('de').todos).toBe(SECTION_TODOS);
  });

  it('recognizes every heading it hands out — no alias may go missing', () => {
    for (const language of ['de', 'en'] as const) {
      for (const kind of KINDS) {
        expect(isAreaSectionOf(areaSections(language)[kind], kind)).toBe(true);
      }
    }
  });
});

describe('isAreaSectionOf', () => {
  it('compares folded — "Notizen" and "Notes" are the same section', () => {
    expect(isAreaSectionOf('Notizen', 'notes')).toBe(true);
    expect(isAreaSectionOf(' notes ', 'notes')).toBe(true);
    expect(isAreaSectionOf('NOTIZEN', 'notes')).toBe(true);
    expect(isAreaSectionOf('Todos', 'todos')).toBe(true);
    expect(isAreaSectionOf('todos', 'todos')).toBe(true);
  });

  it('does not confuse the two sections with each other or with anything else', () => {
    expect(isAreaSectionOf('Notizen', 'todos')).toBe(false);
    expect(isAreaSectionOf('Todos', 'notes')).toBe(false);
    expect(isAreaSectionOf('Worum es geht', 'notes')).toBe(false);
    expect(isAreaSectionOf('', 'notes')).toBe(false);
  });
});

describe('areaSectionRanges', () => {
  it('finds the notes section in either language', () => {
    expect(areaSectionRanges(GERMAN, 'notes').map((range) => range.heading)).toEqual(['Notizen']);
    expect(areaSectionRanges(ENGLISH, 'notes').map((range) => range.heading)).toEqual(['Notes']);
  });

  it('keeps both halves when a file carries the section twice', () => {
    const body = ['## Notizen', '', 'Eins.', '', '## Notes', '', 'Zwei.', ''].join('\n');
    expect(areaSectionRanges(body, 'notes').map((range) => range.heading)).toEqual([
      'Notizen',
      'Notes',
    ]);
  });

  it('ignores a heading of the wrong level and headings inside code fences', () => {
    const body = ['### Notizen', '', '```md', '## Notizen', '```', ''].join('\n');
    expect(areaSectionRanges(body, 'notes')).toEqual([]);
  });
});

describe('areaSectionIn', () => {
  it('takes the existing heading, not the one from the setting', () => {
    expect(areaSectionIn(GERMAN, 'notes', 'en')).toBe('Notizen');
    expect(areaSectionIn(ENGLISH, 'notes', 'de')).toBe('Notes');
    expect(areaSectionIn(GERMAN, 'todos', 'en')).toBe('Todos');
  });

  it('takes the document language when the file has no such section', () => {
    expect(areaSectionIn(ENGLISH, 'todos', 'en')).toBe('Todos');
    expect(areaSectionIn('', 'notes', 'de')).toBe('Notizen');
    expect(areaSectionIn('', 'notes', 'en')).toBe('Notes');
  });
});
