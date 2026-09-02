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

  // ── Tabs inside an area (story 038, D5) ─────────────────────────────────
  'notes.area.tab.label': 'Area tabs',
  'notes.tab.notes': 'Notes',
  'notes.tab.todos': 'Todos',
  'notes.tab.condensed': 'Condensed',

  // ── The condensed tab (story 038, D6) ────────────────────────────────────
  'notes.condensed.empty.title': 'Not condensed yet',
  'notes.condensed.empty.body':
    'A condensation folds this area into one page a model keeps current from here on.',
  'notes.condensed.trigger': 'Condense this area',
  'notes.condensed.triggerAgain': 'Condense again',
  'notes.condensed.running': 'Condensation running',
  'notes.condensed.meta.condensedAt': 'Condensed {date}',
  'notes.condensed.meta.sources': '{count} sources',
  'notes.condensed.notEvidence':
    'This condensation is not cited as evidence — answers point to its sources instead.',

  // ── Diff and accept (story 038, D7) ──────────────────────────────────────
  'notes.condensed.diff.summary': '{removed} removed, {added} added',
  'notes.condensed.diff.added': 'added',
  'notes.condensed.diff.removed': 'removed',
  'notes.condensed.accept': 'Accept',
  'notes.condensed.accept.conflict':
    'The file for {subject} changed since this proposal was made. Run the condensation again.',

  // ── Reject with a reason (story 038, D8) ─────────────────────────────────
  'notes.condensed.reject': 'Reject',
  'notes.condensed.reject.title': 'Reject this proposal',
  'notes.condensed.reject.description':
    'A reason is required — it is kept with the area so the next condensation can take it into account.',
  'notes.condensed.reject.fieldLabel': 'Reason',
  'notes.condensed.reject.placeholder': 'What should change before this is accepted?',
  'notes.condensed.reject.submit': 'Reject',

  // ── Delete the artifact outright (story 043, D2) ─────────────────────────
  'notes.condensed.delete.action': 'Delete condensation',
  'notes.condensed.delete.title': 'Delete “{path}”?',
  'notes.condensed.delete.description':
    'Its sections and sources are regenerable — a later run rebuilds them from the area.',
  'notes.condensed.delete.directivesLost':
    'The directives section is the one part no later run can reproduce — it only ever came from what you wrote there yourself.',
  'notes.condensed.delete.confirm': 'Delete',
  'notes.condensed.delete.done': 'Condensation deleted.',
  'notes.condensed.delete.conflict':
    'The file for {subject} changed since it was last read. Nothing was deleted.',

  // ── Move note ────────────────────────────────────────────────────────────
  'notes.moveNote.action': 'Move to another area',
  'notes.moveNote.title': 'Move note',
  'notes.moveNote.targetLabel': 'Target area',
  'notes.moveNote.submit': 'Move',
  'notes.moveNote.noOther': 'There is no other area to move this note to.',
} as const;
