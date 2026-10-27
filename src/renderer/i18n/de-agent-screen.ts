/* German UI texts for the agent screen: header, setup notice and the commands panel.
   The terminal toasts keep their `rail.agent.*` keys. Same key set as
   `en-agent-screen.ts`. */

export const deAgentScreen = {
  'screen.agent.overline': 'Claude Code im Vault',
  'screen.agent.title': 'Agent',
  'agent.open': 'Claude im Vault öffnen',

  'agent.notice.install': 'Die Agent-Einrichtung ist noch nicht installiert.',
  'agent.notice.update': 'Für die Agent-Einrichtung gibt es ein Update.',
  'agent.notice.open': 'Zu den Agent-Einstellungen',

  'agent.commands.title': 'Befehle',
  'agent.commands.intro':
    'Der Knopf oben öffnet ein Terminal, in dem claude im Vault läuft. Diese Befehle tippst du dort ein.',
  'agent.commands.gaston': 'Von Gaston',
  'agent.commands.claude': 'Von Claude Code',
  'agent.commands.curateArg': '<modul>',
  'agent.commands.curate':
    'Pflegt das Wiki eines Moduls: prüft die Seiten, korrigiert direkt in dessen wiki/ und trägt jede Änderung in wiki/log.md ein.',
  'agent.commands.modules': 'Module in diesem Vault:',
  'agent.commands.propose':
    'Schreibt einen Vorschlag für eine Änderung außerhalb eines Modul-Wikis nach {dir}/. Angewendet wird nichts, du entscheidest.',
  'agent.commands.jobs':
    'Arbeitet die offenen Jobs aus {dir}/ ab und schreibt je Job ein Ergebnis. Gaston legt in dieser Version noch keine Jobs an.',
  'agent.commands.model': 'Wählt das Modell für diese Sitzung.',
  'agent.commands.help': 'Listet alle Befehle, die Claude Code kennt.',
} as const;
