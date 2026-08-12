/* English texts of the projects screen. Same key set as `de-projects.ts` — a
   test enforces that. Sentence case, no emoji. */

export const enProjects = {
  // ── List ─────────────────────────────────────────────────────────────────
  'projects.tab.list': 'Projects',
  'projects.tab.todos': 'All todos',
  'projects.scope.all': 'All',
  'projects.filter.scope': 'Area',
  'projects.filter.status': 'By status',
  'projects.filter.statusOpen': 'Running only',
  'projects.filter.sort': 'Sort by',
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
  'projects.waitingMark': 'waiting',
  'projects.openTodos': '{count} open',
  'projects.keys': 'j/k select · Enter opens · n new project · t new todo · x checks off',
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

  'project.todos.title': 'Todos',
  'project.todos.empty':
    'No checkbox in this file. Inside the text, @due:2026-08-20 sets the deadline, @wait:Name marks who you wait for and !! the priority — typed in Obsidian too.',

  'project.state.title': 'Status note',
  'project.state.empty':
    'No status noted. The first paragraph under “## Stand” is the way back in after a break.',
  'project.notes.title': 'Notes',
  'project.notes.empty': 'No filed dumps yet.',
  'project.notes.show': 'Show notes',
  'project.notes.hide': 'Hide notes',

  'project.trace.title': 'Work trace',
  'project.trace.lastTouch': 'Last trace {age}',
  'project.trace.source.file': 'File change in the project folder',
  'project.trace.source.claude-session': 'Claude session',
  'project.trace.source.journal': 'Journal entry',
  'project.trace.sessions': 'Claude sessions',
  'project.trace.noSessions': 'No Claude session for this project.',
  'project.trace.noRepos':
    'Without the repos field in the frontmatter no session can be matched. Matching goes by working directory.',
  'project.trace.pending':
    'Claude sessions are not wired up yet. This section fills up as soon as the channel is there.',
  'project.trace.messages': '{count} messages',

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
  'todo.doneAt': 'done {date}',
  'todo.new.action': 'Add a todo',
  'todo.new.field': 'New todo',
  'todo.new.due': 'Deadline of the new todo',
  'todo.new.placeholder': 'What needs doing?',
  'todo.new.submit': 'Create',
  'todo.new.hint': 'Enter creates, Esc cancels',
} as const;
