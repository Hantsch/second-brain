/* English texts of the journal — same key set as `de-journal.ts` (a test checks it).
   Sentence case, no emoji; the coach speaks in first person about itself. */

export const enJournal = {
  // ── Day list ──────────────────────────────────────────────────────────────
  'journal.list.title': 'Days',
  'journal.list.count': '{count} days with an entry',
  'journal.today': 'Today',
  'journal.today.none': 'No entry yet',
  'journal.words': '{count} words',
  'journal.gap': '{count} days without an entry',
  'journal.gapOne': 'One day without an entry',
  'journal.hasDialogue': 'With conversation',
  'journal.open': 'Open the entry of {date}',
  'journal.keys': 'Arrow keys change the day',

  // ── Head of the day ───────────────────────────────────────────────────────
  'journal.mood.label': 'Mood',
  'journal.mood.1': 'Heavy',
  'journal.mood.2': 'Low',
  'journal.mood.3': 'So-so',
  'journal.mood.4': 'Good',
  'journal.mood.5': 'Very good',
  'journal.energy.label': 'Energy',
  'journal.energy.1': 'Empty',
  'journal.energy.2': 'Low',
  'journal.energy.3': 'Medium',
  'journal.energy.4': 'High',
  'journal.energy.5': 'Full',
  'journal.level.none': 'not set',
  'journal.level.set': 'Set {label}',
  'journal.level.saved': 'Saved',
  'journal.people': 'People',
  'journal.projects': 'Projects',
  'journal.project.open': 'Open project {title}',
  'journal.file.open': 'Open the file in an editor',
  /* Visible only in the narrow window (`DayEntry.tsx`) — two tabs instead of
     two columns, because both together don't fit one scroll column. */
  'journal.tab.day': 'Day',
  'journal.tab.talk': 'Conversation',

  // ── Section „Day" ─────────────────────────────────────────────────────────
  'journal.day.title': 'Day',
  'journal.day.ask': 'How was your day?',
  'journal.day.askHint': 'One paragraph is enough. Ctrl+Enter saves.',
  'journal.day.placeholder': 'What happened?',
  'journal.day.write': 'Write the day',
  'journal.day.edit': 'Edit the day',
  'journal.day.editLabel': 'Text of the day',
  'journal.day.save': 'Save',
  'journal.day.hint': 'Ctrl+Enter saves, Esc discards',
  'journal.day.saved': 'Saved.',
  'journal.day.unsaved': 'Not saved.',
  'journal.day.external.title': 'This section changed outside the app',
  'journal.day.external.body':
    'The text in the file is no longer the one you started from. Yours is still here — you decide which one stays.',
  'journal.day.external.take': 'Take the other version',
  'journal.day.external.keep': 'Keep my text',
  'journal.day.conflict.title': 'The file changed in the meantime',
  'journal.day.conflict.body':
    'Nothing was overwritten. You can load the current version or write your text over it deliberately.',
  'journal.day.conflict.reload': 'Load current',
  'journal.day.conflict.overwrite': 'Save anyway',

  // ── Conversation ──────────────────────────────────────────────────────────
  'journal.dialogue.title': 'Conversation',
  'journal.dialogue.empty':
    'What you write here goes into the day entry, word for word — and nowhere else.',
  'journal.turn.user': 'Me',
  'journal.turn.assistant': 'Second brain',
  'journal.thinking': 'Thinking',
  'journal.field.label': 'What is on your mind?',
  'journal.field.placeholder': 'Write it down as it comes.',
  'journal.field.hintSend': 'says it',
  'journal.send': 'Say it',
  'journal.mode.label': 'Stance',
  'journal.mode.listen': 'Listen',
  'journal.mode.tips': 'Tips',
  'journal.mode.analyze': 'Analyse',
  'journal.mode.listen.hint': 'Listen: I mirror and ask, without advice.',
  'journal.mode.tips.hint': 'Tips: I listen first, then at most three small steps.',
  'journal.mode.analyze.hint':
    'Analyse: I compare with earlier days and show patterns, with dates.',
  'journal.mode.keys': 'Ctrl+1 to Ctrl+3 change the stance',
  'journal.mode.set': 'Choose the stance {label}',

  // ── Confidentiality ───────────────────────────────────────────────────────
  'journal.privacy.remote':
    'This conversation goes to {provider} — a local model stays on this machine.',
  'journal.privacy.local': 'Runs locally on this machine.',
  'journal.privacy.none':
    'No model is assigned for the conversation — the entry can still be written.',
  'journal.privacy.action': 'Change the model',

  // ── Without an answer ─────────────────────────────────────────────────────
  'journal.failure.no-route': 'Written down. No model is assigned for an answer.',
  'journal.failure.provider-disabled': 'Written down. The assigned provider is switched off.',
  'journal.failure.no-key': 'Written down. The key for the assigned model is missing.',
  'journal.failure.unreachable': 'Written down. The model could not be reached.',
  'journal.failure.error': 'Written down. The model returned nothing.',
  'journal.failure.cancelled': 'Written down. You stopped the answer.',
  'journal.failure.other': 'Written down. No answer arrived.',
  'journal.evidence.title': 'It sounded similar on these days',
  'journal.evidence.open': 'Go to the entry of {date}',

  // ── Facts and closing the day ─────────────────────────────────────────────
  'journal.facts.title': 'Facts',
  'journal.facts.empty': 'What the day close found and you confirmed shows up here.',
  'journal.close.action': 'Close the day',
  'journal.close.title': 'Day close',
  'journal.close.body':
    'Found in the text of the day. Nothing is written — you decide what is kept.',
  'journal.close.empty': 'There is nothing in the text of the day to pull out yet.',
  'journal.close.heuristic': 'Found without a model — rules instead of understanding.',
  'journal.close.nothing': 'Nothing to pull out of the text. The entry stays as it is.',
  'journal.close.todos': 'Todos found',
  'journal.close.waiting': 'Waiting on',
  'journal.close.waitingInto': 'as a todo with @wait in the day entry',
  'journal.close.into': 'into {target}',
  'journal.close.target.day': 'Day entry, section Facts',
  'journal.close.target.project': 'Project {title}',
  'journal.close.fields': 'For the frontmatter of the day',
  'journal.close.people': 'People',
  'journal.close.projects': 'Projects',
  'journal.close.tags': 'Tags',
  'journal.close.mood': 'Mood {label}',
  'journal.close.energy': 'Energy {label}',
  'journal.close.apply': 'Apply',
  'journal.close.dueOf': 'Due date for „{text}"',
  'journal.close.done': 'Applied to',
  'journal.close.doneMore': 'and {count} more',
  'journal.close.doneNothing': 'Nothing selected — nothing written.',
} as const;
