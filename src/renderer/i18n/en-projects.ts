/* English texts of the projects screen. Same key set as `de-projects.ts` — a
   test enforces that. Sentence case, no emoji. */

export const enProjects = {
  // ── List ─────────────────────────────────────────────────────────────────
  'projects.tab.list': 'Projects',
  'projects.tab.todos': 'All todos',
  'projects.scope.all': 'All',
  'projects.filter.scope': 'Area',
  'projects.filter.status': 'By status',
  'projects.filter.statusAll': 'All',
  'projects.filter.statusOpen': 'Running only',
  'projects.filter.sort': 'Sort by',
  'projects.filter.showEmptySessions': 'Always show the sessions tab',
  'projects.filter.showEmptySessionsFailed': 'The setting could not be saved.',
  'projects.sort.touch': 'Last touched',
  'projects.sort.deadline': 'Deadline',
  'projects.sort.priority': 'Priority',
  'projects.sort.name': 'Name',
  'projects.search': 'Find a project',
  'projects.searchEmpty': 'No project matches “{query}”.',
  'projects.filterEmpty': 'No project matches this filter.',
  'projects.stalled.title': 'Untouched for a while — {count}',
  'projects.list.aria': 'Projects',
  'projects.open': 'Open project “{title}”',
  'projects.favorite.add': 'Star “{title}”',
  'projects.favorite.remove': 'Unstar “{title}”',
  'projects.lastWorkedOn': 'Last worked on',
  'projects.waitingMark': 'waiting',
  'projects.openTodos': '{count} open',
  'projects.keys':
    'j/k select · Enter opens · n new project · t new todo · x checks off · m new note · w waiting for',
  'projects.detail.none': 'Pick a project on the left.',

  // ── New project ──────────────────────────────────────────────────────────
  'projects.new.title': 'New project',
  'projects.new.description':
    'A project is a folder with one file. Title and area are enough — everything else can come later.',
  'projects.new.titleField': 'Title',
  'projects.new.titlePlaceholder': 'Customer portal relaunch',
  'projects.new.scopeField': 'Area',
  'projects.new.statusField': 'Status',
  'projects.new.stepField': 'First next step',
  'projects.new.stepPlaceholder': 'Where do you start?',
  'projects.new.stepHint': 'Optional. Without one, the gardener will report it.',
  'projects.new.submit': 'Create',
  'projects.new.pathHint': 'This creates {path}.',

  // ── Detail ───────────────────────────────────────────────────────────────
  'project.detail.aria': 'Project detail',
  'project.priority': 'Priority {value}',
  'project.deadlineNone': 'No deadline',
  'project.statusLabel': 'Status',
  'project.statusSaved': 'Status is now “{status}”.',
  'project.openFile': 'Open the project file',

  // ── Provenance ───────────────────────────────────────────────────────────
  'project.provenance.setByUser': 'Set by you · {date}',
  'project.provenance.acceptedSuggestion': 'Accepted from a suggestion · {date}',
  'project.provenance.writtenByFiling': 'Written by filing · {date}',
  'project.provenance.unknown': 'Origin not recorded · last touched {age}',

  'project.nextStep.title': 'Next step',
  'project.nextStep.empty': 'No next step set',
  'project.nextStep.edit': 'Edit the next step',
  'project.nextStep.hint': 'Enter saves, Esc cancels',
  'project.nextStep.saved': 'Saved.',
  'project.nextStep.external':
    'The next step was changed outside the app: “{value}”. Saving overwrites that.',
  'project.nextStep.externalEmpty':
    'The next step was removed outside the app. Saving writes your version.',
  'project.nextStep.take': 'Take the outside version',
  'project.nextStep.keep': 'Keep my version',
  'project.nextStep.stale': 'Possibly outdated',
  'project.nextStep.staleExplain': 'Something in the project changed since this was written.',

  'project.suggest.action': 'Get a suggestion',
  'project.suggest.title': 'Suggestion',
  'project.suggest.notice': 'A suggestion. Nothing is written until you accept it.',
  'project.suggest.heuristic': 'Derived from rules over what is on file, without a model.',
  'project.suggest.status': 'Status: {status}',
  'project.suggest.step': 'Next step: {step}',
  'project.suggest.accept': 'Accept both',
  'project.suggest.acceptStep': 'Step only',
  'project.suggest.reject': 'Discard',
  'project.suggest.none':
    'Nothing in this project points to a next step — there is no open todo and nothing you are waiting for. Write it yourself.',

  'project.waiting.title': 'Waiting for',
  'project.waiting.empty': 'You are not waiting on anyone in this project.',
  'project.waiting.since': 'since {date}',
  'project.waiting.due': 'by {date}',
  'project.waiting.overdue': 'overdue',
  'project.waiting.resolve': 'Answered',
  'project.waiting.resolveAria': 'Mark waiting for {who} as answered',
  'project.waiting.resolved': 'Waiting for {who} is now marked as answered.',
  'project.waiting.resolvedWhere':
    'The entry stays in the project file with “resolved: true”, only the list no longer shows it.',
  'project.waiting.added': 'Waiting for {who} added.',
  'project.waiting.new.action': 'Add waiting for',
  'project.waiting.new.who': 'Who is this waiting on',
  'project.waiting.new.whoPlaceholder': 'Name',
  'project.waiting.new.what': 'What are you waiting for',
  'project.waiting.new.whatPlaceholder': 'What for? (optional)',
  'project.waiting.new.since': 'Since',
  'project.waiting.new.due': 'By',
  'project.waiting.new.submit': 'Add',
  'project.waiting.new.hint': 'Enter adds, Esc cancels',

  'project.todos.title': 'Todos',
  'project.todos.empty':
    'No checkbox in this file. Inside the text, @due:2026-08-20 sets the deadline, @wait:Name marks who you wait for and !! the priority — typed in Obsidian too.',

  'project.state.title': 'Status note',
  'project.state.empty':
    'No status noted. The first paragraph under “## Stand” is the way back in after a break.',
  'project.notes.title': 'Notes',
  'project.notes.empty': 'No filed dumps yet.',
  'project.notes.added': 'Note added.',
  'project.notes.composer.placeholder': 'Write a note',
  'project.notes.composer.hint': 'Ctrl+Enter saves the note.',
  'project.notes.composer.save': 'Save',

  'project.tab.label': 'Choose project view',
  'project.tab.overview': 'Overview',
  'project.tab.knowledge': 'Knowledge',
  'project.tab.sessions': 'Sessions',

  // ── The knowledge tab (story 045, D4) ─────────────────────────────────────
  'project.condensed.empty.title': 'Not condensed yet',
  'project.condensed.empty.body':
    'A condensation folds this project into one page a model keeps current from here on.',
  'project.condensed.trigger': 'Condense this project',
  'project.condensed.triggerAgain': 'Condense again',
  'project.condensed.running': 'Condensation running',
  'project.condensed.waiting': 'Waiting for the model — queue position {position}',
  'project.condensed.failed.reason': 'Reason: {reason}',
  'project.condensed.meta.condensedAt': 'Condensed {date}',
  'project.condensed.meta.sources': '{count} sources',
  'project.condensed.notEvidence':
    'This condensation is not cited as evidence — answers point to its sources instead.',

  'project.condensed.diff.summary': '{removed} removed, {added} added',
  'project.condensed.diff.added': 'added',
  'project.condensed.diff.removed': 'removed',
  'project.condensed.accept': 'Accept',
  'project.condensed.accept.conflict':
    'The file for {subject} changed since this proposal was made. Run the condensation again.',

  'project.condensed.reject': 'Reject',
  'project.condensed.reject.title': 'Reject this proposal',
  'project.condensed.reject.description':
    'A reason is required — it is kept with the project so the next condensation can take it into account.',
  'project.condensed.reject.fieldLabel': 'Reason',
  'project.condensed.reject.placeholder': 'What should change before this is accepted?',
  'project.condensed.reject.submit': 'Reject',

  'project.condensed.delete.action': 'Delete condensation',
  'project.condensed.delete.title': 'Delete “{path}”?',
  'project.condensed.delete.description':
    'Its sections and sources are regenerable — a later run rebuilds them from the project.',
  'project.condensed.delete.directivesLost':
    'The directives section is the one part no later run can reproduce — it only ever came from what you wrote there yourself.',
  'project.condensed.delete.confirm': 'Delete',
  'project.condensed.delete.done': 'Condensation deleted.',
  'project.condensed.delete.conflict':
    'The file for {subject} changed since it was last read. Nothing was deleted.',

  'project.trace.title': 'Work trace',
  'project.trace.lastTouch': 'Last trace {age}',
  'project.trace.source.file': 'File change in the project folder',
  'project.trace.source.claude-session': 'Claude session',
  'project.trace.source.journal': 'Journal entry',
  'project.trace.noRepos':
    'Without the repos field in the frontmatter no session can be matched. Matching goes by working directory.',

  'project.sessions.noneLinked':
    'No {agent} working directory belongs to this project. Matching goes by the working directory from repos.',
  'project.sessions.empty': 'No session from {agent} recorded for this project.',
  'project.sessions.notFound.title': 'Session not found',
  'project.sessions.unlinked.title': 'No working directory linked',
  'project.sessions.unlinked.where':
    'Under “All sessions” you assign a working directory to this project.',
  'project.sessions.unlinked.action': 'Link a working directory',

  // ── Todos ────────────────────────────────────────────────────────────────
  'todos.group.overdue': 'Overdue',
  'todos.group.today': 'Today',
  'todos.group.week': 'This week',
  'todos.group.later': 'Later',
  'todos.group.none': 'No deadline',
  'todos.count': '{count} todos',
  'todos.countOne': 'one todo',
  'todos.openOf': '{open} of {total} open',
  'todos.showDone': 'Show completed',
  'todos.empty.title': 'No todo in the vault',
  'todos.empty.body':
    'A todo is a checkbox in any file. Inside the text, @due:2026-08-20 sets the deadline, @wait:Name marks who you wait for and !! the priority — you can type them in Obsidian too.',
  'todos.scopeEmpty': 'Nothing open here.',

  'todo.toggle': 'Check off “{text}”',
  'todo.untoggle': 'Uncheck “{text}”',
  'todo.dueEdit': 'Change the deadline of “{text}”',
  'todo.waitingFor': 'waiting for {who}',
  'todo.neededBy': 'answer by {date}',
  'todo.priorityMark': 'Priority {value}',
  'todo.priority.high': 'High',
  'todo.priority.medium': 'Medium',
  'todo.priority.low': 'Low',
  'todo.priorityEdit': 'Change the priority of “{text}”',
  'todo.edit.action': 'Edit “{text}”',
  'todo.edit.text': 'Todo text',
  'todo.reorder': 'Reorder “{text}”',
  'todo.doneAt': 'done {date}',
  'todo.new.action': 'Add a todo',
  'todo.new.field': 'New todo',
  'todo.new.due': 'Deadline of the new todo',
  'todo.new.priority': 'Priority of the new todo',
  'todo.new.placeholder': 'What needs doing?',
  'todo.new.submit': 'Create',
  'todo.new.hint': 'Enter creates, Esc cancels',
} as const;
