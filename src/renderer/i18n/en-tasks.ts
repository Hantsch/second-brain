/* English UI texts for the tasks screen. Same key set as `de-tasks.ts` —
   enforced by tests/renderer/i18n.test.ts. Sentence case, no emoji. */

export const enTasks = {
  'screen.tasks.overline': 'What is due',
  'screen.tasks.title': 'Tasks',
  'screen.tasks.empty.title': 'No task in sight yet',
  'screen.tasks.empty.body':
    'Tasks start in a project, a day, or an area — never here. Once some are open, they show up in this place.',

  // ── The three groups (story 072, D4) ─────────────────────────────────────
  'tasks.group.running': 'Running',
  'tasks.group.waiting': 'Waiting',
  'tasks.group.finished': 'Finished',
  'tasks.group.agent': 'With the agent',

  'tasks.kind.condense': 'Condense',
  'tasks.kind.close-day': 'Close day',
  'tasks.kind.gardener': 'Maintenance',
  'tasks.kind.ingest': 'Take in source',
  'tasks.kind.interview-plan': 'Interview plan',

  'tasks.outcome.done': 'Done',
  'tasks.outcome.failed': 'Failed',
  'tasks.outcome.cancelled': 'Cancelled',

  'tasks.waiting.position': 'Queue position {position}',
  'tasks.row.progress': 'Progress for {subject}',
  'tasks.row.model': 'Model: {model}',

  'tasks.action.stop': 'Stop',
  'tasks.action.remove': 'Remove',
  'tasks.action.retry': 'Retry',
  'tasks.action.viewResult': 'View result',

  // ── The agent's jobs (story 090) ─────────────────────────────────────────
  'tasks.agent.kind.condense-source': 'Condense source',
  'tasks.agent.state.skipped': 'Skipped',
  'tasks.agent.state.withdrawn': 'Withdrawn',
  'tasks.agent.reason': 'Reason: {reason}',
} as const;
