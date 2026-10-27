/* German strings for the Agent tab's Last run section. Same key set as `en-settings-agent.ts`. */

export const deSettingsAgent = {
  'settings.agent.lastRun.title': 'Letzter Lauf',
  'settings.agent.lastRun.loading': 'Letzter Lauf wird gelesen',
  'settings.agent.lastRun.error': 'Der letzte Lauf ließ sich nicht lesen: {reason}',
  'settings.agent.lastRun.none': 'Noch kein Agent-Lauf.',
  'settings.agent.lastRun.finished': 'Beendet',
  'settings.agent.lastRun.skill': 'Skill',
  'settings.agent.lastRun.pages': 'Geänderte Seiten',
  'settings.agent.lastRun.proposals': 'Geschriebene Vorschläge',
  'settings.agent.lastRun.jobsDone': 'Erledigte Aufträge',
  'settings.agent.lastRun.jobsFailed': 'Fehlgeschlagene Aufträge',
  'settings.agent.lastRun.jobsSkipped': 'Übersprungene Aufträge',
  'settings.agent.lastRun.unreadable': 'Der Bericht des letzten Laufs lässt sich nicht lesen.',
  'settings.agent.lastRun.reason': 'Grund',
  'settings.agent.lastRun.waitingOne': '1 Vorschlag wartet in Pflege',
  'settings.agent.lastRun.waiting': '{count} Vorschläge warten in Pflege',
} as const;

export type SettingsAgentKey = keyof typeof deSettingsAgent;
