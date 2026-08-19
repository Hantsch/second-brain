/* English texts of the notes screen. Same key set as `de-notes.ts` — a test
   enforces that. Sentence case, no emoji. */

export const enNotes = {
  // ── Rule ─────────────────────────────────────────────────────────────────
  'notes.rule':
    'A journal entry looks back on the day; a note is a thought that stands on its own.',

  // ── The "unfiled" filter (story 006) ─────────────────────────────────────
  'notes.filter.unfiled': '{count} unfiled',
  'notes.unfiled.optional':
    'Filing is optional — a dump that never gets filed is not a backlog item, it is a note.',
  /* The receipt (D5): a filed dump stays in place and shows up here,
     collapsed, below the working list. */
  'notes.unfiled.filedTitle': 'Filed',
  'notes.unfiled.filedCount': '{count} filed',
  'notes.unfiled.filedInto': 'filed into {target}',
  'notes.unfiled.show': 'Show notes',
  'notes.unfiled.hide': 'Hide notes',

  // ── Composer ─────────────────────────────────────────────────────────────
  'notes.composer.placeholder': 'A thought that stands on its own.',
  'notes.composer.targetLabel': 'Area',
  'notes.composer.targetNone': 'Decide later',
  'notes.composer.save': 'Save',
  'notes.composer.hint': 'Ctrl+Enter saves the note.',

  // ── Areas ────────────────────────────────────────────────────────────────
  'notes.list.aria': 'Areas',
  'notes.area.noteCount': '{count} notes',
  'notes.area.openTodos': '{count} open',
  'notes.area.show': 'Show notes',
  'notes.area.hide': 'Hide notes',
  'notes.area.empty':
    'No note in this area yet. The first one starts in the field above — pick this area as the target.',

  // ── New area ─────────────────────────────────────────────────────────────
  'notes.newArea.title': 'New area',
  'notes.newArea.description':
    'An area is one file under areas/. A title is enough — notes join it as they arrive.',
  'notes.newArea.titleField': 'Title',
  'notes.newArea.titlePlaceholder': 'Finances',
  'notes.newArea.slugPreview': 'This creates areas/{slug}.md.',
  'notes.newArea.submit': 'Create',
  'notes.newArea.duplicate': 'This area already exists — choose a different title.',

  // ── Move note ────────────────────────────────────────────────────────────
  'notes.moveNote.action': 'Move to another area',
  'notes.moveNote.title': 'Move note',
  'notes.moveNote.targetLabel': 'Target area',
  'notes.moveNote.submit': 'Move',
  'notes.moveNote.noOther': 'There is no other area to move this note to.',
} as const;
