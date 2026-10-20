/* The notes heading of a project file, tolerant of both spellings — the same rule
   `src/core/areas/sections.ts` follows for areas, reused here through the additive
   `headingFor` in `src/core/vault/sections.ts`. See
   docs/requirements/003-project-notes-and-waiting-on.md, deliverable D1. */

import { describe, expect, it } from 'vitest';
import { projectNotesHeading } from '@core/projects';
import { headingFor } from '@core/vault/sections';

const NOTES = ['## Notes', '', '### 2026-08-04', '', 'Went to bed before midnight.', ''].join('\n');

const NOTIZEN = ['## Notizen', '', '### 2026-08-04', '', 'Vor Mitternacht ins Bett.', ''].join(
  '\n',
);

const BOTH_NOTES_FIRST = ['## Notes', '', 'Eins.', '', '## Notizen', '', 'Zwei.', ''].join('\n');

const BOTH_NOTIZEN_FIRST = ['## Notizen', '', 'Eins.', '', '## Notes', '', 'Zwei.', ''].join('\n');

describe('projectNotesHeading', () => {
  it('resolves "## Notes" to "Notes"', () => {
    expect(projectNotesHeading(NOTES, 'de')).toBe('Notes');
    expect(projectNotesHeading(NOTES, 'en')).toBe('Notes');
  });

  it('resolves "## Notizen" to "Notizen"', () => {
    expect(projectNotesHeading(NOTIZEN, 'de')).toBe('Notizen');
    expect(projectNotesHeading(NOTIZEN, 'en')).toBe('Notizen');
  });

  it('falls back to the document language word when the file has neither heading', () => {
    expect(projectNotesHeading('', 'de')).toBe('Notizen');
    expect(projectNotesHeading('', 'en')).toBe('Notes');
    expect(projectNotesHeading('## Worum es geht\n\nText.\n', 'en')).toBe('Notes');
  });

  it('takes whichever heading appears first when a file carries both', () => {
    expect(projectNotesHeading(BOTH_NOTES_FIRST, 'de')).toBe('Notes');
    expect(projectNotesHeading(BOTH_NOTIZEN_FIRST, 'en')).toBe('Notizen');
  });
});

describe('headingFor', () => {
  const aliases = ['notizen', 'notes'];

  it('is the generic building block projectNotesHeading is built on', () => {
    expect(headingFor(NOTES, aliases, 'Notes')).toBe('Notes');
    expect(headingFor(NOTIZEN, aliases, 'Notizen')).toBe('Notizen');
    expect(headingFor('', aliases, 'Notes')).toBe('Notes');
  });

  it('ignores headings of the wrong level and inside code fences', () => {
    const body = ['### Notizen', '', '```md', '## Notizen', '```', ''].join('\n');
    expect(headingFor(body, aliases, 'Notes')).toBe('Notes');
  });

  it('compares case-insensitively and trims whitespace', () => {
    expect(headingFor('##   NOTIZEN  \n', aliases, 'Notes')).toBe('NOTIZEN');
  });
});
