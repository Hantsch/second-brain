/* English UI texts for the agent session browser (story 001). Same key set
   as `de-agents.ts` — enforced by tests/renderer/i18n.test.ts. See that file
   for the `{agent}` interpolation convention. */

export const enAgents = {
  'agents.switch.label': 'Choose agent',
  'agents.switch.claude': 'Claude Code',
  'agents.switch.codex': 'Codex',

  'agents.off.title': 'Reading is switched off',
  'agents.off.body':
    'Reading {agent} sessions is switched off in the settings. Turn it on to see its projects here.',
  'agents.off.action': 'Switch on',

  'agents.empty.title': 'No session from {agent} yet',
  'agents.empty.body': 'Once {agent} runs in a working directory, its projects appear here.',

  'agents.missingDir.title': 'Directory not found',
  'agents.missingDir.body':
    'The directory configured for {agent} does not exist: {path}. Correct the path in the settings, or clear it to use the default location.',
  'agents.missingDir.action': 'Open settings',

  'agents.projects.open': 'Open project {name}',
  'agents.projects.sessions': '{count} sessions',
  'agents.projects.sessionsOne': 'one session',
  'agents.projects.lastActivity': 'last active {time}',
  'agents.projects.firstActivity': 'since {date}',
  'agents.projects.vaultProject': 'linked to {project}',

  /* Story 008: dismissing an agent project that maps to nothing in the vault.
     Only unlinked projects can be dismissed, so there is no text here for a
     linked one — it never gets a control. */
  'agents.dismiss.action': 'Dismiss project {name}',
  'agents.dismiss.undo': 'Show project {name} again',
  'agents.dismiss.marker': 'dismissed',
  'agents.dismiss.hidden': '{count} projects hidden',
  'agents.dismiss.hiddenOne': 'one project hidden',
  'agents.dismiss.allHidden': 'Every project of this agent is dismissed.',
  'agents.dismiss.showAll': 'Show all',
  'agents.dismiss.hideAgain': 'Hide dismissed again',
  'agents.dismiss.failed': 'The dismissed projects could not be saved.',

  /* Story 008: the view hangs under Projects, so it needs a way back up.
     "All projects" below is the panel's own way back inside the agent's
     project list — a different destination, hence a different text. */
  'agents.sessions.backToProjects': 'Back to projects',

  // D13: project detail — the sessions of one project.
  'agents.detail.back': 'All projects',
  'agents.detail.notFound.title': 'Project not found',

  // Linking a working directory to a vault project (AC8).
  'agents.link.action': 'Link a vault project',
  'agents.link.for': 'Link project “{name}” to a vault project',
  'agents.link.done': 'Working directory linked to “{name}”',
  'agents.link.hint': 'The working directory now sits in the project’s “repos”.',
  'agents.link.failed': 'The link could not be written.',

  'agents.sessions.empty': 'No sessions recorded for this project (yet).',
  'agents.sessions.open': 'Open session {title}',
  'agents.sessions.start': 'started {time}',
  'agents.sessions.lastActivity': 'last active {time}',
  'agents.sessions.duration': 'duration {duration}',
  'agents.sessions.durationUnknown': 'duration unknown',
  'agents.sessions.messages': '{count} messages',
  'agents.sessions.branch': 'branch {branch}',
  'agents.sessions.branchUnknown': 'branch unknown',
  'agents.sessions.model': 'model {model}',
  'agents.sessions.modelUnknown': 'model unknown',
  'agents.sessions.subagents': '{count} subagents',
  'agents.sessions.subagentsOne': 'one subagent',
  'agents.sessions.subagentsNone': 'no subagents',
  'agents.sessions.subagentsUnknown': 'subagents unknown',
  'agents.sessions.context': '{count} tokens context',
  'agents.sessions.contextUnknown': 'context size unknown',

  // D14: transcript — the course of a single session.
  'agents.transcript.back': 'Back to sessions',
  'agents.transcript.session': 'Session {id}',
  'agents.transcript.you': 'You',
  'agents.transcript.empty': 'No messages recorded for this session.',
  'agents.transcript.loadMore': 'Load more',
  'agents.transcript.end': 'End of transcript',
  'agents.transcript.toolCall': 'Tool call {name}',
  'agents.transcript.toolResult': 'Tool result',
  'agents.transcript.toolNameUnknown': 'unknown tool',
  'agents.transcript.toolTargetUnknown': 'no target',
} as const;
