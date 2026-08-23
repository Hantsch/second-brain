/* English interface strings, part 2: screens, onboarding, quick capture.
   Same key set as `de-screens.ts` — enforced by tests/renderer/i18n.test.ts. */

export const enScreens = {
  'screen.dashboard.overline': 'Overview',
  'screen.dashboard.title': 'Dashboard',
  'screen.dashboard.empty.title': 'No trace in the vault yet',
  'screen.dashboard.empty.body':
    'Once projects, todos and journal entries live in the vault, three modules appear here: what you worked on last, what is due and who you are waiting for.',
  'screen.dashboard.empty.action': 'Capture a thought',

  'dashboard.recent.title': 'Worked on last',
  'dashboard.recent.empty': 'No trace of work yet. Whoever writes on a project shows up here.',
  'dashboard.next.title': 'Coming up',
  'dashboard.next.empty': 'No open todo with a date.',
  'dashboard.waiting.title': 'Waiting for',
  'dashboard.waiting.empty': 'You are not waiting for anyone.',
  'dashboard.waiting.since': 'since {date}',

  'stats.title': 'What the vault holds',
  'stats.docs': 'Documents',
  'stats.projects': 'Projects',
  'stats.todos': 'Todos',
  'stats.pages': 'Wiki pages',
  'stats.words': 'Words',

  'screen.capture.overline': 'Dump it',
  'screen.capture.title': 'Capture',
  'screen.capture.empty.title': 'One field, one thought',
  'screen.capture.empty.body':
    'Write down whatever is on your mind. Filing happens later — as a proposal you confirm.',
  'screen.capture.empty.action': 'Quick capture',
  'capture.ask': 'What is on your mind?',
  'capture.placeholder': 'A thought, a work note, a worry — raw and unsorted.',
  'capture.save': 'Save',
  'capture.hint': 'saves',
  'capture.hintEscape': 'leaves the field',
  'capture.hintPalette': 'jumps to the command palette',
  'capture.count': '{chars} characters · {words} words',
  'capture.scope': 'Scope',
  'capture.scopeOpen': 'Leave open',
  'capture.tags': 'Tags',
  'capture.tagsPlaceholder': 'customer-portal, idea',
  'capture.saved': 'Saved to',
  'capture.undo': 'Undo',
  'capture.toInbox': 'Go to inbox',
  'capture.classifying': 'Building a proposal …',
  'capture.classified': 'Proposal ready — in the inbox',
  'capture.toProposal': 'See it in the inbox',

  /* No header pair any more: the inbox is not a screen of its own but the
     "unfiled" filter on Notes (story 006). `NotesScreen` owns the one
     `ScreenHeader`; the empty state below still belongs to the workspace
     (`UnfiledWorkspace`). */
  'screen.inbox.empty.title': 'The inbox is empty',
  'screen.inbox.empty.body':
    'Captured thoughts stay here until they have a home. For every dump the app proposes a target and says why.',
  'screen.inbox.empty.action': 'Capture a thought',
  'inbox.panelTitle': 'Sitting in the inbox',
  'inbox.count': '{count} dumps',
  'inbox.countOne': 'one dump',
  'inbox.age.today': 'captured today',
  'inbox.age.one': 'sitting here for a day',
  'inbox.age.days': 'sitting here for {count} days',
  'inbox.scope.open': 'Scope open',
  'inbox.words': '{count} words',
  'inbox.dump.more': 'Show more',
  'inbox.dump.less': 'Show less',

  'inbox.proposal.overline': 'Proposal',
  'inbox.proposal.confidence': 'Confidence {percent} %',
  'inbox.proposal.changed': 'Target chosen by you.',
  'inbox.proposal.heuristic': 'Sorted without a model — rules instead of understanding.',
  'inbox.proposal.section': 'Lands under',
  'inbox.proposal.exact': 'This is what gets written',
  'inbox.proposal.nothing': 'Nothing gets written — the dump stays put',
  'inbox.proposal.todos': 'Todos found',
  'inbox.proposal.waiting': 'Waiting on',
  'inbox.proposal.dueOf': 'Due date for “{text}”',
  'inbox.proposal.due': 'Due',
  'inbox.proposal.dueToday': 'today',
  'inbox.proposal.dueTomorrow': 'tomorrow',
  'inbox.proposal.duePick': 'Date …',
  'inbox.proposal.dueNone': 'no due date',
  'inbox.proposal.todoInto': 'into {target}',
  'inbox.proposal.pending': 'Building a proposal',

  'inbox.action.file': 'File it',
  'inbox.action.fileHint': 'files it',
  'inbox.action.other': 'Another target',
  'inbox.action.leave': 'Leave it here',
  'inbox.action.leaveHint': 'leaves it here',
  'inbox.action.discard': 'Discard',
  'inbox.discard.title': 'Discard this dump?',
  'inbox.discard.body': 'It moves to the trash. Undo stays available for ten seconds.',

  'inbox.undo.filed': 'Filed to',
  'inbox.undo.kept': 'Stays put — marked as kept on purpose.',
  'inbox.undo.discarded': 'Discarded.',
  'inbox.undo.more': 'and {count} more',
  'inbox.undo.action': 'Undo',

  'inbox.target.project': 'Project',
  'inbox.target.new-project': 'New project',
  'inbox.target.area': 'Area',
  'inbox.target.module': 'Module',
  'inbox.target.journal': 'Journal entry',
  'inbox.target.inbox': 'Stays in the inbox',
  'inbox.target.section': '→ section {section}',
  'inbox.picker.title': 'Another target',
  'inbox.picker.body': 'You pick from the targets that exist in the vault.',
  'inbox.picker.search': 'Search project, module or area',
  'inbox.picker.empty': 'No target matches that.',

  'inbox.status.raw': 'Untouched',
  'inbox.status.proposed': 'Proposal ready',
  'inbox.status.filed': 'Filed',
  'inbox.status.kept': 'Kept on purpose',
  'inbox.origin.window': 'Main window',
  'inbox.origin.quick-capture': 'Quick capture',
  'inbox.origin.chat': 'Conversation',
  'inbox.origin.clipboard': 'Clipboard',
  'inbox.origin.drop': 'Dropped in',
  'inbox.origin.cli': 'Command line',

  'screen.ask.overline': 'Look it up',
  'screen.ask.title': 'Ask',
  'screen.ask.empty.title': 'Ask Gaston',
  'screen.ask.empty.body':
    'Answers come from your own notes only, with a quote and a file path. If there is no evidence, the app says so.',
  'screen.ask.empty.action': 'Add a source',
  'ask.field.label': 'Your question',
  'ask.field.placeholder': 'What do I know about …?',
  'ask.field.hintSend': 'asks',
  'ask.field.hintBreak': 'adds a line break',
  'ask.field.hintEscape': 'leaves the field',
  'ask.action.send': 'Ask',
  'ask.action.cancel': 'Cancel',
  'ask.action.new': 'New question',
  'ask.filter.scope': 'Scope',
  'ask.filter.module': 'Module',
  'ask.filter.all': 'everything',
  'ask.filter.project': 'Project',
  'ask.filter.clear': 'Remove filter',

  'ask.turn.question': 'Question',
  'ask.turn.answer': 'Answer',
  'ask.thinking': 'Reading the passages',
  'ask.cancelled': 'Cancelled — the answer is incomplete and was not saved.',
  'ask.noEvidence': 'Nothing in the vault covers that.',
  'ask.noEvidenceHint': 'Try other words — or add the source first. Nothing is guessed here.',
  'ask.noModel': 'I cannot phrase an answer from this — here are the passages that match.',
  'ask.unsupported':
    'Parts of this answer could not be evidenced. Only what is listed below is checked.',

  'ask.citations.title': 'Evidence',
  'ask.citation.mark': 'Show evidence {index}',
  'ask.citation.show': 'See evidence {index} in context',
  'ask.citation.openPath': 'Open file: {path}',
  'ask.citation.of': 'Evidence {index} — {path}',
  'ask.citation.context': 'The passage in context',
  'ask.citation.openFile': 'Open file',
  'ask.citation.moved': 'This passage is no longer in the file — it has been changed since.',

  'ask.examples.title': 'Start here',
  'ask.example.module': 'What do I know about {title}?',
  'ask.example.project': 'What did I last work on in “{title}”?',
  'ask.example.waiting': 'What am I waiting for from {who}?',

  'ask.threads.title': 'Conversations',
  'ask.threads.search': 'Search the history',
  'ask.threads.empty': 'No conversation yet. The first question starts one.',
  'ask.threads.noMatch': 'No conversation matches that.',
  'ask.threads.open': 'Open conversation “{title}”',
  'ask.threads.delete': 'Delete conversation “{title}”',
  'ask.threads.deleteTitle': 'Delete conversation?',
  'ask.threads.deleteBody':
    'The history moves to the vault trash. Wiki pages you filed stay where they are.',
  'ask.threads.deleteConfirm': 'Delete',

  'ask.fileBack.action': 'File as wiki page',
  'ask.fileBack.title': 'File the answer as a wiki page',
  'ask.fileBack.body':
    'This is how a good question feeds the knowledge: the answer becomes a concept page with its evidence.',
  'ask.fileBack.module': 'Module',
  'ask.fileBack.newModule': 'Create a new module',
  'ask.fileBack.newModuleName': 'Name of the new module',
  'ask.fileBack.newModulePlaceholder': 'Identity management',
  'ask.fileBack.pageTitle': 'Page title',
  'ask.fileBack.preview':
    'A new concept page will be written in module “{module}”, plus an entry in the catalogue and in the chronicle. {count} pieces of evidence come along.',
  'ask.fileBack.confirm': 'File it',
  'ask.fileBack.done': 'Filed in',

  'screen.projects.overline': 'Work and private',
  'screen.projects.title': 'Projects',
  'screen.projects.empty.title': 'No project in the vault yet',
  'screen.projects.empty.body':
    'A project keeps status, next step, todos and waiting-for in one place — the way back in after a break.',
  'screen.projects.empty.action': 'New project',
  'projects.count': '{count} projects',
  'projects.countOne': 'one project',
  'projects.nextStep': 'Next step',
  'projects.noNextStep': 'No next step set.',
  'projects.todos': '{open} of {total} open',
  'projects.noTodos': 'no todos',
  'projects.stale': 'Stalled',
  'projects.deadline': 'Due {date}',
  'projects.waiting': 'Waiting for {who}',

  'screen.journal.overline': 'One day, one entry',
  'screen.journal.title': 'Journal',
  'screen.journal.empty.title': 'No journal entry in the vault yet',
  'screen.journal.empty.body':
    'One day is one file. Plus a conversation when you feel like talking, and a wrap-up that proposes facts and todos.',
  'screen.journal.empty.action': 'Start the day',
  /* The texts of the screen itself live in `en-journal.ts`. */

  'screen.notes.overline': 'Thoughts on their own',
  'screen.notes.title': 'Notes',
  'screen.notes.empty.title': 'No note in the vault yet',
  'screen.notes.empty.body':
    'A note is a thought that stands on its own — no area, no project needed first. Write the first one and an area appears automatically.',
  'screen.notes.empty.action': 'Write your first note',
  /* The texts of the screen itself live in `en-notes.ts`. */

  'screen.knowledge.overline': 'Modules and sources',
  'screen.knowledge.title': 'Knowledge',
  'screen.knowledge.empty.title': 'No knowledge module in the vault yet',
  'screen.knowledge.empty.body':
    'A module is a small wiki: sources, terms and connections on one topic, every claim with evidence.',
  'screen.knowledge.empty.action': 'New module',
  'screen.sources.overline': 'Ingest',
  'screen.sources.title': 'Sources',
  'screen.sources.empty.title': 'No raw source in the vault yet',
  'screen.sources.empty.body':
    'Videos, files and web pages land immutably in raw/ and are distilled into wiki pages from there.',
  'screen.sources.empty.action': 'Add a source',
  'screen.garden.overline': 'Keep your knowledge healthy',
  'screen.garden.title': 'Knowledge Care',
  'screen.garden.empty.title': 'No check yet',
  'screen.garden.empty.body':
    'The check finds orphan pages, broken links, undistilled sources and projects without a next step.',
  'screen.garden.empty.action': 'Start check',

  /* The texts of the screen itself (switch, empty and off states) live in
     `en-agents.ts` — the header pair sits here, like every other screen.
     The view hangs under Projects since story 008, so the header says where
     you are: "Projects · Agent sessions". The key names stay `screen.agents.*`
     — only the rail entry went, the family kept its name. */
  'screen.agents.overline': 'Projects',
  'screen.agents.title': 'Agent sessions',

  /* Not “Behaviour”: that is one of the tabs — as an overline it would read as if
     that tab were open. */
  'screen.settings.overline': 'Setup',
  'screen.settings.title': 'Settings',
  'screen.settings.empty.title': 'Settings to come',
  'screen.settings.empty.body':
    'Languages, providers and models, task routing, vault and behaviour are set up here.',
  'screen.settings.empty.action': 'Choose a vault',
  'screen.settings.pending.title': 'The settings are next',
  'screen.settings.pending.body':
    'Planned: interface and document language, providers and models, task routing, and switching vaults.',
  'settings.vault': 'Vault',
  'settings.vaultOpen': 'Open another vault',

  'onboarding.overline': 'First step',
  'onboarding.title': 'Welcome',
  'onboarding.what.title': 'What is a vault?',
  'onboarding.what.body':
    'A vault is an ordinary folder of Markdown files. It belongs to you: open it in Obsidian or VS Code, version it with Git, copy it onto a USB stick. This app files things there, sorts them and makes them findable — the files stay the truth.',
  'onboarding.open': 'Open a vault',
  'onboarding.openHint': 'Pick the folder your vault already lives in.',
  'onboarding.createSection': 'No vault yet?',
  'onboarding.createStart': 'Create a new vault',
  'onboarding.create': 'Choose a folder and create',
  'onboarding.createCancel': 'Cancel',
  'onboarding.nameLabel': 'Name of the new vault',
  'onboarding.namePlaceholder': 'My vault',
  'onboarding.nameHint':
    'The name shows up in the title bar later. You pick the folder in the next step — it should be empty, the app creates the structure.',
  'onboarding.recent': 'Opened recently',
  'onboarding.missing': 'not found',

  'quickCapture.title': 'Quick capture',
  'quickCapture.placeholder': 'What has been on your mind?',
  'quickCapture.hint': 'saves, Esc closes',
  'quickCapture.savedTo': 'Saved to',
  'quickCapture.undo': 'Undo',
  'quickCapture.ask': 'Discard this draft?',
  'quickCapture.keep': 'Keep writing',
  'quickCapture.drop': 'Discard',
  'quickCapture.noVault': 'No vault is open — your text stays here as a draft.',
  'quickCapture.toMain': 'Show the main window',
};
