/* English UI texts for the agent screen. Same key set as `de-agent-screen.ts` —
   enforced by tests/renderer/i18n.test.ts. Sentence case, no emoji. */

export const enAgentScreen = {
  'screen.agent.overline': 'Claude Code in the vault',
  'screen.agent.title': 'Agent',
  'agent.open': 'Open Claude in the vault',

  'agent.notice.install': 'The agent setup is not installed yet.',
  'agent.notice.update': 'An update is available for the agent setup.',
  'agent.notice.open': 'Go to agent settings',

  'agent.commands.title': 'Commands',
  'agent.commands.intro':
    'The button above opens a terminal with claude running in the vault. Type these commands there.',
  'agent.commands.gaston': 'From Gaston',
  'agent.commands.claude': 'From Claude Code',
  'agent.commands.curateArg': '<module>',
  'agent.commands.curate':
    "Curates one module's wiki: checks its pages, fixes them directly in its wiki/ and adds every change to wiki/log.md.",
  'agent.commands.modules': 'Modules in this vault:',
  'agent.commands.propose':
    'Writes a proposal for a change outside a module wiki to {dir}/. Nothing is applied; you decide.',
  'agent.commands.jobs':
    'Works through the open jobs in {dir}/ and writes one result per job. This version of Gaston does not create jobs yet.',
  'agent.commands.model': 'Picks the model for this session.',
  'agent.commands.help': 'Lists every command Claude Code knows.',
} as const;
