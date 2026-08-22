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
  'journal.hasDialogue': 'With an answer from the app',
  'journal.list.closed': 'Closed',
  'journal.list.unfinished': 'Day not closed out yet',
  'journal.open': 'Open the entry of {date}',
  'journal.keys': 'Arrow keys change the day',
  /* The filter (009, D5): today always stays visible but never counts as open
     itself — so the line above only ever counts past days. */
  'journal.filter.openOnly': 'Only open days',
  'journal.filter.count': '{count} days open',
  'journal.filter.countOne': 'One day open',
  'journal.filter.none': 'Nothing open. Every past day is closed.',

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
  /* The manual switch (009, D3/D6) — separate from the day close-out further
     below (`journal.close.*`), which extracts facts and todos: this is just
     the one open/finished field, which also feeds the list filter (009, D5). */
  'journal.finish.markFinished': 'Mark as finished',
  'journal.finish.reopen': 'Reopen',
  'journal.finish.badge': 'Closed on {date}',

  // ── Section „Day" ─────────────────────────────────────────────────────────
  'journal.day.title': 'Day',
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
  /* Deliberately not "Conversation" any more (011, D10): the stream is
     usually just my own prose with no answer at all — "listen" never asks a
     model — so a heading that promises dialogue would be wrong. */
  'journal.dialogue.title': 'Timeline',
  'journal.dialogue.empty':
    'What you write here goes into the day entry, word for word — and nowhere else.',
  'journal.turn.user': 'Me',
  'journal.turn.assistant': 'Second brain',
  'journal.thinking': 'Thinking',
  'journal.field.label': 'What is on your mind?',
  'journal.field.placeholder': 'Write it down as it comes.',
  'journal.field.hintSend': 'says it',
  'journal.send': 'Say it',
  /* Only for tips/analyse (011, D8): the stance decides whether a model is
     asked at all, and the button says so plainly. */
  'journal.sendAsk': 'Save and ask',
  'journal.mode.label': 'Stance',
  'journal.mode.listen': 'Listen',
  'journal.mode.tips': 'Tips',
  'journal.mode.analyze': 'Analyse',
  'journal.mode.listen.hint': 'Listen: filed as is, no answer and no follow-up question.',
  'journal.mode.tips.hint': 'Tips: I listen first, then at most three small steps.',
  'journal.mode.analyze.hint':
    'Analyse: I help you understand and steady you, grounded in real earlier entries.',
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

  // ── Legacy conversation (011/D9) ──────────────────────────────────────────
  'journal.legacy.title': 'Legacy conversation',
  'journal.legacy.fold.action': 'Move into the entry',
  'journal.legacy.fold.title': 'Move the conversation into the entry',
  'journal.legacy.fold.body':
    'Whatever reads as a round moves into the day text, in order — your words as a paragraph, the app\'s answers as a quote. A line in the old section that can\'t be attributed to a round is lost in the process. The "Conversation" section then disappears from the file, and there is no way back.',
  'journal.legacy.fold.confirm': 'Apply',

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
  'journal.close.discard': 'Discard',
  'journal.close.runAgain': 'Run again',
  'journal.close.dueOf': 'Due date for „{text}"',
  'journal.close.done': 'Applied to',
  'journal.close.doneMore': 'and {count} more',
  'journal.close.doneNothing': 'Nothing selected — nothing written.',

  // ── Interview (012) ───────────────────────────────────────────────────────
  /* The entry point on the day itself (D6) — one key, reused for the button
     regardless of whether the day is empty or already has prose; only the
     button's variant (primary/secondary) changes with that. */
  'journal.interview.start': 'Start interview',
  'journal.interview.title': 'Interview',
  'journal.interview.description':
    'One question at a time — answer, skip, or leave and write yourself.',
  'journal.interview.field.label': 'Your answer',
  'journal.interview.field.placeholder': 'Write your answer here.',
  'journal.interview.answer': 'Answer and continue',
  'journal.interview.skip': 'Skip',
  'journal.interview.leave': 'Leave and write myself',
  'journal.interview.progress': '{current} / {total}',
  'journal.interview.engine.fixed': 'Fixed question set — no model needed.',
  'journal.interview.engine.model.local': 'Follow-up questions run locally on this machine.',
  'journal.interview.engine.model.remote':
    'Follow-up questions go to {provider} — a local model stays on this machine.',
  'journal.interview.done.body':
    'The interview is done for today — anything skipped stays open. Mood and energy still wait on the pickers at the top of the day.',
  /* The one extra question about a still-open loose end (020, D8): an
     inquiry, not a claim — it only quotes the earlier sentence back, never
     asserting what became of it. */
  'journal.interview.looseEnd.question': 'How did it go: "{quote}"?',
} as const;
