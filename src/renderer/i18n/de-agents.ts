/* German UI texts for the agent session browser (story 001): the
   Claude/Codex switch and the screen's honest states. The header pair
   (`screen.agents.overline`/`.title`) lives in `de-screens.ts`, like every
   other screen — this file carries the rest.

   D11 built the switch and the four states (loading, error, off, empty);
   D12 added the project list's keys; D13 adds the project detail's session
   rows below. `{agent}` is always one of `agents.switch.claude` /
   `agents.switch.codex`, interpolated by the caller — one off/empty text
   instead of four near-identical ones. */

export const deAgents = {
  'agents.switch.label': 'Agent wählen',
  'agents.switch.claude': 'Claude Code',
  'agents.switch.codex': 'Codex',

  'agents.off.title': 'Mitlesen ist ausgeschaltet',
  'agents.off.body':
    'Das Mitlesen der {agent}-Sitzungen ist in den Einstellungen ausgeschaltet. Einschalten, um die Projekte hier zu sehen.',
  'agents.off.action': 'Einschalten',

  'agents.empty.title': 'Noch keine Sitzung von {agent}',
  'agents.empty.body':
    'Sobald {agent} in einem Arbeitsverzeichnis läuft, erscheinen dessen Projekte hier.',

  'agents.missingDir.title': 'Verzeichnis nicht gefunden',
  'agents.missingDir.body':
    'Das für {agent} eingestellte Verzeichnis gibt es nicht: {path}. Den Pfad in den Einstellungen korrigieren oder leeren, um den Standardort zu verwenden.',
  'agents.missingDir.action': 'Einstellungen öffnen',

  'agents.projects.open': 'Projekt {name} öffnen',
  'agents.projects.sessions': '{count} Sitzungen',
  'agents.projects.sessionsOne': 'eine Sitzung',
  'agents.projects.lastActivity': 'zuletzt aktiv {time}',
  'agents.projects.firstActivity': 'seit {date}',
  'agents.projects.vaultProject': 'verknüpft mit {project}',

  // D13: Projektdetail — die Sitzungen eines Projekts.
  'agents.detail.back': 'Alle Projekte',
  'agents.detail.notFound.title': 'Projekt nicht gefunden',

  // Ein Arbeitsverzeichnis einem Vault-Projekt zuordnen (AC8).
  'agents.link.action': 'Vault-Projekt zuordnen',
  'agents.link.for': 'Projekt „{name}" einem Vault-Projekt zuordnen',
  'agents.link.done': 'Arbeitsverzeichnis dem Projekt „{name}" zugeordnet',
  'agents.link.hint': 'Das Arbeitsverzeichnis steht jetzt in „repos" des Projekts.',
  'agents.link.failed': 'Die Zuordnung konnte nicht geschrieben werden.',

  'agents.sessions.empty': 'Für dieses Projekt sind (noch) keine Sitzungen erfasst.',
  'agents.sessions.open': 'Sitzung {title} öffnen',
  'agents.sessions.start': 'begonnen {time}',
  'agents.sessions.lastActivity': 'zuletzt aktiv {time}',
  'agents.sessions.duration': 'Dauer {duration}',
  'agents.sessions.durationUnknown': 'Dauer unbekannt',
  'agents.sessions.messages': '{count} Nachrichten',
  'agents.sessions.branch': 'Branch {branch}',
  'agents.sessions.branchUnknown': 'Branch unbekannt',
  'agents.sessions.model': 'Modell {model}',
  'agents.sessions.modelUnknown': 'Modell unbekannt',
  'agents.sessions.subagents': '{count} Subagenten',
  'agents.sessions.subagentsOne': 'ein Subagent',
  'agents.sessions.subagentsNone': 'keine Subagenten',
  'agents.sessions.subagentsUnknown': 'Subagenten unbekannt',
  'agents.sessions.context': '{count} Tokens Kontext',
  'agents.sessions.contextUnknown': 'Kontextgröße unbekannt',

  // D14: Transkript — der Gesprächsverlauf einer einzelnen Sitzung.
  'agents.transcript.back': 'Zurück zu den Sitzungen',
  'agents.transcript.session': 'Sitzung {id}',
  'agents.transcript.you': 'Du',
  'agents.transcript.empty': 'Für diese Sitzung sind keine Nachrichten erfasst.',
  'agents.transcript.loadMore': 'Mehr laden',
  'agents.transcript.end': 'Ende des Verlaufs',
  'agents.transcript.toolCall': 'Werkzeugaufruf {name}',
  'agents.transcript.toolResult': 'Werkzeugergebnis',
  'agents.transcript.toolNameUnknown': 'unbekanntes Werkzeug',
  'agents.transcript.toolTargetUnknown': 'kein Ziel',
} as const;
