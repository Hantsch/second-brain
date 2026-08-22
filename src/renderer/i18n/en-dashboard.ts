/* English interface strings for the dashboard: the day summary, the grid with its
   two ways of moving a tile, the module picker and the tiles themselves.
   Same key set as `de-dashboard.ts` — enforced by tests/renderer/i18n.test.ts. */

export const enDashboard = {
  // ── Day summary ──────────────────────────────────────────────────────────
  'dashboard.summary.label': 'What is pressing today',
  'dashboard.summary.today': '{count} due today',
  'dashboard.summary.waitingOne': '1 answer outstanding',
  'dashboard.summary.waitingMany': '{count} answers outstanding',
  'dashboard.summary.clear': 'Nothing is due today, nobody is holding things up.',
  'dashboard.summary.jump': 'Jump to “{module}”',

  // ── The "unfiled" strip (story 006) ────────────────────────────────────────
  /* Above the grid, not part of the day summary — absent at 0 rather than
     claiming "nothing unfiled". One key is enough, same as
     `notes.filter.unfiled`: "1 unfiled" and "3 unfiled" need no separate
     plural form. */
  'dashboard.unfiled.strip': '{count} unfiled',

  // ── The grid ─────────────────────────────────────────────────────────────
  'dashboard.tiles.label': 'Dashboard modules',
  'dashboard.tiles.empty': 'Every module is hidden. The picker lists what can go here.',
  'dashboard.tile.grab': 'Move {title}',
  'dashboard.tile.menu': 'Menu for {title}',
  'dashboard.tile.size': 'Width',
  'dashboard.tile.size.sm': 'Narrow, one column',
  'dashboard.tile.size.md': 'Medium, two columns',
  'dashboard.tile.size.lg': 'Wide, three columns',
  'dashboard.tile.size.xl': 'Full row, four columns',
  'dashboard.tile.hide': 'Hide',
  'dashboard.tile.position': 'Position {position} of {total}',
  'dashboard.move.hint': 'Space lifts, arrow keys move, Enter drops, Esc cancels.',
  'dashboard.move.lifted': 'Move mode. {title}, position {position} of {total}.',
  'dashboard.move.moved': '{title}, position {position} of {total}.',
  'dashboard.move.dropped': '{title} sits at position {position} of {total}.',
  'dashboard.move.cancelled': 'Cancelled. {title} is back at position {position}.',
  'dashboard.move.status': 'Moving',
  'dashboard.move.bar':
    '{title}, position {position} of {total} · arrows move · enter drops · esc cancels',
  'dashboard.tile.hidden': '“{title}” hidden',
  'dashboard.tile.hiddenWhere': 'The tile stays in the catalogue under “Modules”.',
  'dashboard.layout.saveFailed': 'The arrangement could not be saved.',

  // ── Module picker ────────────────────────────────────────────────────────
  'dashboard.catalog.open': 'Modules',
  'dashboard.catalog.title': 'Dashboard modules',
  'dashboard.catalog.body':
    'Ticking a box shows a module, clearing it hides the module. Moving happens in the grid.',
  'dashboard.catalog.visible': '{count} of {total} visible',
  'dashboard.catalog.reset': 'Reset the arrangement',

  // ── Module names and purpose ─────────────────────────────────────────────
  'module.quick-capture.name': 'Quick capture',
  'module.quick-capture.purpose': 'One field for the thought you have right now.',
  'module.ask.name': 'Question',
  'module.ask.purpose': 'A question to the second brain, answered from the vault.',
  'module.recent-work.name': 'Worked on last',
  'module.recent-work.purpose':
    'File changes, Claude sessions, journal entries and sources in one trail.',
  'module.deadlines.name': 'Coming up',
  'module.deadlines.purpose': 'Deadlines of projects and todos within the configured horizon.',
  'module.waiting-on.name': 'Waiting for',
  'module.waiting-on.purpose': 'Who owes what, since when and by when.',
  'module.todos-work.name': 'Todos work',
  'module.todos-work.purpose': 'Open tasks from the work scope, grouped by due date.',
  'module.todos-private.name': 'Todos private',
  'module.todos-private.purpose': 'Open tasks from the private scope, grouped by due date.',
  'module.active-projects.name': 'Active projects',
  'module.active-projects.purpose': 'What is running, with next step and deadline.',
  'module.inbox.name': 'Inbox',
  'module.inbox.purpose': 'How many dumps are waiting and which have waited longest.',
  'module.stale-projects.name': 'Stalled projects',
  'module.stale-projects.purpose': 'Untouched for a while and not finished.',
  'module.journal-streak.name': 'Journal streak',
  'module.journal-streak.purpose': 'Days in a row, last entry, mood over the past weeks.',
  'module.claude-sessions.name': 'Claude sessions',
  'module.claude-sessions.purpose': 'Work traces of the agent CLI, linked to your projects.',
  'module.gardener.name': 'Care',
  'module.gardener.purpose': 'Health and results from the last check.',

  // ── Tiles ────────────────────────────────────────────────────────────────
  'tile.more': '{count} more',
  'row.overdue': 'Overdue',
  'tile.overdue': '{count} overdue',
  'tile.capture.label': 'Thought',
  'tile.capture.placeholder': 'Raw and unsorted.',
  'tile.capture.hint': 'saves to the inbox',
  'tile.ask.label': 'Question to the second brain',
  'tile.ask.placeholder': 'What do I know about …?',
  'tile.ask.submit': 'Ask',
  'tile.ask.hint': 'The question travels to the questions screen.',

  'tile.recent.empty':
    'No trace of work yet. Change a file, run a session or write a journal entry and it shows up here.',

  'tile.claude.empty': 'No session in the past few days.',
  'tile.claude.off': 'Reading Claude sessions is switched off.',
  'tile.claude.settings': 'Switch on',
  'tile.claude.messages': '{count} messages',
  'tile.claude.unlinked': 'No project',
  'tile.claude.link': 'Link a project',
  'tile.claude.linkFor': 'Link session “{name}” to a project',
  'tile.claude.linkHint': 'The session path goes into the project’s “repos”.',
  'tile.claude.linked': 'Linked. The path now sits in “repos”.',
  'tile.claude.linkedTo': 'Session linked to “{name}”',
  'tile.claude.linkSearch': 'Search projects',
  'tile.claude.linkNoMatch': 'No project matches “{query}”.',
  'tile.claude.openBrowser': 'Open all agent sessions',

  'tile.stale.empty': 'No project has been idle longer than the configured threshold.',
  'tile.stale.days': 'for {count} days',
  'tile.active.empty': 'No active project. Setting a project to “active” makes it show up here.',
  'tile.project.open': 'Open project “{title}”',
  'tile.projects.all': 'To the projects',

  'tile.todos.emptyWork': 'No open todo in the work scope.',
  'tile.todos.emptyPrivate': 'No open todo in the private scope.',
  'tile.todos.group.overdue': 'Overdue',
  'tile.todos.group.today': 'Today',
  'tile.todos.group.week': 'This week',
  'tile.todos.group.later': 'Later',
  'tile.todos.group.none': 'No date',
  'tile.todos.open': 'All todos',

  'tile.waiting.empty': 'You are not waiting for anyone.',
  'tile.waiting.since': 'since {date}',
  'tile.waiting.due': 'by {date}',
  'tile.waiting.overdue': 'overdue',
  /* Why a loose end nags here: the journal announced something for the named
     day, and nothing since has said how it went. */
  'tile.waiting.looseEnd': 'Announced on {date}, nothing since',

  'tile.deadlines.empty': 'No deadline within the next {days} days.',
  'tile.deadlines.project': 'Project deadline',
  'tile.deadlines.todo': 'Todo',
  'tile.deadlines.snooze': 'Snooze “{title}”',

  'reminder.snooze.title': 'Remind me again',
  'reminder.snooze.today': 'Not again today',
  'reminder.snooze.tomorrow': 'Through tomorrow',
  'reminder.snooze.week': 'Next week',
  'reminder.snooze.custom': 'Pick a date',
  'reminder.snooze.pick': 'Remind me again on',
  'reminder.snooze.apply': 'Snooze',
  'reminder.snooze.until': 'reminds again on {date}',
  'reminder.snooze.done': 'Snoozed. Reminds again on {date}.',
  'reminder.snooze.undo': 'Undo',
  'reminder.snooze.undone': 'Reminds again.',
  'reminder.snooze.past': 'That day is not in the future.',

  'tile.inbox.empty': 'The inbox is empty. Captured thoughts wait here until they have a target.',
  'tile.inbox.countOne': '1 dump waiting',
  'tile.inbox.countMany': '{count} dumps waiting',
  'tile.inbox.open': 'To the inbox',

  'tile.journal.empty': 'No journal entry yet. One entry a day keeps the streak.',
  'tile.journal.streakOne': '1 day in a row',
  'tile.journal.streakMany': '{count} days in a row',
  'tile.journal.streakNone': 'No streak',
  'tile.journal.last': 'Last entry {date}',
  'tile.journal.moodLabel': 'Mood over the past {days} days',
  'tile.journal.moodValues': 'Mood, oldest first: {values} out of 5.',
  'tile.journal.moodNone': 'No mood recorded.',
  'tile.journal.open': 'To the journal',

  'tile.gardener.unknown':
    'Not checked yet. The check finds orphaned pages, broken links and forgotten dumps.',
  'tile.gardener.check': 'Check now',
  'tile.gardener.worst': 'Heaviest',
  'tile.gardener.health': 'Health',
  'tile.gardener.findingsOne': '1 result',
  'tile.gardener.findingsMany': '{count} results',
  'tile.gardener.open': 'Open Care',
  /* 021b D5: a stopped check must not sell its partial finding count as the
     vault's current state — hence the as-of date and the stopped note
     instead of the usual finding count. */
  'tile.gardener.asOf': 'As of {date}',
  'tile.gardener.stopped': 'Last check was stopped',
} as const;
